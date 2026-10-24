from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import FileResponse

from app.api.deps import get_services
from app.core.errors import ConflictError, ResourceExpired
from app.schemas.history import HistoryDetail, HistoryKind, HistoryListResponse, HistoryStatus, StatsResponse
from app.services.container import Services

router = APIRouter(tags=["history"])

IMAGE_MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png"}


@router.get("/history", response_model=HistoryListResponse, summary="Search inference history")
def list_history(
    q: str | None = Query(default=None, max_length=200, description="Search filename or model name"),
    kind: HistoryKind | None = None,
    status_filter: HistoryStatus | None = Query(default=None, alias="status"),
    date_from: str | None = Query(default=None, description="ISO date/time lower bound (UTC)"),
    date_to: str | None = Query(default=None, description="ISO date/time upper bound (UTC)"),
    sort: Literal["created_at", "duration", "detections", "name"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    services: Services = Depends(get_services),
) -> HistoryListResponse:
    return services.history.list(
        q=q,
        kind=kind,
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
        order=order,
        limit=limit,
        offset=offset,
    )


@router.get("/history/{entry_id}", response_model=HistoryDetail, summary="History entry details")
def get_history_entry(entry_id: str, services: Services = Depends(get_services)) -> HistoryDetail:
    return services.history.to_detail(services.history.get_record(entry_id))


@router.delete("/history/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an entry and its files")
def delete_history_entry(entry_id: str, services: Services = Depends(get_services)) -> None:
    if entry_id in services.jobs.active_ids():
        raise ConflictError("Cancel the running job before deleting it.", code="JOB_RUNNING")
    services.history.delete(entry_id)


@router.delete("/history", summary="Delete every finished history entry and its files")
def clear_history(services: Services = Depends(get_services)) -> dict[str, int]:
    return {"deleted": services.history.delete_all(exclude=services.jobs.active_ids())}


@router.get("/stats", response_model=StatsResponse, summary="Aggregate statistics for the dashboard")
def get_stats(
    days: int = Query(default=14, ge=1, le=90), services: Services = Depends(get_services)
) -> StatsResponse:
    return services.history.stats(days)


@router.get("/results/{entry_id}/{artifact}", summary="Retained image result files")
def get_result_file(
    entry_id: str,
    artifact: Literal["annotated", "original", "thumbnail"],
    download: bool = Query(default=False),
    services: Services = Depends(get_services),
) -> FileResponse:
    record = services.history.get_record(entry_id)
    path = services.history.artifact_path(record, artifact)
    if path is None:
        raise ResourceExpired(
            "This file is no longer available. It was removed by the retention policy or deleted.",
            code="FILE_EXPIRED",
        )
    ext = path.suffix.lstrip(".")
    stem = record.source_name.rsplit(".", 1)[0] or "image"
    return FileResponse(
        path,
        media_type=IMAGE_MEDIA_TYPES.get(ext, "application/octet-stream"),
        filename=f"{stem}-{artifact}.{ext}" if download else None,
        content_disposition_type="attachment" if download else "inline",
    )
