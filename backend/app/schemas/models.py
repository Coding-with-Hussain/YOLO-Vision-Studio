from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.settings import DevicePreference

ModelStatus = Literal["not_loaded", "loading", "loaded", "error"]


class ModelInfo(BaseModel):
    id: str
    name: str
    file_size_bytes: int
    sha256: str
    uploaded_at: str
    status: ModelStatus
    is_active: bool
    # Metadata read from the checkpoint. ``None`` means the value could not be
    # determined from the file; nothing here is guessed.
    task: str | None = None
    architecture: str | None = None
    num_classes: int | None = None
    class_names: list[str] = []
    parameters: int | None = None
    trained_image_size: int | None = None
    ultralytics_version: str | None = None
    trained_at: str | None = None
    device: str | None = None
    last_loaded_at: str | None = None
    load_time_ms: float | None = None
    error: str | None = None
    active_jobs: int = 0


class ModelListResponse(BaseModel):
    models: list[ModelInfo]
    active_model_id: str | None


class LoadModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device: DevicePreference | None = None
    force_reload: bool = False
