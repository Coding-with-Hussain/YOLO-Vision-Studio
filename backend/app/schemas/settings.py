from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DevicePreference = Literal["auto", "cpu", "cuda", "mps"]

IMAGE_SIZE_MIN = 64
IMAGE_SIZE_MAX = 1920
SUPPORTED_IMAGE_SIZES = [320, 416, 480, 512, 640, 736, 832, 960, 1024, 1280]


def validate_image_size(value: int) -> int:
    if value < IMAGE_SIZE_MIN or value > IMAGE_SIZE_MAX:
        raise ValueError(f"image size must be between {IMAGE_SIZE_MIN} and {IMAGE_SIZE_MAX}")
    if value % 32 != 0:
        raise ValueError("image size must be a multiple of 32")
    return value


class RuntimeSettings(BaseModel):
    """User-adjustable defaults persisted to ``storage/settings.json``."""

    model_config = ConfigDict(extra="forbid")

    # Inference defaults
    default_confidence: float = Field(default=0.25, ge=0.05, le=1.0)
    default_iou: float = Field(default=0.45, ge=0.10, le=0.90)
    default_image_size: int = 640
    default_max_detections: int = Field(default=300, ge=1, le=1000)
    preferred_device: DevicePreference = "auto"
    max_video_fps: float = Field(default=30.0, ge=1.0, le=240.0)

    # Storage and retention
    save_image_results: bool = True
    output_retention_hours: int = Field(default=72, ge=1, le=24 * 365)
    upload_retention_hours: int = Field(default=24, ge=0, le=24 * 365)
    cleanup_interval_minutes: int = Field(default=30, ge=5, le=24 * 60)
    history_max_entries: int = Field(default=1000, ge=10, le=100_000)

    @field_validator("default_image_size")
    @classmethod
    def _check_size(cls, value: int) -> int:
        return validate_image_size(value)


class RuntimeSettingsUpdate(BaseModel):
    """Partial update of :class:`RuntimeSettings`; omitted fields are unchanged."""

    model_config = ConfigDict(extra="forbid")

    default_confidence: float | None = Field(default=None, ge=0.05, le=1.0)
    default_iou: float | None = Field(default=None, ge=0.10, le=0.90)
    default_image_size: int | None = None
    default_max_detections: int | None = Field(default=None, ge=1, le=1000)
    preferred_device: DevicePreference | None = None
    max_video_fps: float | None = Field(default=None, ge=1.0, le=240.0)
    save_image_results: bool | None = None
    output_retention_hours: int | None = Field(default=None, ge=1, le=24 * 365)
    upload_retention_hours: int | None = Field(default=None, ge=0, le=24 * 365)
    cleanup_interval_minutes: int | None = Field(default=None, ge=5, le=24 * 60)
    history_max_entries: int | None = Field(default=None, ge=10, le=100_000)

    @field_validator("default_image_size")
    @classmethod
    def _check_size(cls, value: int | None) -> int | None:
        return None if value is None else validate_image_size(value)


class StorageArea(BaseModel):
    name: Literal["weights", "uploads", "outputs"]
    exists: bool
    writable: bool
    file_count: int
    size_bytes: int


class StorageStatus(BaseModel):
    areas: list[StorageArea]
    total_size_bytes: int
    output_retention_hours: int
    upload_retention_hours: int
    cleanup_interval_minutes: int
    last_cleanup_at: str | None


class CleanupResult(BaseModel):
    removed_files: int
    freed_bytes: int
    expired_history_entries: int
    trimmed_history_entries: int
    ran_at: str
