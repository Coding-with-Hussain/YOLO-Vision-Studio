"""Domain records persisted in the SQLite store."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ModelRecord:
    id: str
    name: str
    # File name inside ``storage/weights``; generated server side, never user input.
    stored_filename: str
    file_size: int
    sha256: str
    uploaded_at: str
    metadata: dict[str, Any] = field(default_factory=dict)
    last_loaded_at: str | None = None
    is_active: bool = False

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "ModelRecord":
        return cls(
            id=row["id"],
            name=row["name"],
            stored_filename=row["stored_filename"],
            file_size=row["file_size"],
            sha256=row["sha256"],
            uploaded_at=row["uploaded_at"],
            metadata=json.loads(row["metadata"] or "{}"),
            last_loaded_at=row["last_loaded_at"],
            is_active=bool(row["is_active"]),
        )


@dataclass
class HistoryRecord:
    id: str
    kind: str
    status: str
    source_name: str
    created_at: str
    model_id: str | None = None
    model_name: str | None = None
    task: str | None = None
    num_detections: int = 0
    duration_ms: float | None = None
    avg_inference_ms: float | None = None
    completed_at: str | None = None
    params: dict[str, Any] = field(default_factory=dict)
    summary: dict[str, Any] = field(default_factory=dict)
    # Names of retained files, e.g. {"annotated": "annotated.jpg"}.
    artifacts: dict[str, str] = field(default_factory=dict)
    error: str | None = None
    error_code: str | None = None
    expires_at: str | None = None
    files_expired: bool = False

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "HistoryRecord":
        return cls(
            id=row["id"],
            kind=row["kind"],
            status=row["status"],
            source_name=row["source_name"],
            created_at=row["created_at"],
            model_id=row["model_id"],
            model_name=row["model_name"],
            task=row["task"],
            num_detections=row["num_detections"] or 0,
            duration_ms=row["duration_ms"],
            avg_inference_ms=row["avg_inference_ms"],
            completed_at=row["completed_at"],
            params=json.loads(row["params"] or "{}"),
            summary=json.loads(row["summary"] or "{}"),
            artifacts=json.loads(row["artifacts"] or "{}"),
            error=row["error"],
            error_code=row["error_code"],
            expires_at=row["expires_at"],
            files_expired=bool(row["files_expired"]),
        )
