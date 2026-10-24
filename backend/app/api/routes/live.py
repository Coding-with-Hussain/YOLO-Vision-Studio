"""WebSocket endpoint for live camera inference.

Protocol (see README "Live inference protocol"):

Client -> server
    text   {"type": "config", "settings": {...InferenceParams}}   optional, any time
    text   {"type": "ping"}
    binary 4-byte big-endian frame id followed by an encoded JPEG/WebP/PNG frame

Server -> client
    {"type": "ready", "model": {...} | null, "settings": {...}, "max_frame_bytes": n}
    {"type": "config_ack", "settings": {...}}
    {"type": "result", "frame_id": n, "width": w, "height": h, "count": n,
     "detections": [...], "timings": {...}, "server_ms": f, "model": {...}, "dropped": n}
    {"type": "error", "code": "...", "message": "...", "frame_id": n | null}
    {"type": "pong"}

Only the newest unprocessed frame is kept: if frames arrive faster than the
model can process them, older pending frames are dropped (and counted) so the
results never lag behind the camera.
"""

from __future__ import annotations

import asyncio
import json
import logging
import struct
import time
from urllib.parse import urlparse

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.core.errors import AppError
from app.core.utils import new_id, now_iso
from app.models.records import HistoryRecord
from app.schemas.inference import InferenceParams
from app.services.container import Services
from app.services.images import decode_frame
from app.services.inference import class_counts

logger = logging.getLogger(__name__)
router = APIRouter(tags=["live"])

HEADER = struct.Struct(">I")


def _origin_allowed(websocket: WebSocket, allowed: list[str]) -> bool:
    origin = websocket.headers.get("origin")
    if origin is None or "*" in allowed or origin in allowed:
        return True
    # Same-origin deployments (frontend served by the backend host).
    host = websocket.headers.get("host")
    return bool(host) and urlparse(origin).netloc == host


