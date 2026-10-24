"""Registry of uploaded YOLO checkpoints and the instances loaded in memory.

Model switching policy
----------------------
* Exactly one model is *active*. Image and live requests use the active model
  unless they name another one explicitly.
* Loading a model makes it active. Up to ``max_loaded_models`` instances stay
  in memory (least recently used first out, the active model is never evicted)
  so switching back and forth is cheap.
* Video jobs pin the instance they started with. Switching the active model
  never changes a running job, and a model that is used by a running job
  cannot be deleted (HTTP 409) until the job finishes or is cancelled.
* Every prediction on an instance happens under that instance's lock because
  Ultralytics predictors keep per-call state and are not thread safe.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import threading
import time
from collections import Counter, OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import Settings
from app.core.errors import (
    ConflictError,
    ModelLoadError,
    ModelNotLoaded,
    NotFoundError,
    UnsafeModelError,
)
from app.core.utils import display_filename, is_valid_id, new_id, now_iso
from app.models.records import ModelRecord
from app.schemas.models import ModelInfo
from app.services.database import Database
from app.services.devices import DeviceManager
from app.services.model_security import CheckpointRejected, scan_checkpoint

logger = logging.getLogger(__name__)

# Tasks whose results contain bounding boxes. Classification models are
# rejected because the detection workspaces have nothing to draw for them.
SUPPORTED_TASKS = ("detect", "segment", "pose", "obb")

ACTIVE_MODEL_META_KEY = "active_model_id"


@dataclass
class LoadedModel:
    id: str
    name: str
    yolo: Any
    task: str
    names: dict[int, str]
    device: str
    loaded_at: str
    load_time_ms: float
    metadata: dict[str, Any] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def class_name(self, class_id: int) -> str:
        return self.names.get(class_id, str(class_id))

    def ensure_device(self, device: str) -> None:
        """Move the model to ``device``. Must be called with ``lock`` held."""
        if device != self.device:
            # Dropping the predictor makes Ultralytics rebuild it (and move
            # the weights) for the new device on the next predict call.
            self.yolo.predictor = None
            self.device = device


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sanitize_error(message: str, *paths: Path) -> str:
    for path in paths:
        message = message.replace(str(path), path.name)
    return message.strip() or "Unknown error"


def _extract_metadata(yolo: Any) -> dict[str, Any]:
    """Read real metadata from a loaded Ultralytics model. Unknown values stay None."""
    meta: dict[str, Any] = {}
    names = getattr(yolo, "names", None) or {}
    if isinstance(names, (list, tuple)):
        names = dict(enumerate(names))
    meta["class_names"] = [str(names[k]) for k in sorted(names)]
    meta["num_classes"] = len(names) if names else None
    meta["task"] = getattr(yolo, "task", None)

    ckpt = getattr(yolo, "ckpt", None) or {}
    train_args = ckpt.get("train_args") or {}
    if not isinstance(train_args, dict):
        train_args = dict(vars(train_args)) if hasattr(train_args, "__dict__") else {}

    architecture = None
    inner = getattr(yolo, "model", None)
    yaml_cfg = getattr(inner, "yaml", None)
    if isinstance(yaml_cfg, dict):
        yaml_file = yaml_cfg.get("yaml_file")
        if yaml_file:
            architecture = Path(str(yaml_file)).stem
    if not architecture and train_args.get("model"):
        architecture = Path(str(train_args["model"])).stem
    meta["architecture"] = architecture

    try:
        meta["parameters"] = int(sum(p.numel() for p in inner.parameters())) if inner is not None else None
    except Exception:  # noqa: BLE001
        meta["parameters"] = None

    imgsz = train_args.get("imgsz")
    if isinstance(imgsz, (list, tuple)) and imgsz:
        imgsz = max(int(v) for v in imgsz)
    meta["trained_image_size"] = int(imgsz) if isinstance(imgsz, (int, float)) else None
    meta["ultralytics_version"] = str(ckpt["version"]) if ckpt.get("version") else None
    meta["trained_at"] = str(ckpt["date"]) if ckpt.get("date") else None
    return meta


class ModelRegistry:
    def __init__(self, db: Database, settings: Settings, devices: DeviceManager) -> None:
        self.db = db
        self.settings = settings
        self.devices = devices
        self._lock = threading.RLock()
        self._loaded: OrderedDict[str, LoadedModel] = OrderedDict()
        self._loading: set[str] = set()
        self._errors: dict[str, str] = {}
        self._job_refs: Counter[str] = Counter()
        self._load_locks: dict[str, threading.Lock] = {}

    # ------------------------------------------------------------------ records
    def _path(self, record: ModelRecord) -> Path:
        return self.settings.weights_dir / record.stored_filename

    def get_record(self, model_id: str) -> ModelRecord:
        if not is_valid_id(model_id):
            raise NotFoundError("Model not found.", code="MODEL_NOT_FOUND")
        row = self.db.query_one("SELECT * FROM models WHERE id = ?", (model_id,))
        if row is None:
            raise NotFoundError("Model not found.", code="MODEL_NOT_FOUND")
        return ModelRecord.from_row(row)

    def records(self) -> list[ModelRecord]:
        rows = self.db.query("SELECT * FROM models ORDER BY uploaded_at DESC")
        return [ModelRecord.from_row(r) for r in rows]

    @property
    def active_model_id(self) -> str | None:
        value = self.db.get_meta(ACTIVE_MODEL_META_KEY)
        return value or None

    def _set_active(self, model_id: str | None) -> None:
        self.db.set_meta(ACTIVE_MODEL_META_KEY, model_id)

    def status_of(self, model_id: str) -> str:
        with self._lock:
            if model_id in self._loading:
                return "loading"
            if model_id in self._loaded:
                return "loaded"
            if model_id in self._errors:
                return "error"
        return "not_loaded"

    def info(self, record: ModelRecord) -> ModelInfo:
        meta = record.metadata
        with self._lock:
            loaded = self._loaded.get(record.id)
            error = self._errors.get(record.id)
            jobs = self._job_refs.get(record.id, 0)
        return ModelInfo(
            id=record.id,
            name=record.name,
            file_size_bytes=record.file_size,
            sha256=record.sha256,
            uploaded_at=record.uploaded_at,
            status=self.status_of(record.id),  # type: ignore[arg-type]
            is_active=record.id == self.active_model_id,
            task=meta.get("task"),
            architecture=meta.get("architecture"),
            num_classes=meta.get("num_classes"),
            class_names=meta.get("class_names") or [],
            parameters=meta.get("parameters"),
            trained_image_size=meta.get("trained_image_size"),
            ultralytics_version=meta.get("ultralytics_version"),
            trained_at=meta.get("trained_at"),
            device=loaded.device if loaded else None,
            last_loaded_at=record.last_loaded_at,
            load_time_ms=loaded.load_time_ms if loaded else meta.get("load_time_ms"),
            error=error,
            active_jobs=jobs,
        )

    def list_info(self) -> list[ModelInfo]:
        return [self.info(r) for r in self.records()]

    # ------------------------------------------------------------------ upload
    def register_upload(self, temp_path: Path, original_name: str | None, device_pref: str | None) -> ModelInfo:
        """Validate a freshly uploaded file, store it and load it.

        ``temp_path`` is consumed: it is moved into the weights directory on
        success and deleted on failure.
        """
        try:
            if self.settings.model_security_scan:
                try:
                    scan_checkpoint(temp_path)
                except CheckpointRejected as exc:
                    raise UnsafeModelError(
                        str(exc),
                        details={"reason": exc.reason, "offending": exc.offending},
                    ) from exc

            sha = _sha256(temp_path)
            existing = self.db.query_one("SELECT id, name FROM models WHERE sha256 = ?", (sha,))
            if existing is not None:
                raise ConflictError(
                    f"This model is already uploaded as '{existing['name']}'.",
                    code="MODEL_ALREADY_EXISTS",
                    details={"model_id": existing["id"]},
                )

            model_id = new_id()
            stored = f"{model_id}.pt"
            final_path = self.settings.weights_dir / stored
            self.settings.weights_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(temp_path), final_path)
        finally:
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)

        name = display_filename(original_name, fallback="model.pt")
        record = ModelRecord(
            id=model_id,
            name=name,
            stored_filename=stored,
            file_size=final_path.stat().st_size,
            sha256=sha,
            uploaded_at=now_iso(),
        )
        self.db.execute(
            "INSERT INTO models (id, name, stored_filename, file_size, sha256, uploaded_at, metadata) "
            "VALUES (?, ?, ?, ?, ?, ?, '{}')",
            (record.id, record.name, record.stored_filename, record.file_size, record.sha256, record.uploaded_at),
        )

        try:
            self.load(model_id, device_pref)
        except Exception:
            # A file that cannot be loaded as a YOLO model is not kept.
            self._remove_record(record)
            with self._lock:
                self._errors.pop(model_id, None)
            raise
        return self.info(self.get_record(model_id))

    # ------------------------------------------------------------------ loading
    def _load_lock(self, model_id: str) -> threading.Lock:
        with self._lock:
            return self._load_locks.setdefault(model_id, threading.Lock())

    def load(self, model_id: str, device_pref: str | None = None, force_reload: bool = False) -> LoadedModel:
        """Load ``model_id`` (if needed), make it active and return the instance."""
        record = self.get_record(model_id)
        device = self.devices.resolve(device_pref)
        with self._load_lock(model_id):
            with self._lock:
                current = self._loaded.get(model_id)
            if current is not None and not force_reload:
                with current.lock:
                    current.ensure_device(device)
                self._touch(model_id)
                self._set_active(model_id)
                return current

            with self._lock:
                self._loading.add(model_id)
                self._errors.pop(model_id, None)
            try:
                loaded = self._load_instance(record, device)
            except Exception as exc:
                message = exc.message if isinstance(exc, ModelLoadError) else str(exc)
                with self._lock:
                    self._errors[model_id] = message
                raise
            finally:
                with self._lock:
                    self._loading.discard(model_id)

            with self._lock:
                self._loaded[model_id] = loaded
                self._loaded.move_to_end(model_id)
            self._set_active(model_id)
            meta = {**record.metadata, **loaded.metadata, "load_time_ms": loaded.load_time_ms}
            self.db.execute(
                "UPDATE models SET metadata = ?, last_loaded_at = ? WHERE id = ?",
                (_dumps(meta), loaded.loaded_at, model_id),
            )
            self._evict()
            logger.info("Loaded model %s (%s) on %s in %.0f ms", record.name, model_id, device, loaded.load_time_ms)
            return loaded

    def _load_instance(self, record: ModelRecord, device: str) -> LoadedModel:
        path = self._path(record)
        if not path.exists():
            raise ModelLoadError(
                "The model file is missing from storage. Remove this entry and upload it again.",
                code="MODEL_FILE_MISSING",
            )
        start = time.perf_counter()
        try:
            from ultralytics import YOLO
        except ImportError as exc:  # pragma: no cover - dependency problem
            raise ModelLoadError(
                "The 'ultralytics' package is not installed on the backend. "
                "Run: pip install -r requirements.txt",
                code="DEPENDENCY_MISSING",
            ) from exc

        try:
            yolo = YOLO(str(path))
        except Exception as exc:  # noqa: BLE001 - surface any loader error to the user
            raise ModelLoadError(
                "Could not load this file as an Ultralytics YOLO checkpoint: "
                + _sanitize_error(str(exc), path, self.settings.storage_dir),
                details={"exception": type(exc).__name__},
            ) from exc

        task = getattr(yolo, "task", None)
        if task not in SUPPORTED_TASKS:
            raise ModelLoadError(
                f"Models for the '{task}' task are not supported. Upload a detection, "
                "segmentation, pose or OBB model (they all produce bounding boxes).",
                code="UNSUPPORTED_TASK",
                details={"task": task},
            )

        names = getattr(yolo, "names", None) or {}
        if isinstance(names, (list, tuple)):
            names = dict(enumerate(names))
        if not names:
            raise ModelLoadError("The checkpoint does not define any class names.", code="INVALID_MODEL")

        metadata = _extract_metadata(yolo)

        # Validate that the model really runs: a tiny forward pass on a blank image.
        try:
            yolo.predict(np.zeros((128, 128, 3), dtype=np.uint8), imgsz=128, device=device, verbose=False)
        except Exception as exc:  # noqa: BLE001
            raise ModelLoadError(
                "The model loaded but failed a test inference: "
                + _sanitize_error(str(exc), path, self.settings.storage_dir),
                code="MODEL_VALIDATION_FAILED",
                details={"exception": type(exc).__name__},
            ) from exc

        elapsed = (time.perf_counter() - start) * 1000
        return LoadedModel(
            id=record.id,
            name=record.name,
            yolo=yolo,
            task=str(task),
            names={int(k): str(v) for k, v in names.items()},
            device=device,
            loaded_at=now_iso(),
            load_time_ms=round(elapsed, 1),
            metadata=metadata,
        )

    def _touch(self, model_id: str) -> None:
        with self._lock:
            if model_id in self._loaded:
                self._loaded.move_to_end(model_id)

    def _evict(self) -> None:
        active = self.active_model_id
        with self._lock:
            while len(self._loaded) > self.settings.max_loaded_models:
                victim = next((mid for mid in self._loaded if mid != active), None)
                if victim is None:
                    break
                # Running jobs hold their own reference, so eviction is safe.
                self._loaded.pop(victim)
                logger.info("Evicted model %s from memory", victim)

    def unload(self, model_id: str) -> None:
        with self._lock:
            self._loaded.pop(model_id, None)
        if self.active_model_id == model_id:
            self._set_active(None)

    def get_loaded(self, model_id: str | None = None) -> LoadedModel:
        """Return a loaded instance: the given model or the active one."""
        target = model_id or self.active_model_id
        if not target:
            raise ModelNotLoaded(
                "No model is loaded. Upload a YOLO .pt file or load one in the Model Manager first."
            )
        with self._lock:
            loaded = self._loaded.get(target)
        if loaded is None:
            record = self.get_record(target)
            if model_id is None:
                raise ModelNotLoaded(
                    f"The active model '{record.name}' is not loaded. Load it in the Model Manager.",
                    details={"model_id": target},
                )
            loaded = self.load(target)
        self._touch(target)
        return loaded

    # ------------------------------------------------------------------ jobs
    def acquire(self, model_id: str) -> None:
        with self._lock:
            self._job_refs[model_id] += 1

    def release(self, model_id: str) -> None:
        with self._lock:
            self._job_refs[model_id] -= 1
            if self._job_refs[model_id] <= 0:
                del self._job_refs[model_id]

    # ------------------------------------------------------------------ delete
    def delete(self, model_id: str) -> None:
        record = self.get_record(model_id)
        with self._lock:
            jobs = self._job_refs.get(model_id, 0)
        if jobs:
            raise ConflictError(
                f"'{record.name}' is used by {jobs} running video job(s). Cancel or wait for them "
                "to finish before removing the model.",
                code="MODEL_IN_USE",
                details={"active_jobs": jobs},
            )
        self._remove_record(record)

    def _remove_record(self, record: ModelRecord) -> None:
        self.unload(record.id)
        with self._lock:
            self._errors.pop(record.id, None)
        self.db.execute("DELETE FROM models WHERE id = ?", (record.id,))
        path = self._path(record)
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Could not delete model file %s: %s", path.name, exc)

    # ------------------------------------------------------------------ startup
    def autoload(self) -> None:
        model_id = self.active_model_id
        if not model_id:
            return
        try:
            self.load(model_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not auto-load model %s: %s", model_id, exc)


def _dumps(value: Any) -> str:
    return json.dumps(value, default=str)
