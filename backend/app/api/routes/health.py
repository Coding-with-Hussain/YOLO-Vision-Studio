from __future__ import annotations

import platform
import time
from functools import lru_cache

from fastapi import APIRouter, Depends

from app.core.config import APP_NAME, APP_VERSION
from app.schemas.health import ActiveModelSummary, HealthResponse, UploadLimits
from app.api.deps import get_services
from app.services.container import Services
from app.services.video_jobs import describe_encoder

router = APIRouter(tags=["health"])


@lru_cache
def _versions() -> dict[str, str | None]:
    versions: dict[str, str | None] = {}
    for key, module in (("torch", "torch"), ("ultralytics", "ultralytics"), ("opencv", "cv2")):
        try:
            versions[key] = __import__(module).__version__
        except Exception:  # noqa: BLE001
            versions[key] = None
    return versions


@router.get("/health", response_model=HealthResponse, summary="Backend status and runtime capabilities")
def health(services: Services = Depends(get_services)) -> HealthResponse:
    versions = _versions()
    issues: list[str] = []
    if versions["torch"] is None:
        issues.append("PyTorch is not installed.")
    if versions["ultralytics"] is None:
        issues.append("Ultralytics is not installed.")
    for directory in (services.settings.weights_dir, services.settings.outputs_dir, services.settings.uploads_dir):
        if not directory.exists():
            issues.append(f"Storage area '{directory.name}' is missing.")

    active = None
    active_id = services.registry.active_model_id
    if active_id:
        try:
            info = services.registry.info(services.registry.get_record(active_id))
            active = ActiveModelSummary(
                id=info.id, name=info.name, task=info.task, num_classes=info.num_classes, device=info.device
            )
        except Exception:  # noqa: BLE001 - a stale pointer must not break the health check
            active = None

    settings = services.settings
    return HealthResponse(
        status="ok" if not issues else "degraded",
        app=APP_NAME,
        version=APP_VERSION,
        uptime_s=round(time.time() - services.started_at, 1),
        python_version=platform.python_version(),
        torch_version=versions["torch"],
        ultralytics_version=versions["ultralytics"],
        opencv_version=versions["opencv"],
        cuda_available=services.devices.cuda_available,
        mps_available=services.devices.mps_available,
        devices=services.devices.devices(),
        default_device=services.devices.default_device(),
        video_encoder=describe_encoder(),
        model_security_scan=settings.model_security_scan,
        active_model=active,
        limits=UploadLimits(
            max_model_size_mb=settings.max_model_size_mb,
            max_image_size_mb=settings.max_image_size_mb,
            max_video_size_mb=settings.max_video_size_mb,
        ),
        issues=issues,
    )
