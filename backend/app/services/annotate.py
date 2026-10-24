"""Server-side rendering of detections onto images and video frames.

The palette matches ``frontend/src/utils/colors.ts`` so a class has the same
colour in server-rendered images and in the interactive browser overlays.
"""

from __future__ import annotations

from collections.abc import Sequence

import cv2
import numpy as np

from app.schemas.inference import Detection

PALETTE_HEX = [
    "#7C5CFC", "#22D3EE", "#34D399", "#FBBF24", "#F472B6",
    "#60A5FA", "#F87171", "#A3E635", "#FB923C", "#C084FC",
    "#2DD4BF", "#FACC15", "#E879F9", "#38BDF8", "#4ADE80",
    "#FCA5A5", "#818CF8", "#FDBA74", "#5EEAD4", "#F9A8D4",
]  # fmt: skip


def _hex_to_bgr(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    r, g, b = (int(value[i : i + 2], 16) for i in (0, 2, 4))
    return b, g, r


PALETTE_BGR = [_hex_to_bgr(c) for c in PALETTE_HEX]


def class_color(class_id: int) -> tuple[int, int, int]:
    return PALETTE_BGR[class_id % len(PALETTE_BGR)]


def _text_color(bgr: tuple[int, int, int]) -> tuple[int, int, int]:
    b, g, r = bgr
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return (15, 12, 9) if luminance > 150 else (255, 255, 255)


def draw_detections(
    image: np.ndarray,
    detections: Sequence[Detection],
    *,
    show_labels: bool = True,
    show_confidence: bool = True,
) -> np.ndarray:
    """Return a copy of ``image`` (BGR) with boxes and labels drawn on it."""
    canvas = image.copy()
    height, width = canvas.shape[:2]
    short_side = max(1, min(height, width))
    thickness = max(1, round(short_side / 360))
    font_scale = max(0.4, short_side / 1100)
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_thickness = max(1, round(font_scale * 1.6))

    for det in detections:
        color = class_color(det.class_id)
        x1, y1, x2, y2 = (int(round(v)) for v in (det.bbox.x1, det.bbox.y1, det.bbox.x2, det.bbox.y2))

        if det.polygon and len(det.polygon) >= 3:
            points = np.array(det.polygon, dtype=np.int32).reshape(-1, 1, 2)
            overlay = canvas.copy()
            cv2.fillPoly(overlay, [points], color)
            cv2.addWeighted(overlay, 0.25, canvas, 0.75, 0, dst=canvas)
            cv2.polylines(canvas, [points], True, color, thickness, cv2.LINE_AA)
        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, thickness, cv2.LINE_AA)

        if det.keypoints:
            radius = max(2, thickness + 1)
            for kp in det.keypoints:
                if kp.confidence is not None and kp.confidence < 0.5:
                    continue
                cv2.circle(canvas, (int(kp.x), int(kp.y)), radius, color, -1, cv2.LINE_AA)

        if not show_labels and not show_confidence:
            continue
        parts = []
        if show_labels:
            parts.append(det.class_name)
        if show_confidence:
            parts.append(f"{det.confidence * 100:.0f}%")
        label = " ".join(parts)
        (tw, th), baseline = cv2.getTextSize(label, font, font_scale, font_thickness)
        pad = max(2, thickness + 1)
        top = y1 - th - baseline - 2 * pad
        if top < 0:  # no room above the box: draw the label inside it
            top = y1
        cv2.rectangle(canvas, (x1, top), (x1 + tw + 2 * pad, top + th + baseline + 2 * pad), color, -1)
        cv2.putText(
            canvas,
            label,
            (x1 + pad, top + th + pad),
            font,
            font_scale,
            _text_color(color),
            font_thickness,
            cv2.LINE_AA,
        )
    return canvas


def make_thumbnail(image: np.ndarray, max_side: int = 320) -> np.ndarray:
    height, width = image.shape[:2]
    scale = min(1.0, max_side / max(height, width))
    if scale >= 1.0:
        return image
    return cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)


def encode_jpeg(image: np.ndarray, quality: int = 90) -> bytes:
    ok, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise ValueError("Could not encode image")
    return buffer.tobytes()
