"""Asynchronous video processing jobs.

Jobs run in a bounded thread pool (``YVS_MAX_CONCURRENT_VIDEO_JOBS``) so long
videos never block the API. Progress is derived from frames actually read; the
total is only reported when the container provides a frame count.
"""

from __future__ import annotations

import logging
import math
import shutil
import subprocess
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from app.core.config import Settings
from app.core.errors import AppError, ConflictError, NotFoundError, ValidationFailed
from app.core.utils import is_valid_id, iso_in, now_iso
from app.models.records import HistoryRecord
from app.schemas.inference import Detection, ModelRef
from app.schemas.jobs import JobProgress, JobResponse, TimelinePoint, VideoInfo, VideoJobSettings, VideoResult
from app.services.annotate import draw_detections, encode_jpeg, make_thumbnail
from app.services.history import HistoryService
from app.services.inference import InferenceService
from app.services.model_registry import LoadedModel, ModelRegistry
from app.services.runtime_settings import RuntimeSettingsStore
from app.services.storage import StorageService

logger = logging.getLogger(__name__)

ALLOWED_VIDEO_EXTENSIONS = {"mp4", "m4v", "mov", "webm", "mkv", "avi"}
CRF = {"low": 30, "medium": 23, "high": 18}
MAX_TIMELINE_POINTS = 600
OUTPUT_NAME = "annotated.mp4"
THUMB_NAME = "thumbnail.jpg"


class JobCancelled(Exception):
    pass


def find_ffmpeg() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return shutil.which("ffmpeg")


def describe_encoder() -> str:
    return "ffmpeg (H.264)" if find_ffmpeg() else "OpenCV (MPEG-4)"


def probe_video(path: Path, filename: str) -> VideoInfo:
    """Open a video and decode its first frame; raise a 422 if that fails."""
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise ValidationFailed(
                "The video could not be opened. It may be corrupted or use a codec the backend "
                "cannot decode (try MP4/H.264).",
                code="INVALID_VIDEO",
            )
        ok, frame = cap.read()
        if not ok or frame is None:
            raise ValidationFailed(
                "No frames could be decoded from this video. It may be corrupted or use an "
                "unsupported codec.",
                code="INVALID_VIDEO",
            )
        height, width = frame.shape[:2]
        fps = cap.get(cv2.CAP_PROP_FPS)
        fps = float(fps) if fps and math.isfinite(fps) and 0 < fps <= 1000 else None
        count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        frame_count = int(count) if count and math.isfinite(count) and 0 < count < 10_000_000 else None
        duration = round(frame_count / fps, 3) if frame_count and fps else None
        return VideoInfo(
            filename=filename,
            width=width,
            height=height,
            fps=round(fps, 3) if fps else None,
            frame_count=frame_count,
            duration_s=duration,
            file_size_bytes=path.stat().st_size,
        )
    finally:
        cap.release()


