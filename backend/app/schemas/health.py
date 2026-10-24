from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class DeviceInfo(BaseModel):
    id: str
    name: str
    type: Literal["cpu", "cuda", "mps"]


class ActiveModelSummary(BaseModel):
    id: str
    name: str
    task: str | None
    num_classes: int | None
    device: str | None


class UploadLimits(BaseModel):
    max_model_size_mb: int
    max_image_size_mb: int
    max_video_size_mb: int


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    app: str
    version: str
    uptime_s: float
    python_version: str
    torch_version: str | None
    ultralytics_version: str | None
    opencv_version: str | None
    cuda_available: bool
    mps_available: bool
    devices: list[DeviceInfo]
    default_device: str
    video_encoder: str
    model_security_scan: bool
    active_model: ActiveModelSummary | None
    limits: UploadLimits
    issues: list[str]
