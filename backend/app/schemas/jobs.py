from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.inference import InferenceParams, ModelRef

JobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
JobStage = Literal["queued", "loading", "processing", "encoding", "finished"]
FrameStrategy = Literal["every_frame", "interval", "target_fps"]
OutputQuality = Literal["low", "medium", "high"]


class VideoJobSettings(InferenceParams):
    model_config = ConfigDict(extra="forbid")

    frame_strategy: FrameStrategy = "every_frame"
    # Run inference on every Nth frame when ``frame_strategy == "interval"``.
    frame_interval: int = Field(default=2, ge=1, le=300)
    # Target number of analysed frames per second for ``"target_fps"``.
    target_fps: float = Field(default=10.0, gt=0, le=240)
    # Keep drawing the latest detections on frames that were not analysed so
    # the output video does not flicker.
    hold_detections: bool = True
    # Stop after this many seconds of source video (``None`` = whole video).
    max_duration_s: float | None = Field(default=None, gt=0, le=6 * 3600)
    output_quality: OutputQuality = "medium"
    # Downscale the output so its height does not exceed this value.
    output_max_height: int | None = Field(default=None, ge=144, le=4320)


class VideoInfo(BaseModel):
    filename: str
    width: int
    height: int
    fps: float | None
    frame_count: int | None
    duration_s: float | None
    file_size_bytes: int


class JobProgress(BaseModel):
    frames_read: int = 0
    frames_analyzed: int = 0
    # Frames that will be read in total. ``None`` when the container does not
    # report a reliable frame count; the UI then shows indeterminate progress.
    total_frames: int | None = None
    percent: float | None = None
    detections: int = 0
    processing_fps: float | None = None
    elapsed_s: float = 0.0
    eta_s: float | None = None


class TimelinePoint(BaseModel):
    t: float
    frame: int
    count: int


class VideoResult(BaseModel):
    output_url: str | None
    input_url: str | None
    output_size_bytes: int | None
    output_width: int
    output_height: int
    output_fps: float
    encoder: str
    total_detections: int
    frames_written: int
    frames_analyzed: int
    avg_inference_ms: float | None
    processing_time_s: float
    class_counts: dict[str, int]
    # Unique-per-frame peak counts per class (max simultaneous objects).
    class_peaks: dict[str, int]
    timeline: list[TimelinePoint]
    files_expired: bool = False
    truncated: bool = False


class JobResponse(BaseModel):
    id: str
    kind: Literal["video"] = "video"
    status: JobStatus
    stage: JobStage
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    model: ModelRef
    device: str | None = None
    video: VideoInfo
    settings: VideoJobSettings
    progress: JobProgress
    error: str | None = None
    error_code: str | None = None
    result: VideoResult | None = None
