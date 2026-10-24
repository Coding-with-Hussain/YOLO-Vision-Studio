from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

HistoryKind = Literal["image", "video", "live"]
HistoryStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class HistoryArtifacts(BaseModel):
    """URLs of files retained for an entry. Missing or expired files are ``None``."""

    annotated_url: str | None = None
    original_url: str | None = None
    thumbnail_url: str | None = None
    output_url: str | None = None
    input_url: str | None = None


class HistoryItem(BaseModel):
    id: str
    kind: HistoryKind
    status: HistoryStatus
    source_name: str
    model_id: str | None
    model_name: str | None
    task: str | None
    num_detections: int
    duration_ms: float | None
    avg_inference_ms: float | None
    created_at: str
    completed_at: str | None
    error: str | None
    files_expired: bool
    expires_at: str | None
    artifacts: HistoryArtifacts
    class_counts: dict[str, int]


class HistoryDetail(HistoryItem):
    params: dict[str, Any]
    summary: dict[str, Any]


class HistoryListResponse(BaseModel):
    items: list[HistoryItem]
    total: int
    limit: int
    offset: int


class DailyCount(BaseModel):
    date: str
    jobs: int
    detections: int


class StatsResponse(BaseModel):
    total_detections: int
    images_processed: int
    videos_processed: int
    live_sessions: int
    avg_inference_ms: float | None
    daily: list[DailyCount]
    top_classes: list[dict[str, Any]]
