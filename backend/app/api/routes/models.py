from __future__ import annotations

import secrets

from fastapi import APIRouter, Body, Depends, File, Form, Request, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_services
from app.core.errors import PayloadTooLarge, UnsupportedMediaType
from app.core.utils import file_extension
from app.schemas.models import LoadModelRequest, ModelInfo, ModelListResponse
from app.schemas.settings import DevicePreference
from app.services.container import Services
from app.services.storage import save_upload

router = APIRouter(prefix="/models", tags=["models"])


@router.post(
    "/upload",
    response_model=ModelInfo,
    status_code=status.HTTP_201_CREATED,
    summary="Upload, validate and load a YOLO .pt checkpoint",
)
async def upload_model(
    request: Request,
    file: UploadFile = File(..., description="Ultralytics YOLO checkpoint (.pt)"),
    device: DevicePreference | None = Form(default=None),
    services: Services = Depends(get_services),
) -> ModelInfo:
    if file_extension(file.filename) != "pt":
        raise UnsupportedMediaType(
            "Only PyTorch .pt checkpoints are accepted.", code="INVALID_MODEL_EXTENSION"
        )
    max_bytes = services.settings.max_model_size_mb * 1024 * 1024
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes + 1024 * 1024:
        raise PayloadTooLarge(
            f"The model exceeds the maximum size of {services.settings.max_model_size_mb} MB.",
            details={"max_bytes": max_bytes},
        )
    temp = services.storage.temp_model_path(secrets.token_hex(8))
    await save_upload(file, temp, max_bytes)
    return await run_in_threadpool(services.registry.register_upload, temp, file.filename, device)


@router.get("", response_model=ModelListResponse, summary="List uploaded models")
def list_models(services: Services = Depends(get_services)) -> ModelListResponse:
    return ModelListResponse(models=services.registry.list_info(), active_model_id=services.registry.active_model_id)


@router.get("/{model_id}", response_model=ModelInfo, summary="Get model metadata")
def get_model(model_id: str, services: Services = Depends(get_services)) -> ModelInfo:
    return services.registry.info(services.registry.get_record(model_id))


@router.post("/{model_id}/load", response_model=ModelInfo, summary="Load (or reload) a model and make it active")
async def load_model(
    model_id: str,
    body: LoadModelRequest | None = Body(default=None),
    services: Services = Depends(get_services),
) -> ModelInfo:
    body = body or LoadModelRequest()
    await run_in_threadpool(services.registry.load, model_id, body.device, body.force_reload)
    return services.registry.info(services.registry.get_record(model_id))


@router.post("/{model_id}/unload", response_model=ModelInfo, summary="Release a model from memory")
def unload_model(model_id: str, services: Services = Depends(get_services)) -> ModelInfo:
    record = services.registry.get_record(model_id)
    services.registry.unload(model_id)
    return services.registry.info(record)


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove a model and its file")
def delete_model(model_id: str, services: Services = Depends(get_services)) -> None:
    services.registry.delete(model_id)