class _Writer:
    """H.264 through ffmpeg when available, OpenCV as a fallback."""

    def __init__(self, path: Path, width: int, height: int, fps: float, quality: str) -> None:
        self.path = path
        self.proc: subprocess.Popen | None = None
        self.cv_writer: cv2.VideoWriter | None = None
        ffmpeg = find_ffmpeg()
        if ffmpeg:
            cmd = [
                ffmpeg, "-y", "-loglevel", "error",
                "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", f"{fps:.3f}",
                "-i", "-", "-an",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", str(CRF[quality]),
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path),
            ]  # fmt: skip
            self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            self.encoder = "ffmpeg (H.264)"
            return
        for fourcc, label in (("avc1", "OpenCV (H.264)"), ("mp4v", "OpenCV (MPEG-4)")):
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*fourcc), fps, (width, height))
            if writer.isOpened():
                self.cv_writer = writer
                self.encoder = label
                return
            writer.release()
        raise AppError("No video encoder is available on the backend.", code="ENCODER_UNAVAILABLE", status_code=500)

    def write(self, frame: np.ndarray) -> None:
        if self.proc is not None:
            assert self.proc.stdin is not None
            try:
                self.proc.stdin.write(frame.tobytes())
            except BrokenPipeError as exc:
                raise AppError(f"The video encoder stopped unexpectedly: {self._stderr()}", code="ENCODER_FAILED") from exc
        elif self.cv_writer is not None:
            self.cv_writer.write(frame)

    def _stderr(self) -> str:
        if self.proc is None or self.proc.stderr is None:
            return ""
        try:
            return self.proc.stderr.read().decode("utf-8", "replace")[-500:].strip()
        except Exception:  # noqa: BLE001
            return ""

    def close(self) -> None:
        if self.proc is not None:
            assert self.proc.stdin is not None
            try:
                self.proc.stdin.close()
            except BrokenPipeError:
                pass
            code = self.proc.wait(timeout=600)
            if code != 0:
                raise AppError(f"The video encoder failed: {self._stderr()}", code="ENCODER_FAILED")
        elif self.cv_writer is not None:
            self.cv_writer.release()

    def abort(self) -> None:
        if self.proc is not None:
            self.proc.kill()
            self.proc.wait()
        elif self.cv_writer is not None:
            self.cv_writer.release()
        self.path.unlink(missing_ok=True)


@dataclass
class VideoJob:
    id: str
    created_at: str
    source_name: str
    input_filename: str
    model: LoadedModel
    settings: VideoJobSettings
    video: VideoInfo
    device: str | None = None
    status: str = "queued"
    stage: str = "queued"
    started_at: str | None = None
    completed_at: str | None = None
    progress: JobProgress = field(default_factory=JobProgress)
    error: str | None = None
    error_code: str | None = None
    result: VideoResult | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    future: Future | None = None


