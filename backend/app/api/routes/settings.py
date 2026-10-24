from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_services
from app.schemas.settings import CleanupResult, RuntimeSettings, RuntimeSettingsUpdate, StorageStatus
from app.services.container import Services

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=RuntimeSettings, summary="Current server-side defaults")
def get_settings(services: Services = Depends(get_services)) -> RuntimeSettings:
    return services.runtime.get()


@router.put("/settings", response_model=RuntimeSettings, summary="Update server-side defaults")
def update_settings(update: RuntimeSettingsUpdate, services: Services = Depends(get_services)) -> RuntimeSettings:
    return services.runtime.update(update)


@router.post("/settings/reset", response_model=RuntimeSettings, summary="Restore default settings")
def reset_settings(services: Services = Depends(get_services)) -> RuntimeSettings:
    return services.runtime.reset()


@router.get("/storage", response_model=StorageStatus, summary="Storage usage and retention policy")
async def storage_status(services: Services = Depends(get_services)) -> StorageStatus:
    return await run_in_threadpool(services.storage.status)


@router.post("/storage/cleanup", response_model=CleanupResult, summary="Apply the retention policy now")
async def run_cleanup(services: Services = Depends(get_services)) -> CleanupResult:
    return await run_in_threadpool(services.storage.cleanup, services.jobs.active_ids())
