"""Backend-persisted history of image, video and live inference runs."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from app.core.errors import NotFoundError
from app.core.utils import is_valid_id, to_iso, utcnow
from app.models.records import HistoryRecord
from app.schemas.history import (
    DailyCount,
    HistoryArtifacts,
    HistoryDetail,
    HistoryItem,
    HistoryListResponse,
    StatsResponse,
)
from app.services.database import Database
from app.services.storage import StorageService

SORT_COLUMNS = {
    "created_at": "created_at",
    "duration": "duration_ms",
    "detections": "num_detections",
    "name": "source_name",
}

# Artifact key -> (URL builder, storage area)
ARTIFACT_URLS = {
    "annotated": ("annotated_url", "/api/results/{id}/annotated", "outputs"),
    "original": ("original_url", "/api/results/{id}/original", "outputs"),
    "thumbnail": ("thumbnail_url", "/api/results/{id}/thumbnail", "outputs"),
    "output": ("output_url", "/api/jobs/{id}/output", "outputs"),
    "input": ("input_url", "/api/jobs/{id}/input", "uploads"),
}


class HistoryService:
    def __init__(self, db: Database, storage: StorageService) -> None:
        self.db = db
        self.storage = storage

    # Writes -------------------------------------------------------------
    def upsert(self, record: HistoryRecord) -> None:
        self.db.execute(
            """
            INSERT INTO history (id, kind, status, source_name, model_id, model_name, task,
                num_detections, duration_ms, avg_inference_ms, created_at, completed_at, params,
                summary, artifacts, error, error_code, expires_at, files_expired)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status, num_detections = excluded.num_detections,
                duration_ms = excluded.duration_ms, avg_inference_ms = excluded.avg_inference_ms,
                completed_at = excluded.completed_at, params = excluded.params,
                summary = excluded.summary, artifacts = excluded.artifacts, error = excluded.error,
                error_code = excluded.error_code, expires_at = excluded.expires_at,
                files_expired = excluded.files_expired
            """,
            (
                record.id,
                record.kind,
                record.status,
                record.source_name,
                record.model_id,
                record.model_name,
                record.task,
                record.num_detections,
                record.duration_ms,
                record.avg_inference_ms,
                record.created_at,
                record.completed_at,
                json.dumps(record.params, default=str),
                json.dumps(record.summary, default=str),
                json.dumps(record.artifacts),
                record.error,
                record.error_code,
                record.expires_at,
                int(record.files_expired),
            ),
        )

    def delete(self, entry_id: str) -> None:
        self.get_record(entry_id)
        self.storage.remove_entry_files(entry_id)
        self.db.execute("DELETE FROM history WHERE id = ?", (entry_id,))

    def delete_all(self, exclude: set[str]) -> int:
        rows = self.db.query("SELECT id FROM history")
        removed = 0
        for row in rows:
            if row["id"] in exclude:
                continue
            self.storage.remove_entry_files(row["id"])
            self.db.execute("DELETE FROM history WHERE id = ?", (row["id"],))
            removed += 1
        return removed

    def mark_interrupted(self) -> None:
        """Jobs that were running when the server stopped can never finish."""
        self.db.execute(
            "UPDATE history SET status = 'failed', error = ?, error_code = 'INTERRUPTED' "
            "WHERE status IN ('queued', 'running')",
            ("The backend restarted before this job finished.",),
        )

    # Reads --------------------------------------------------------------
    def get_record(self, entry_id: str) -> HistoryRecord:
        if not is_valid_id(entry_id):
            raise NotFoundError("History entry not found.", code="HISTORY_NOT_FOUND")
        row = self.db.query_one("SELECT * FROM history WHERE id = ?", (entry_id,))
        if row is None:
            raise NotFoundError("History entry not found.", code="HISTORY_NOT_FOUND")
        return HistoryRecord.from_row(row)

    def artifact_path(self, record: HistoryRecord, key: str):
        filename = record.artifacts.get(key)
        if not filename or record.files_expired:
            return None
        area = ARTIFACT_URLS[key][2]
        base = self.storage.output_dir(record.id) if area == "outputs" else self.storage.upload_dir(record.id)
        path = base / filename
        return path if path.is_file() else None

    def artifacts(self, record: HistoryRecord) -> HistoryArtifacts:
        values: dict[str, str | None] = {}
        for key, (field, template, _area) in ARTIFACT_URLS.items():
            values[field] = template.format(id=record.id) if self.artifact_path(record, key) else None
        return HistoryArtifacts(**values)

    def _files_expired(self, record: HistoryRecord) -> bool:
        if record.files_expired:
            return True
        # Files were produced but none of them exists anymore.
        return bool(record.artifacts) and not any(self.artifact_path(record, k) for k in record.artifacts)

    def to_item(self, record: HistoryRecord) -> HistoryItem:
        return HistoryItem(
            id=record.id,
            kind=record.kind,  # type: ignore[arg-type]
            status=record.status,  # type: ignore[arg-type]
            source_name=record.source_name,
            model_id=record.model_id,
            model_name=record.model_name,
            task=record.task,
            num_detections=record.num_detections,
            duration_ms=record.duration_ms,
            avg_inference_ms=record.avg_inference_ms,
            created_at=record.created_at,
            completed_at=record.completed_at,
            error=record.error,
            files_expired=self._files_expired(record),
            expires_at=record.expires_at,
            artifacts=self.artifacts(record),
            class_counts=record.summary.get("class_counts", {}),
        )

    def to_detail(self, record: HistoryRecord) -> HistoryDetail:
        return HistoryDetail(**self.to_item(record).model_dump(), params=record.params, summary=record.summary)

    def list(
        self,
        *,
        q: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> HistoryListResponse:
        where: list[str] = []
        params: list[Any] = []
        if q:
            where.append("(source_name LIKE ? OR model_name LIKE ?)")
            like = f"%{q}%"
            params += [like, like]
        if kind:
            where.append("kind = ?")
            params.append(kind)
        if status:
            where.append("status = ?")
            params.append(status)
        if date_from:
            where.append("created_at >= ?")
            params.append(date_from)
        if date_to:
            where.append("created_at <= ?")
            params.append(date_to)
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        column = SORT_COLUMNS.get(sort, "created_at")
        direction = "ASC" if order.lower() == "asc" else "DESC"
        total = self.db.query_one(f"SELECT COUNT(*) AS n FROM history {clause}", params)["n"]
        rows = self.db.query(
            f"SELECT * FROM history {clause} ORDER BY {column} {direction}, created_at DESC LIMIT ? OFFSET ?",
            [*params, limit, offset],
        )
        items = [self.to_item(HistoryRecord.from_row(r)) for r in rows]
        return HistoryListResponse(items=items, total=total, limit=limit, offset=offset)

    def stats(self, days: int = 14) -> StatsResponse:
        totals = self.db.query_one(
            """
            SELECT
                COALESCE(SUM(CASE WHEN status = 'completed' THEN num_detections ELSE 0 END), 0) AS detections,
                COALESCE(SUM(CASE WHEN kind = 'image' AND status = 'completed' THEN 1 ELSE 0 END), 0) AS images,
                COALESCE(SUM(CASE WHEN kind = 'video' AND status = 'completed' THEN 1 ELSE 0 END), 0) AS videos,
                COALESCE(SUM(CASE WHEN kind = 'live' AND status = 'completed' THEN 1 ELSE 0 END), 0) AS live
            FROM history
            """
        )
        avg = self.db.query_one(
            "SELECT AVG(avg_inference_ms) AS avg FROM history "
            "WHERE status = 'completed' AND avg_inference_ms IS NOT NULL"
        )["avg"]

        start = (utcnow() - timedelta(days=days - 1)).date()
        rows = self.db.query(
            "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS jobs, "
            "COALESCE(SUM(num_detections), 0) AS detections FROM history "
            "WHERE status = 'completed' AND created_at >= ? GROUP BY day",
            (to_iso(utcnow() - timedelta(days=days)),),
        )
        by_day = {r["day"]: r for r in rows}
        daily = []
        for offset in range(days):
            day = (start + timedelta(days=offset)).isoformat()
            row = by_day.get(day)
            daily.append(
                DailyCount(date=day, jobs=row["jobs"] if row else 0, detections=row["detections"] if row else 0)
            )

        class_totals: dict[str, int] = {}
        for row in self.db.query("SELECT summary FROM history WHERE status = 'completed'"):
            counts = json.loads(row["summary"] or "{}").get("class_counts", {})
            for name, count in counts.items():
                class_totals[name] = class_totals.get(name, 0) + int(count)
        top = sorted(class_totals.items(), key=lambda kv: -kv[1])[:8]

        return StatsResponse(
            total_detections=totals["detections"],
            images_processed=totals["images"],
            videos_processed=totals["videos"],
            live_sessions=totals["live"],
            avg_inference_ms=round(avg, 2) if avg is not None else None,
            daily=daily,
            top_classes=[{"name": n, "count": c} for n, c in top],
        )