class VideoJobManager:
    def __init__(
        self,
        settings: Settings,
        registry: ModelRegistry,
        inference: InferenceService,
        history: HistoryService,
        storage: StorageService,
        runtime: RuntimeSettingsStore,
    ) -> None:
        self.settings = settings
        self.registry = registry
        self.inference = inference
        self.history = history
        self.storage = storage
        self.runtime = runtime
        self._executor = ThreadPoolExecutor(
            max_workers=settings.max_concurrent_video_jobs, thread_name_prefix="video-job"
        )
        self._jobs: dict[str, VideoJob] = {}
        self._lock = threading.Lock()

    # Public API ---------------------------------------------------------
    def active_ids(self) -> set[str]:
        with self._lock:
            return {j.id for j in self._jobs.values() if j.status in ("queued", "running")}

    def submit(
        self,
        job_id: str,
        input_filename: str,
        source_name: str,
        video: VideoInfo,
        model: LoadedModel,
        job_settings: VideoJobSettings,
    ) -> JobResponse:
        self.inference.validate_classes(model, job_settings.classes)
        self.registry.devices.resolve(job_settings.device)  # fail fast on unavailable devices
        job = VideoJob(
            id=job_id,
            created_at=now_iso(),
            source_name=source_name,
            input_filename=input_filename,
            model=model,
            settings=job_settings,
            video=video,
        )
        job.progress.total_frames = self._planned_frames(video, job_settings)
        self.registry.acquire(model.id)
        with self._lock:
            self._jobs[job_id] = job
        self._persist(job)
        job.future = self._executor.submit(self._run, job)
        return self.to_response(job)

    def get(self, job_id: str) -> JobResponse:
        if not is_valid_id(job_id):
            raise NotFoundError("Job not found.", code="JOB_NOT_FOUND")
        with self._lock:
            job = self._jobs.get(job_id)
        if job is not None:
            return self.to_response(job)
        record = self.history.get_record(job_id)
        if record.kind != "video":
            raise NotFoundError("Job not found.", code="JOB_NOT_FOUND")
        return self._from_history(record)

    def cancel(self, job_id: str) -> JobResponse:
        if not is_valid_id(job_id):
            raise NotFoundError("Job not found.", code="JOB_NOT_FOUND")
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None or job.status not in ("queued", "running"):
            if job is None:
                self.history.get_record(job_id)  # 404 if unknown
            raise ConflictError("Only queued or running jobs can be cancelled.", code="JOB_NOT_CANCELLABLE")
        job.cancel_event.set()
        if job.future is not None and job.future.cancel():
            # Never started: finalize here because the worker will not run.
            self._finish(job, "cancelled", error="Cancelled before processing started.", error_code="CANCELLED")
        return self.to_response(job)

    def shutdown(self) -> None:
        with self._lock:
            jobs = list(self._jobs.values())
        for job in jobs:
            job.cancel_event.set()
        self._executor.shutdown(wait=True, cancel_futures=True)

    # Worker -------------------------------------------------------------
    def _planned_frames(self, video: VideoInfo, job_settings: VideoJobSettings) -> int | None:
        limit = None
        if job_settings.max_duration_s and video.fps:
            limit = int(job_settings.max_duration_s * video.fps)
        if video.frame_count and limit:
            return min(video.frame_count, limit)
        return video.frame_count or limit

    def _stride(self, fps: float, job_settings: VideoJobSettings) -> int:
        max_fps = self.runtime.get().max_video_fps
        if job_settings.frame_strategy == "interval":
            stride = job_settings.frame_interval
        elif job_settings.frame_strategy == "target_fps":
            stride = max(1, round(fps / min(job_settings.target_fps, max_fps)))
        else:
            stride = 1
        # Never analyse more frames per second than the configured maximum.
        return max(stride, math.ceil(fps / max_fps - 1e-9))

    def _run(self, job: VideoJob) -> None:
        writer: _Writer | None = None
        cap: cv2.VideoCapture | None = None
        out_dir = self.storage.output_dir(job.id)
        try:
            job.status, job.stage, job.started_at = "running", "processing", now_iso()
            job.device = self.registry.devices.resolve(job.settings.device)
            self._persist(job)

            input_path = self.storage.upload_dir(job.id) / job.input_filename
            cap = cv2.VideoCapture(str(input_path))
            if not cap.isOpened():
                raise ValidationFailed("The video could not be opened.", code="INVALID_VIDEO")

            fps = job.video.fps or 30.0
            stride = self._stride(fps, job.settings)
            total = job.progress.total_frames
            limit = int(job.settings.max_duration_s * fps) if job.settings.max_duration_s else None

            width, height = job.video.width, job.video.height
            out_w, out_h = width, height
            if job.settings.output_max_height and height > job.settings.output_max_height:
                scale = job.settings.output_max_height / height
                out_w, out_h = int(width * scale), job.settings.output_max_height
            out_w, out_h = out_w - out_w % 2, out_h - out_h % 2  # H.264 needs even sizes

            out_dir.mkdir(parents=True, exist_ok=True)
            output_path = out_dir / OUTPUT_NAME
            writer = _Writer(output_path, out_w, out_h, fps, job.settings.output_quality)

            start = time.perf_counter()
            last: list[Detection] = []
            class_counts: dict[str, int] = {}
            class_peaks: dict[str, int] = {}
            timeline: list[TimelinePoint] = []
            inference_ms: list[float] = []
            thumbnail: np.ndarray | None = None
            index = 0

            while True:
                if job.cancel_event.is_set():
                    raise JobCancelled()
                if limit is not None and index >= limit:
                    break
                ok, frame = cap.read()
                if not ok or frame is None:
                    break
                if frame.shape[1] != width or frame.shape[0] != height:
                    frame = cv2.resize(frame, (width, height))

                analysed = index % stride == 0
                if analysed:
                    prediction = self.inference.predict(job.model, frame, job.settings)
                    last = prediction.detections
                    job.progress.frames_analyzed += 1
                    job.progress.detections += len(last)
                    inference_ms.append(prediction.timings.inference_ms or prediction.timings.total_ms)
                    per_frame: dict[str, int] = {}
                    for det in last:
                        class_counts[det.class_name] = class_counts.get(det.class_name, 0) + 1
                        per_frame[det.class_name] = per_frame.get(det.class_name, 0) + 1
                    for name, count in per_frame.items():
                        class_peaks[name] = max(class_peaks.get(name, 0), count)
                    timeline.append(TimelinePoint(t=round(index / fps, 3), frame=index, count=len(last)))

                drawn = last if analysed or job.settings.hold_detections else []
                annotated = draw_detections(frame, drawn) if drawn else frame
                if thumbnail is None and analysed:
                    thumbnail = make_thumbnail(annotated)
                if (out_w, out_h) != (width, height):
                    annotated = cv2.resize(annotated, (out_w, out_h), interpolation=cv2.INTER_AREA)
                writer.write(annotated)
                index += 1

                elapsed = time.perf_counter() - start
                progress = job.progress
                progress.frames_read = index
                progress.elapsed_s = round(elapsed, 2)
                progress.processing_fps = round(index / elapsed, 2) if elapsed > 0 else None
                if total:
                    # Containers can under-report frame counts; never exceed 99% while running.
                    progress.percent = round(min(99.0, index / total * 100), 1)
                    remaining = max(0, total - index)
                    progress.eta_s = round(remaining / progress.processing_fps, 1) if progress.processing_fps else None
                if elapsed > self.settings.video_job_timeout_s:
                    raise AppError(
                        "The job exceeded the maximum processing time and was stopped.",
                        code="JOB_TIMEOUT",
                        status_code=504,
                    )

            if index == 0:
                raise ValidationFailed("No frames could be decoded from this video.", code="INVALID_VIDEO")

            job.stage = "encoding"
            encoder_name = writer.encoder
            writer.close()
            writer = None
            if not output_path.exists() or output_path.stat().st_size == 0:
                raise AppError("The encoder did not produce an output file.", code="ENCODER_FAILED")
            if thumbnail is not None:
                (out_dir / THUMB_NAME).write_bytes(encode_jpeg(thumbnail, 82))

            processing_time = time.perf_counter() - start
            job.progress.percent = 100.0
            job.progress.eta_s = 0.0
            job.progress.total_frames = index
            job.result = VideoResult(
                output_url=None,
                input_url=None,
                output_size_bytes=output_path.stat().st_size,
                output_width=out_w,
                output_height=out_h,
                output_fps=round(fps, 3),
                encoder=encoder_name,
                total_detections=job.progress.detections,
                frames_written=index,
                frames_analyzed=job.progress.frames_analyzed,
                avg_inference_ms=round(sum(inference_ms) / len(inference_ms), 2) if inference_ms else None,
                processing_time_s=round(processing_time, 2),
                class_counts=dict(sorted(class_counts.items(), key=lambda kv: -kv[1])),
                class_peaks=class_peaks,
                timeline=_downsample(timeline),
                truncated=limit is not None and job.video.frame_count is not None and limit < job.video.frame_count,
            )
            self._finish(job, "completed")
        except JobCancelled:
            if writer is not None:
                writer.abort()
                writer = None
            shutil.rmtree(out_dir, ignore_errors=True)
            self._finish(job, "cancelled", error="Cancelled by user.", error_code="CANCELLED")
        except AppError as exc:
            if writer is not None:
                writer.abort()
                writer = None
            self._finish(job, "failed", error=exc.message, error_code=exc.code)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Video job %s failed", job.id)
            if writer is not None:
                writer.abort()
                writer = None
            self._finish(job, "failed", error=f"Processing failed: {exc}", error_code="JOB_FAILED")
        finally:
            if cap is not None:
                cap.release()

    def _finish(self, job: VideoJob, status: str, *, error: str | None = None, error_code: str | None = None) -> None:
        if job.status in ("completed", "failed", "cancelled"):
            return
        job.status = status
        job.stage = "finished"
        job.completed_at = now_iso()
        job.error = error
        job.error_code = error_code
        self.registry.release(job.model.id)
        self._persist(job)

    def _persist(self, job: VideoJob) -> None:
        runtime = self.runtime.get()
        artifacts = {"input": job.input_filename}
        if job.status == "completed":
            artifacts.update({"output": OUTPUT_NAME, "thumbnail": THUMB_NAME})
        duration_ms = job.result.processing_time_s * 1000 if job.result else (job.progress.elapsed_s * 1000 or None)
        self.history.upsert(
            HistoryRecord(
                id=job.id,
                kind="video",
                status=job.status,
                source_name=job.source_name,
                created_at=job.created_at,
                model_id=job.model.id,
                model_name=job.model.name,
                task=job.model.task,
                num_detections=job.progress.detections,
                duration_ms=round(duration_ms, 1) if duration_ms else None,
                avg_inference_ms=job.result.avg_inference_ms if job.result else None,
                completed_at=job.completed_at,
                params=job.settings.model_dump(),
                summary={
                    "video": job.video.model_dump(),
                    "progress": job.progress.model_dump(),
                    "result": job.result.model_dump() if job.result else None,
                    "class_counts": job.result.class_counts if job.result else {},
                    "device": job.device,
                    "started_at": job.started_at,
                },
                artifacts=artifacts,
                error=job.error,
                error_code=job.error_code,
                expires_at=iso_in(runtime.output_retention_hours) if job.completed_at else None,
            )
        )

    # Serialization -------------------------------------------------------
    def _with_urls(self, record: HistoryRecord, result: VideoResult | None) -> VideoResult | None:
        if result is None:
            return None
        artifacts = self.history.artifacts(record)
        return result.model_copy(
            update={
                "output_url": artifacts.output_url,
                "input_url": artifacts.input_url,
                "files_expired": artifacts.output_url is None,
            }
        )

    def to_response(self, job: VideoJob) -> JobResponse:
        result = None
        if job.result is not None:
            result = self._with_urls(self.history.get_record(job.id), job.result)
        return JobResponse(
            id=job.id,
            status=job.status,  # type: ignore[arg-type]
            stage=job.stage,  # type: ignore[arg-type]
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            model=ModelRef(id=job.model.id, name=job.model.name, task=job.model.task),
            device=job.device,
            video=job.video,
            settings=job.settings,
            progress=job.progress.model_copy(),
            error=job.error,
            error_code=job.error_code,
            result=result,
        )

    def _from_history(self, record: HistoryRecord) -> JobResponse:
        summary = record.summary
        result = VideoResult(**summary["result"]) if summary.get("result") else None
        return JobResponse(
            id=record.id,
            status=record.status,  # type: ignore[arg-type]
            stage="finished" if record.status not in ("queued", "running") else "queued",
            created_at=record.created_at,
            started_at=summary.get("started_at"),
            completed_at=record.completed_at,
            model=ModelRef(id=record.model_id or "", name=record.model_name or "unknown", task=record.task),
            device=summary.get("device"),
            video=VideoInfo(**summary["video"]),
            settings=VideoJobSettings(**record.params),
            progress=JobProgress(**summary.get("progress", {})),
            error=record.error,
            error_code=record.error_code,
            result=self._with_urls(record, result),
        )


def _downsample(points: list[TimelinePoint]) -> list[TimelinePoint]:
    if len(points) <= MAX_TIMELINE_POINTS:
        return points
    bucket = math.ceil(len(points) / MAX_TIMELINE_POINTS)
    # Keep the peak of each bucket so short bursts stay visible.
    return [max(points[i : i + bucket], key=lambda p: p.count) for i in range(0, len(points), bucket)]
