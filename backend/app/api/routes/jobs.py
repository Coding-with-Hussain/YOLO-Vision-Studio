from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from app.api.deps import get_services
from app.core.errors import ConflictError, ResourceExpired
from app.schemas.jobs import JobResponse, VideoResult
from app.services.container import Services

router = APIRouter(prefix="/jobs", tags=["jobs"])

VIDEO_MEDIA_TYPES = {
    "mp4": "video/mp4",
    "m4v": "video/mp4",
    "mov": "video/quicktime",
    "webm": "video/webm",
    "mkv": "video/x-matroska",
    "avi": "video/x-msvideo",
}


@router.get("", response_model=list[JobResponse], summary="List queued and running jobs")
def list_active_jobs(services: Services = Depends(get_services)) -> list[JobResponse]:
    return [services.jobs.get(job_id) for job_id in sorted(services.jobs.active_ids())]


@router.get("/{job_id}", response_model=JobResponse, summary="Job status and real progress")
def get_job(job_id: str, services: Services = Depends(get_services)) -> JobResponse:
    return services.jobs.get(job_id)


@router.get("/{job_id}/result", response_model=VideoResult, summary="Result of a completed job")
def get_job_result(job_id: str, services: Services = Depends(get_services)) -> VideoResult:
    job = services.jobs.get(job_id)
    if job.status != "completed" or job.result is None:
        raise ConflictError(
            f"The job is {job.status}; results are only available for completed jobs.",
            code="JOB_NOT_COMPLETED",
            details={"status": job.status},
        )
    return job.result


@router.post("/{job_id}/cancel", response_model=JobResponse, summary="Cancel a queued or running job")
def cancel_job(job_id: str, services: Services = Depends(get_services)) -> JobResponse:
    return services.jobs.cancel(job_id)


def _serve(path: Path | None, media_type: str, download_name: str, download: bool) -> FileResponse:
    if path is None:
        raise ResourceExpired(
            "This file is no longer available. It was removed by the retention policy or deleted.",
            code="FILE_EXPIRED",
        )
    return FileResponse(
        path,
        media_type=media_type,
        filename=download_name if download else None,
        content_disposition_type="attachment" if download else "inline",
    )


def _stem(name: str) -> str:
    return name.rsplit(".", 1)[0] or "video"


@router.get("/{job_id}/output", summary="Annotated output video (supports HTTP range requests)")
def get_job_output(
    job_id: str, download: bool = Query(default=False), services: Services = Depends(get_services)
) -> FileResponse:
    record = services.history.get_record(job_id)
    path = services.history.artifact_path(record, "output") if record.status == "completed" else None
    return _serve(path, "video/mp4", f"{_stem(record.source_name)}-annotated.mp4", download)


@router.get("/{job_id}/input", summary="Original uploaded video, while retained")
def get_job_input(
    job_id: str, download: bool = Query(default=False), services: Services = Depends(get_services)
) -> FileResponse:
    record = services.history.get_record(job_id)
    path = services.history.artifact_path(record, "input")
    ext = (record.artifacts.get("input") or "input.mp4").rsplit(".", 1)[-1]
    return _serve(path, VIDEO_MEDIA_TYPES.get(ext, "application/octet-stream"), record.source_name, download)
