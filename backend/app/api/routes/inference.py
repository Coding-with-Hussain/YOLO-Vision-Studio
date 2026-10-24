from __future__ import annotations

import base64
import shutil

import cv2
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_services, parse_json_form, run_with_timeout
from app.core.errors import PayloadTooLarge, UnsupportedMediaType
from app.core.utils import display_filename, file_extension, iso_in, new_id, now_iso
from app.models.records import HistoryRecord
from app.schemas.inference import ImageInferenceResponse, ImageInfo, InferenceParams, ModelRef
from app.schemas.jobs import JobResponse, VideoJobSettings
from app.services.annotate import draw_detections, encode_jpeg, make_thumbnail
from app.services.container import Services
from app.services.images import ALLOWED_IMAGE_EXTENSIONS, decode_image
from app.services.inference import class_counts
from app.services.storage import save_upload
from app.services.video_jobs import ALLOWED_VIDEO_EXTENSIONS, probe_video

router = APIRouter(prefix="/inference", tags=["inference"])

SETTINGS_DESCRIPTION = (
    "JSON object with inference settings. Omitted keys use the server defaults, e.g. "
    '{"confidence": 0.4, "iou": 0.5, "image_size": 640, "classes": [0, 2]}'
)


def _defaults(services: Services) -> dict:
    runtime = services.runtime.get()
    return {
        "confidence": runtime.default_confidence,
        "iou": runtime.default_iou,
        "image_size": runtime.default_image_size,
        "max_detections": runtime.default_max_detections,
        "device": runtime.preferred_device,
    }


async def _read_limited(upload: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while chunk := await upload.read(1024 * 1024):
        size += len(chunk)
        if size > max_bytes:
            raise PayloadTooLarge(
                f"The image exceeds the maximum upload size of {max_bytes // (1024 * 1024)} MB.",
                code="IMAGE_TOO_LARGE",
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/image", response_model=ImageInferenceResponse, summary="Detect objects in an image")
async def infer_image(
    file: UploadFile = File(..., description="JPG, PNG or WebP image"),
    settings: str | None = Form(default=None, description=SETTINGS_DESCRIPTION),
    model_id: str | None = Form(default=None, description="Model to use; defaults to the active model"),
    save: bool | None = Form(default=None, description="Retain annotated output on the server"),
    services: Services = Depends(get_services),
) -> ImageInferenceResponse:
    ext = file_extension(file.filename)
    if ext and ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise UnsupportedMediaType(
            f"'.{ext}' files are not supported. Use JPG, PNG or WebP.", code="UNSUPPORTED_IMAGE_FORMAT"
        )
    params = parse_json_form(settings, InferenceParams, _defaults(services))
    model = services.registry.get_loaded(model_id)
    data = await _read_limited(file, services.settings.max_image_size_mb * 1024 * 1024)
    image = await run_in_threadpool(decode_image, data, services.settings.max_image_pixels)

    prediction = await run_with_timeout(
        services.inference.predict, model, image.bgr, params, timeout=services.settings.inference_timeout_s
    )

    annotated = await run_in_threadpool(draw_detections, image.bgr, prediction.detections)
    entry_id = new_id()
    created = now_iso()
    runtime = services.runtime.get()
    keep = runtime.save_image_results if save is None else save
    source_name = display_filename(file.filename, fallback="image")
    counts = class_counts(prediction.detections)

    annotated_data_url = None
    artifacts: dict[str, str] = {}
    if keep:
        out_dir = services.storage.output_dir(entry_id)
        out_dir.mkdir(parents=True, exist_ok=True)

        def _write() -> None:
            (out_dir / "annotated.jpg").write_bytes(encode_jpeg(annotated, 92))
            original_ext = "png" if image.format == "PNG" else "jpg"
            if image.format == "PNG":
                ok, buf = cv2.imencode(".png", image.bgr)
                (out_dir / f"original.{original_ext}").write_bytes(buf.tobytes())
            else:
                (out_dir / "original.jpg").write_bytes(encode_jpeg(image.bgr, 95))
            (out_dir / "thumbnail.jpg").write_bytes(encode_jpeg(make_thumbnail(annotated), 82))
            artifacts.update(
                {"annotated": "annotated.jpg", "original": f"original.{original_ext}", "thumbnail": "thumbnail.jpg"}
            )

        await run_in_threadpool(_write)
    else:
        jpeg = await run_in_threadpool(encode_jpeg, annotated, 90)
        annotated_data_url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode("ascii")

    services.history.upsert(
        HistoryRecord(
            id=entry_id,
            kind="image",
            status="completed",
            source_name=source_name,
            created_at=created,
            model_id=model.id,
            model_name=model.name,
            task=model.task,
            num_detections=len(prediction.detections),
            duration_ms=prediction.timings.total_ms,
            avg_inference_ms=prediction.timings.inference_ms or prediction.timings.total_ms,
            completed_at=created,
            params=params.model_dump(),
            summary={
                "class_counts": counts,
                "width": image.width,
                "height": image.height,
                "device": prediction.device,
                "timings": prediction.timings.model_dump(),
                "detections": [d.model_dump() for d in prediction.detections] if keep else [],
            },
            artifacts=artifacts,
            expires_at=iso_in(runtime.output_retention_hours) if keep else None,
        )
    )

    base = f"/api/results/{entry_id}"
    return ImageInferenceResponse(
        id=entry_id,
        created_at=created,
        model=ModelRef(id=model.id, name=model.name, task=model.task),
        image=ImageInfo(filename=source_name, width=image.width, height=image.height),
        params=params,
        device=prediction.device,
        count=len(prediction.detections),
        class_counts=counts,
        detections=prediction.detections,
        timings=prediction.timings,
        saved=keep,
        annotated_url=f"{base}/annotated" if keep else None,
        original_url=f"{base}/original" if keep else None,
        thumbnail_url=f"{base}/thumbnail" if keep else None,
        annotated_data_url=annotated_data_url,
    )


@router.post(
    "/video",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a video and start an asynchronous detection job",
)
async def infer_video(
    request: Request,
    file: UploadFile = File(..., description="MP4, WebM, MOV, MKV or AVI video"),
    settings: str | None = Form(default=None, description=SETTINGS_DESCRIPTION),
    model_id: str | None = Form(default=None),
    services: Services = Depends(get_services),
) -> JobResponse:
    ext = file_extension(file.filename)
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise UnsupportedMediaType(
            "Unsupported video type. Use MP4, WebM, MOV, MKV or AVI.", code="UNSUPPORTED_VIDEO_FORMAT"
        )
    job_settings = parse_json_form(settings, VideoJobSettings, _defaults(services))
    model = services.registry.get_loaded(model_id)
    services.inference.validate_classes(model, job_settings.classes)

    max_bytes = services.settings.max_video_size_mb * 1024 * 1024
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes + 1024 * 1024:
        raise PayloadTooLarge(
            f"The video exceeds the maximum size of {services.settings.max_video_size_mb} MB.",
            code="VIDEO_TOO_LARGE",
        )

    job_id = new_id()
    upload_dir = services.storage.upload_dir(job_id)
    input_name = f"input.{ext}"
    try:
        await save_upload(file, upload_dir / input_name, max_bytes)
        source_name = display_filename(file.filename, fallback="video")
        video = await run_in_threadpool(probe_video, upload_dir / input_name, source_name)
        return services.jobs.submit(job_id, input_name, source_name, video, model, job_settings)
    except BaseException:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise
