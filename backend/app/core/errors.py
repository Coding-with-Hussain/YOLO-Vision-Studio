"""Application errors and the JSON error envelope used by every endpoint.

All failures are returned as::

    {"error": {"code": "MODEL_NOT_LOADED", "message": "...", "details": {...}}}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """An expected failure that maps to a specific HTTP status and error code."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "BAD_REQUEST"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "details": self.details}


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "CONFLICT"


class ValidationFailed(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"


class PayloadTooLarge(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"


class UnsupportedMediaType(AppError):
    status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    code = "UNSUPPORTED_MEDIA_TYPE"


class ModelNotLoaded(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "MODEL_NOT_LOADED"


class ModelLoadError(AppError):
    status_code = 422
    code = "MODEL_LOAD_FAILED"


class UnsafeModelError(AppError):
    status_code = 422
    code = "MODEL_REJECTED_UNSAFE"


class DeviceUnavailable(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "DEVICE_UNAVAILABLE"


class InferenceError(AppError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    code = "INFERENCE_FAILED"


class OutOfMemory(AppError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "OUT_OF_MEMORY"


class InferenceTimeout(AppError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    code = "INFERENCE_TIMEOUT"


class ResourceExpired(AppError):
    status_code = status.HTTP_410_GONE
    code = "RESOURCE_EXPIRED"


def _error_response(status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _error_response(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = []
        for err in exc.errors():
            loc = [str(part) for part in err.get("loc", []) if part not in ("body", "query", "path")]
            errors.append({"field": ".".join(loc) or None, "message": err.get("msg", "Invalid value")})
        message = "; ".join(
            f"{e['field']}: {e['message']}" if e["field"] else e["message"] for e in errors
        ) or "Invalid request"
        return _error_response(422, "VALIDATION_ERROR", message, {"errors": errors})

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return _error_response(exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error: %s", exc)
        return _error_response(500, "INTERNAL_ERROR", "An unexpected server error occurred.")