class LiveSession:
    def __init__(self, websocket: WebSocket, services: Services) -> None:
        self.ws = websocket
        self.services = services
        runtime = services.runtime.get()
        self.params = InferenceParams(
            confidence=runtime.default_confidence,
            iou=runtime.default_iou,
            image_size=runtime.default_image_size,
            max_detections=runtime.default_max_detections,
            device=runtime.preferred_device,
        )
        self.pending: tuple[int, bytes] | None = None
        self.has_pending = asyncio.Event()
        self.closed = False
        self.dropped = 0
        # Session statistics, saved to history on disconnect.
        self.started = time.perf_counter()
        self.created_at = now_iso()
        self.frames = 0
        self.total_detections = 0
        self.latencies: list[float] = []
        self.counts: dict[str, int] = {}
        self.model_ref: tuple[str, str, str] | None = None

    async def send(self, payload: dict) -> None:
        if not self.closed:
            await self.ws.send_text(json.dumps(payload))

    async def receive_loop(self) -> None:
        max_bytes = self.services.settings.live_max_frame_bytes
        while True:
            message = await self.ws.receive()
            if message["type"] == "websocket.disconnect":
                return
            if message.get("bytes") is not None:
                data: bytes = message["bytes"]
                if len(data) <= HEADER.size:
                    await self.send({"type": "error", "code": "INVALID_FRAME", "message": "Frame is empty.", "frame_id": None})
                    continue
                (frame_id,) = HEADER.unpack_from(data)
                if len(data) > max_bytes:
                    await self.send({
                        "type": "error", "code": "FRAME_TOO_LARGE", "frame_id": frame_id,
                        "message": f"Frames must be smaller than {max_bytes // 1024} KB; lower the capture resolution.",
                    })  # fmt: skip
                    continue
                if self.pending is not None:
                    self.dropped += 1
                self.pending = (frame_id, data[HEADER.size :])
                self.has_pending.set()
            elif message.get("text") is not None:
                await self.handle_text(message["text"])

    async def handle_text(self, text: str) -> None:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            await self.send({"type": "error", "code": "INVALID_MESSAGE", "message": "Messages must be JSON.", "frame_id": None})
            return
        kind = payload.get("type") if isinstance(payload, dict) else None
        if kind == "ping":
            await self.send({"type": "pong"})
        elif kind == "config":
            try:
                merged = {**self.params.model_dump(), **(payload.get("settings") or {})}
                params = InferenceParams(**merged)
                self.services.devices.resolve(params.device)
            except ValidationError as exc:
                message = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
                await self.send({"type": "error", "code": "VALIDATION_ERROR", "message": message, "frame_id": None})
                return
            except AppError as exc:
                await self.send({"type": "error", "code": exc.code, "message": exc.message, "frame_id": None})
                return
            self.params = params
            await self.send({"type": "config_ack", "settings": params.model_dump()})
        else:
            await self.send({"type": "error", "code": "INVALID_MESSAGE", "message": "Unknown message type.", "frame_id": None})

    async def process_loop(self) -> None:
        services = self.services
        while True:
            await self.has_pending.wait()
            self.has_pending.clear()
            if self.pending is None:
                continue
            frame_id, data = self.pending
            self.pending = None
            started = time.perf_counter()
            try:
                model = services.registry.get_loaded()
                frame = await run_in_threadpool(decode_frame, data)
                prediction = await asyncio.wait_for(
                    run_in_threadpool(services.inference.predict, model, frame, self.params),
                    timeout=services.settings.inference_timeout_s,
                )
            except asyncio.TimeoutError:
                await self.send({"type": "error", "code": "INFERENCE_TIMEOUT", "message": "Inference timed out.", "frame_id": frame_id})
                continue
            except AppError as exc:
                await self.send({"type": "error", "code": exc.code, "message": exc.message, "frame_id": frame_id})
                continue
            server_ms = (time.perf_counter() - started) * 1000

            self.frames += 1
            self.total_detections += len(prediction.detections)
            self.latencies.append(server_ms)
            for name, count in class_counts(prediction.detections).items():
                self.counts[name] = self.counts.get(name, 0) + count
            self.model_ref = (model.id, model.name, model.task)

            await self.send({
                "type": "result",
                "frame_id": frame_id,
                "width": prediction.width,
                "height": prediction.height,
                "count": len(prediction.detections),
                "detections": [d.model_dump(exclude_none=True) for d in prediction.detections],
                "timings": prediction.timings.model_dump(),
                "server_ms": round(server_ms, 2),
                "device": prediction.device,
                "model": {"id": model.id, "name": model.name, "task": model.task},
                "dropped": self.dropped,
            })  # fmt: skip

    def save_history(self) -> None:
        if self.frames == 0 or self.model_ref is None:
            return
        model_id, model_name, task = self.model_ref
        duration_ms = (time.perf_counter() - self.started) * 1000
        avg_latency = sum(self.latencies) / len(self.latencies)
        self.services.history.upsert(
            HistoryRecord(
                id=new_id(),
                kind="live",
                status="completed",
                source_name="Live camera",
                created_at=self.created_at,
                model_id=model_id,
                model_name=model_name,
                task=task,
                num_detections=self.total_detections,
                duration_ms=round(duration_ms, 1),
                avg_inference_ms=round(avg_latency, 2),
                completed_at=now_iso(),
                params=self.params.model_dump(),
                summary={
                    "frames_processed": self.frames,
                    "frames_dropped": self.dropped,
                    "class_counts": dict(sorted(self.counts.items(), key=lambda kv: -kv[1])),
                    "session_seconds": round(duration_ms / 1000, 1),
                },
            )
        )


@router.websocket("/inference/live")
async def live_inference(websocket: WebSocket) -> None:
    services: Services = websocket.app.state.services
    if not _origin_allowed(websocket, services.settings.cors_origin_list):
        await websocket.close(code=1008, reason="Origin not allowed")
        return
    await websocket.accept()
    session = LiveSession(websocket, services)

    model = None
    active_id = services.registry.active_model_id
    if active_id and services.registry.status_of(active_id) == "loaded":
        record = services.registry.get_record(active_id)
        model = {"id": record.id, "name": record.name, "task": record.metadata.get("task")}
    await session.send({
        "type": "ready",
        "model": model,
        "settings": session.params.model_dump(),
        "max_frame_bytes": services.settings.live_max_frame_bytes,
    })  # fmt: skip

    receiver = asyncio.create_task(session.receive_loop())
    processor = asyncio.create_task(session.process_loop())
    try:
        done, pending = await asyncio.wait({receiver, processor}, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if task.exception() and not isinstance(task.exception(), WebSocketDisconnect):
                logger.warning("Live session ended with error: %s", task.exception())
    finally:
        session.closed = True
        for task in (receiver, processor):
            task.cancel()
        await asyncio.gather(receiver, processor, return_exceptions=True)
        try:
            await run_in_threadpool(session.save_history)
        except Exception:  # noqa: BLE001
            logger.exception("Could not save live session history")
