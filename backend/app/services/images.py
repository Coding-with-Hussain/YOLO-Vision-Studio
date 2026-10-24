"""Decoding and validation of uploaded images."""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import PayloadTooLarge, UnsupportedMediaType, ValidationFailed

ALLOWED_IMAGE_FORMATS = {"JPEG": "jpg", "MPO": "jpg", "PNG": "png", "WEBP": "webp"}
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


@dataclass
class DecodedImage:
    bgr: np.ndarray
    width: int
    height: int
    format: str


def decode_image(data: bytes, max_pixels: int) -> DecodedImage:
    """Decode an uploaded image, applying EXIF orientation like browsers do."""
    if not data:
        raise ValidationFailed("The uploaded image is empty.", code="EMPTY_FILE")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
            fmt = (image.format or "").upper()
            if fmt not in ALLOWED_IMAGE_FORMATS:
                raise UnsupportedMediaType(
                    f"Unsupported image format '{fmt or 'unknown'}'. Use JPG, PNG or WebP.",
                    code="UNSUPPORTED_IMAGE_FORMAT",
                )
            width, height = image.size
            if width * height > max_pixels:
                raise PayloadTooLarge(
                    f"The image is {width}x{height} pixels, which exceeds the limit of "
                    f"{max_pixels / 1_000_000:.0f} megapixels.",
                    code="IMAGE_TOO_LARGE",
                )
            image.load()
            image = ImageOps.exif_transpose(image) or image
            rgb = np.asarray(image.convert("RGB"))
    except (UnsupportedMediaType, PayloadTooLarge):
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise PayloadTooLarge("The image dimensions are too large.", code="IMAGE_TOO_LARGE") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise ValidationFailed(
            "The file could not be read as an image. It may be corrupted or not an image at all.",
            code="INVALID_IMAGE",
        ) from exc

    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    return DecodedImage(bgr=bgr, width=bgr.shape[1], height=bgr.shape[0], format=fmt)


def decode_frame(data: bytes) -> np.ndarray:
    """Fast path for live camera frames (JPEG/WebP/PNG from a canvas, no EXIF)."""
    array = np.frombuffer(data, dtype=np.uint8)
    frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValidationFailed("The frame could not be decoded.", code="INVALID_FRAME")
    return frame
