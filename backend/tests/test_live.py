import json
import struct

import cv2
import numpy as np
import pytest
from starlette.websockets import WebSocketDisconnect


def _frame(frame_id: int) -> bytes:
    image = np.zeros((48, 64, 3), dtype=np.uint8)
    ok, buffer = cv2.imencode(".jpg", image)
    assert ok
    return struct.pack(">I", frame_id) + buffer.tobytes()


def test_live_protocol_round_trip(loaded_client):
    with loaded_client.websocket_connect("/api/inference/live") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"
        assert ready["model"]["name"] == "best.pt"

        ws.send_text(json.dumps({"type": "config", "settings": {"confidence": 0.3, "image_size": 320}}))
        ack = ws.receive_json()
        assert ack["type"] == "config_ack"
        assert ack["settings"]["confidence"] == 0.3

        ws.send_bytes(_frame(7))
        result = ws.receive_json()
        assert result["type"] == "result"
        assert result["frame_id"] == 7
        assert (result["width"], result["height"]) == (64, 48)
        assert result["count"] == len(result["detections"])
        assert result["server_ms"] > 0
        assert result["model"]["name"] == "best.pt"

        ws.send_text(json.dumps({"type": "config", "settings": {"iou": 2}}))
        assert ws.receive_json()["code"] == "VALIDATION_ERROR"

        ws.send_bytes(struct.pack(">I", 8) + b"garbage")
        error = ws.receive_json()
        assert error["code"] == "INVALID_FRAME"
        assert error["frame_id"] == 8

        ws.send_text("not json")
        assert ws.receive_json()["code"] == "INVALID_MESSAGE"

        ws.send_text(json.dumps({"type": "ping"}))
        assert ws.receive_json()["type"] == "pong"

    history = loaded_client.get("/api/history", params={"kind": "live"}).json()
    assert history["total"] == 1
    assert history["items"][0]["source_name"] == "Live camera"


def test_live_without_model_reports_error(client):
    with client.websocket_connect("/api/inference/live") as ws:
        assert ws.receive_json()["model"] is None
        ws.send_bytes(_frame(1))
        error = ws.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "MODEL_NOT_LOADED"


def test_live_rejects_foreign_origin(client):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/inference/live", headers={"Origin": "http://evil.example"}) as ws:
            ws.receive_json()
    assert exc.value.code == 1008
