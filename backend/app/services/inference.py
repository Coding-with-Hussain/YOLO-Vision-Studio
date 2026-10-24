"""Running Ultralytics predictions and converting results to API schemas."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from app.core.errors import InferenceError, OutOfMemory, ValidationFailed
from app.schemas.inference import BoundingBox, Detection, InferenceParams, Keypoint, Timings
from app.services.devices import DeviceManager
from app.services.model_registry import LoadedModel

logger = logging.getLogger(__name__)

MAX_POLYGON_POINTS = 160


@dataclass
class Prediction:
    detections: list[Detection]
    timings: Timings
    width: int
    height: int
    device: str


def _is_oom(exc: BaseException) -> bool:
    if isinstance(exc, MemoryError):
        return True
    try:
        import torch

        if isinstance(exc, torch.cuda.OutOfMemoryError):
            return True
    except Exception:  # noqa: BLE001
        pass
    return "out of memory" in str(exc).lower()


def _to_numpy(value: Any) -> np.ndarray | None:
    if value is None:
        return None
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "numpy"):
        value = value.numpy()
    return np.asarray(value)


def _simplify_polygon(points: np.ndarray) -> list[list[float]] | None:
    if points is None or len(points) < 3:
        return None
    contour = points.astype(np.float32).reshape(-1, 1, 2)
    if len(contour) > MAX_POLYGON_POINTS:
        epsilon = 0.002 * cv2.arcLength(contour, True)
        contour = cv2.approxPolyDP(contour, epsilon, True)
        if len(contour) > MAX_POLYGON_POINTS:
            step = int(np.ceil(len(contour) / MAX_POLYGON_POINTS))
            contour = contour[::step]
    return [[round(float(x), 1), round(float(y), 1)] for x, y in contour.reshape(-1, 2)]


def results_to_detections(result: Any, model: LoadedModel, width: int, height: int) -> list[Detection]:
    """Convert one Ultralytics ``Results`` object to :class:`Detection` records."""
    polygons: list[np.ndarray] | None = None
    keypoints_xy = keypoints_conf = None

    obb = getattr(result, "obb", None)
    if obb is not None and len(obb) > 0:
        xyxy = _to_numpy(obb.xyxy)
        conf = _to_numpy(obb.conf)
        cls = _to_numpy(obb.cls)
        corners = _to_numpy(obb.xyxyxyxy)
        polygons = list(corners) if corners is not None else None
    else:
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return []
        xyxy = _to_numpy(boxes.xyxy)
        conf = _to_numpy(boxes.conf)
        cls = _to_numpy(boxes.cls)
        masks = getattr(result, "masks", None)
        if masks is not None:
            polygons = [np.asarray(p) for p in masks.xy]
        kps = getattr(result, "keypoints", None)
        if kps is not None:
            keypoints_xy = _to_numpy(kps.xy)
            keypoints_conf = _to_numpy(kps.conf) if getattr(kps, "conf", None) is not None else None

    detections: list[Detection] = []
    for i in range(len(xyxy)):
        x1, y1, x2, y2 = (float(v) for v in xyxy[i])
        x1, x2 = max(0.0, min(x1, width)), max(0.0, min(x2, width))
        y1, y2 = max(0.0, min(y1, height)), max(0.0, min(y2, height))
        class_id = int(cls[i])
        detection = Detection(
            class_id=class_id,
            class_name=model.class_name(class_id),
            confidence=round(float(conf[i]), 4),
            bbox=BoundingBox(
                x1=round(x1, 2),
                y1=round(y1, 2),
                x2=round(x2, 2),
                y2=round(y2, 2),
                x=round(x1, 2),
                y=round(y1, 2),
                width=round(x2 - x1, 2),
                height=round(y2 - y1, 2),
            ),
        )
        if polygons is not None and i < len(polygons):
            detection.polygon = _simplify_polygon(polygons[i])
        if keypoints_xy is not None and i < len(keypoints_xy):
            detection.keypoints = [
                Keypoint(
                    x=round(float(p[0]), 1),
                    y=round(float(p[1]), 1),
                    confidence=None if keypoints_conf is None else round(float(keypoints_conf[i][k]), 3),
                )
                for k, p in enumerate(keypoints_xy[i])
            ]
        detections.append(detection)
    detections.sort(key=lambda d: d.confidence, reverse=True)
    return detections


def class_counts(detections: list[Detection]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for det in detections:
        counts[det.class_name] = counts.get(det.class_name, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


class InferenceService:
    def __init__(self, devices: DeviceManager) -> None:
        self.devices = devices

    def validate_classes(self, model: LoadedModel, classes: list[int] | None) -> list[int] | None:
        if not classes:
            return None
        unknown = [c for c in classes if c not in model.names]
        if unknown:
            raise ValidationFailed(
                f"Class ids {unknown[:10]} do not exist in model '{model.name}'.",
                code="UNKNOWN_CLASSES",
                details={"unknown": unknown[:50], "num_classes": len(model.names)},
            )
        return classes

    def predict(self, model: LoadedModel, image: np.ndarray, params: InferenceParams) -> Prediction:
        """Run one prediction on a BGR image. Thread safe per model instance."""
        device = self.devices.resolve(params.device)
        classes = self.validate_classes(model, params.classes)
        height, width = image.shape[:2]

        start = time.perf_counter()
        with model.lock:
            model.ensure_device(device)
            try:
                results = model.yolo.predict(
                    source=image,
                    conf=params.confidence,
                    iou=params.iou,
                    imgsz=params.image_size,
                    max_det=params.max_detections,
                    classes=classes,
                    device=device,
                    verbose=False,
                )
            except Exception as exc:  # noqa: BLE001
                if _is_oom(exc):
                    _free_cuda_cache()
                    raise OutOfMemory(
                        "The backend ran out of memory during inference. Try a smaller image size, "
                        "fewer concurrent jobs, or the CPU device.",
                    ) from exc
                logger.exception("Inference failed")
                raise InferenceError(f"Inference failed: {exc}", details={"exception": type(exc).__name__}) from exc
        total_ms = (time.perf_counter() - start) * 1000

        result = results[0]
        detections = results_to_detections(result, model, width, height)
        speed = getattr(result, "speed", None) or {}
        timings = Timings(
            preprocess_ms=_round(speed.get("preprocess")),
            inference_ms=_round(speed.get("inference")),
            postprocess_ms=_round(speed.get("postprocess")),
            total_ms=round(total_ms, 2),
        )
        return Prediction(detections=detections, timings=timings, width=width, height=height, device=device)


def _round(value: Any) -> float | None:
    return None if value is None else round(float(value), 2)


def _free_cuda_cache() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass
