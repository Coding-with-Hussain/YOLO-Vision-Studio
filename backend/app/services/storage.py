"""Filesystem layout, streaming uploads and retention cleanup.

Layout under ``storage/``::

    weights/<model_id>.pt          uploaded checkpoints
    uploads/<job_id>/input.<ext>   source videos (kept for ``upload_retention_hours``)
    outputs/<entry_id>/...         annotated images, thumbnails, output videos

Only server-generated ids are ever joined into paths and API responses never
contain filesystem paths.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import NotFoundError, PayloadTooLarge, ValidationFailed
from app.core.utils import is_valid_id, now_iso, parse_iso, utcnow
from app.schemas.settings import CleanupResult, StorageArea, StorageStatus
from app.services.database import Database
from app.services.runtime_settings import RuntimeSettingsStore

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1024 * 1024
LAST_CLEANUP_KEY = "last_cleanup_at"


async def save_upload(upload: UploadFile, destination: Path, max_bytes: int) -> int:
    """Stream ``upload`` to ``destination`` enforcing ``max_bytes``. Returns the size."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")
    written = 0
    try:
        with partial.open("wb") as handle:
            while chunk := await upload.read(CHUNK_SIZE):
                written += len(chunk)
                if written > max_bytes:
                    raise PayloadTooLarge(
                        f"The file exceeds the maximum upload size of {max_bytes // (1024 * 1024)} MB.",
                        details={"max_bytes": max_bytes},
                    )
                handle.write(chunk)
        if written == 0:
            raise ValidationFailed("The uploaded file is empty.", code="EMPTY_FILE")
        partial.replace(destination)
        return written
    except BaseException:
        partial.unlink(missing_ok=True)
        raise


def _tree_stats(path: Path) -> tuple[int, int]:
    count = size = 0
    if not path.exists():
        return 0, 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            if name == ".gitkeep":
                continue
            try:
                size += (Path(root) / name).stat().st_size
                count += 1
            except OSError:
                continue
    return count, size


class StorageService:
    def __init__(self, settings: Settings, db: Database, runtime: RuntimeSettingsStore) -> None:
        self.settings = settings
        self.db = db
        self.runtime = runtime

    # Paths --------------------------------------------------------------
    def output_dir(self, entry_id: str) -> Path:
        if not is_valid_id(entry_id):
            raise NotFoundError("Not found.")
        return self.settings.outputs_dir / entry_id

    def upload_dir(self, entry_id: str) -> Path:
        if not is_valid_id(entry_id):
            raise NotFoundError("Not found.")
        return self.settings.uploads_dir / entry_id

    def temp_model_path(self, token: str) -> Path:
        return self.settings.weights_dir / f".incoming-{token}.pt"

    def remove_entry_files(self, entry_id: str) -> int:
        freed = 0
        for directory in (self.output_dir(entry_id), self.upload_dir(entry_id)):
            if directory.exists():
                freed += _tree_stats(directory)[1]
                shutil.rmtree(directory, ignore_errors=True)
        return freed

    # Status -------------------------------------------------------------
    def status(self) -> StorageStatus:
        runtime = self.runtime.get()
        areas = []
        for name, path in (
            ("weights", self.settings.weights_dir),
            ("uploads", self.settings.uploads_dir),
            ("outputs", self.settings.outputs_dir),
        ):
            count, size = _tree_stats(path)
            areas.append(
                StorageArea(
                    name=name,  # type: ignore[arg-type]
                    exists=path.exists(),
                    writable=path.exists() and os.access(path, os.W_OK),
                    file_count=count,
                    size_bytes=size,
                )
            )
        return StorageStatus(
            areas=areas,
            total_size_bytes=sum(a.size_bytes for a in areas),
            output_retention_hours=runtime.output_retention_hours,
            upload_retention_hours=runtime.upload_retention_hours,
            cleanup_interval_minutes=runtime.cleanup_interval_minutes,
            last_cleanup_at=self.db.get_meta(LAST_CLEANUP_KEY),
        )

    # Cleanup ------------------------------------------------------------
    def cleanup(self, active_job_ids: set[str] | None = None) -> CleanupResult:
        """Apply the retention policy. Files of running jobs are never touched."""
        active = active_job_ids or set()
        runtime = self.runtime.get()
        now = utcnow()
        removed = freed = expired_entries = 0

        # 1. Expire outputs of finished entries past their retention.
        rows = self.db.query(
            "SELECT id, expires_at FROM history WHERE files_expired = 0 AND expires_at IS NOT NULL "
            "AND status NOT IN ('queued', 'running')"
        )
        for row in rows:
            if row["id"] in active:
                continue
            try:
                expired = parse_iso(row["expires_at"]) <= now
            except ValueError:
                expired = True
            if expired:
                count = sum(_tree_stats(d)[0] for d in (self.output_dir(row["id"]), self.upload_dir(row["id"])))
                freed += self.remove_entry_files(row["id"])
                removed += count
                self.db.execute("UPDATE history SET files_expired = 1 WHERE id = ?", (row["id"],))
                expired_entries += 1

        # 2. Source uploads have their own (usually shorter) retention.
        if self.settings.uploads_dir.exists():
            for directory in self.settings.uploads_dir.iterdir():
                if not directory.is_dir() or directory.name in active:
                    continue
                age_h = (now.timestamp() - directory.stat().st_mtime) / 3600
                if age_h >= runtime.upload_retention_hours:
                    count, size = _tree_stats(directory)
                    shutil.rmtree(directory, ignore_errors=True)
                    removed += count
                    freed += size

        # 3. Orphaned output directories (no history entry).
        known = {r["id"] for r in self.db.query("SELECT id FROM history")}
        for base in (self.settings.outputs_dir,):
            if not base.exists():
                continue
            for directory in base.iterdir():
                if directory.is_dir() and directory.name not in known and directory.name not in active:
                    count, size = _tree_stats(directory)
                    shutil.rmtree(directory, ignore_errors=True)
                    removed += count
                    freed += size

        # 4. Stale partial model uploads.
        for partial in self.settings.weights_dir.glob(".incoming-*"):
            if (now.timestamp() - partial.stat().st_mtime) > 3600:
                partial.unlink(missing_ok=True)
                removed += 1

        # 5. Trim the history table to the configured size.
        trimmed = 0
        total = self.db.query_one("SELECT COUNT(*) AS n FROM history")["n"]
        overflow = total - runtime.history_max_entries
        if overflow > 0:
            old = self.db.query(
                "SELECT id FROM history WHERE status NOT IN ('queued', 'running') "
                "ORDER BY created_at ASC LIMIT ?",
                (overflow,),
            )
            for row in old:
                freed += self.remove_entry_files(row["id"])
                self.db.execute("DELETE FROM history WHERE id = ?", (row["id"],))
                trimmed += 1

        ran_at = now_iso()
        self.db.set_meta(LAST_CLEANUP_KEY, ran_at)
        if removed or trimmed:
            logger.info("Cleanup removed %d files (%d bytes), trimmed %d history entries", removed, freed, trimmed)
        return CleanupResult(
            removed_files=removed,
            freed_bytes=freed,
            expired_history_entries=expired_entries,
            trimmed_history_entries=trimmed,
            ran_at=ran_at,
        )
