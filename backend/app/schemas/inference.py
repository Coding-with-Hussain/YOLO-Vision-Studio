from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.settings import DevicePreference, validate_image_size


class InferenceParams(BaseModel):
    """Settings applied to a single prediction call."""

    model_config = ConfigDict(extra="forbid")

    confidence: float = Field(default=0.25, ge=0.05, le=1.0)
    iou: float = Field(default=0.45, ge=0.10, le=0.90)
    image_size: int = 640
    max_detections: int = Field(default=300, ge=1, le=1000)
    device: DevicePreference = "auto"
    # Class ids to keep. ``None`` keeps every class.
    classes: list[int] | None = None

    @field_validator("image_size")
    @classmethod
    def _check_size(cls, value: int) -> int:
        return validate_image_size(value)

    @field_validator("classes")
    @classmethod
    def _check_classes(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if any(c < 0 for c in value):
            raise ValueError("class ids must be non-negative")
        return sorted(set(value))


class BoundingBox(BaseModel):
    """Axis-aligned box in pixel coordinates of the processed image."""

    x1: float
    y1: float
    x2: float
    y2: float
    # Convenience fields: top-left corner and size.
    x: float
    y: float
    width: float
    height: float


class Keypoint(BaseModel):
    x: float
    y: float
    confidence: float | None = None


class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: BoundingBox
    # Populated for segmentation (mask outline) and oriented-box models.
    polygon: list[list[float]] | None = None
    # Populated for pose models.
    keypoints: list[Keypoint] | None = None


class Timings(BaseModel):
    preprocess_ms: float | None = None
    inference_ms: float | None = None
    postprocess_ms: float | None = None
    total_ms: float


class ModelRef(BaseModel):
    id: str
    name: str
    task: str | None


class ImageInfo(BaseModel):
    filename: str
    width: int
    height: int


class ImageInferenceResponse(BaseModel):
    id: str
    created_at: str
    model: ModelRef
    image: ImageInfo
    params: InferenceParams
    device: str
    count: int
    class_counts: dict[str, int]
    detections: list[Detection]
    timings: Timings
    # When results are retained on the server, the annotated image is served
    # from ``annotated_url``. Otherwise it is returned inline as a JPEG data URL.
    saved: bool
    annotated_url: str | None
    original_url: str | None
    thumbnail_url: str | None
    annotated_data_url: str | None = None
