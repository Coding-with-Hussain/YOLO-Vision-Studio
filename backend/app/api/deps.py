from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any, TypeVar

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from starlette.concurrency import run_in_threadpool

from app.core.errors import InferenceTimeout
from app.services.container import Services

T = TypeVar("T", bound=BaseModel)


def get_services(request: Request) -> Services:
    return request.app.state.services


def parse_json_form(raw: str | None, model: type[T], defaults: dict[str, Any]) -> T:
    """Parse a JSON settings form field, falling back to ``defaults`` for missing keys."""
    data: dict[str, Any] = {}
    if raw:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RequestValidationError(
                [{"loc": ("settings",), "msg": f"settings must be valid JSON ({exc.msg})", "type": "json"}]
            ) from exc
        if not isinstance(data, dict):
            raise RequestValidationError(
                [{"loc": ("settings",), "msg": "settings must be a JSON object", "type": "json"}]
            )
    try:
        return model(**{**defaults, **data})
    except ValidationError as exc:
        raise RequestValidationError(
            [{**err, "loc": ("settings", *err.get("loc", ()))} for err in exc.errors()]
        ) from exc


R = TypeVar("R")


async def run_with_timeout(func: Callable[..., R], *args: Any, timeout: float) -> R:
    """Run blocking work in the thread pool, failing with 504 after ``timeout`` seconds.

    The worker thread cannot be interrupted, so a timed-out prediction still
    finishes in the background; its result is discarded.
    """
    try:
        return await asyncio.wait_for(run_in_threadpool(func, *args), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise InferenceTimeout(
            f"Inference did not finish within {timeout:.0f} seconds. Try a smaller image size or a "
            "faster device."
        ) from exc
