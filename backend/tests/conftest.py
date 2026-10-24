"""Shared fixtures.

Tests never download anything: the "tiny" model is an untrained YOLOv8n built
from the YAML definition bundled with Ultralytics. Its predictions are
meaningless, but it is a genuine checkpoint that exercises the full upload,
validation, loading and inference code paths.
"""

from __future__ import annotations

import io
import os
import time
import zipfile
from collections.abc import Iterator
from pathlib import Path

os.environ.setdefault("YOLO_OFFLINE", "true")
os.environ.setdefault("YOLO_AUTOINSTALL", "false")

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def model_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return tmp_path_factory.mktemp("models")


@pytest.fixture(scope="session")
def tiny_model_path(model_dir: Path) -> Path:
    from ultralytics import YOLO

    path = model_dir / "tiny-detect.pt"
    YOLO("yolov8n.yaml").save(str(path))
    return path


@pytest.fixture(scope="session")
def classify_model_path(model_dir: Path) -> Path:
    from ultralytics import YOLO

    path = model_dir / "tiny-cls.pt"
    YOLO("yolov8n-cls.yaml").save(str(path))
    return path


def make_settings(tmp_path: Path, **overrides) -> Settings:
    values = {
        "storage_dir": tmp_path / "storage",
        "autoload_last_model": False,
        "cors_origins": "http://localhost:5173",
        "_env_file": None,
    }
    values.update(overrides)
    return Settings(**values)


@pytest.fixture
def make_client(tmp_path: Path):
    clients: list[TestClient] = []

    def factory(**overrides) -> TestClient:
        app = create_app(make_settings(tmp_path, **overrides), start_background_tasks=False)
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


def upload_model(client: TestClient, path: Path, name: str | None = None):
    with path.open("rb") as handle:
        return client.post(
            "/api/models/upload",
            files={"file": (name or path.name, handle, "application/octet-stream")},
        )


@pytest.fixture
def loaded_client(client: TestClient, tiny_model_path: Path) -> TestClient:
    response = upload_model(client, tiny_model_path, "best.pt")
    assert response.status_code == 201, response.text
    return client


def png_bytes(width: int = 96, height: int = 64) -> bytes:
    image = np.zeros((height, width, 3), dtype=np.uint8)
    cv2.rectangle(image, (10, 10), (width - 10, height - 10), (0, 200, 255), -1)
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    return buffer.tobytes()


def make_video(path: Path, frames: int = 12, size: tuple[int, int] = (160, 96), fps: float = 10.0) -> Path:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    assert writer.isOpened()
    for i in range(frames):
        frame = np.full((size[1], size[0], 3), (i * 20) % 255, dtype=np.uint8)
        cv2.circle(frame, (20 + i * 5, size[1] // 2), 12, (255, 255, 255), -1)
        writer.write(frame)
    writer.release()
    return path


def zipped_pickle(payload: bytes) -> bytes:
    """A torch-style zip container whose data.pkl is ``payload``."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("archive/data.pkl", payload)
    return buffer.getvalue()


def wait_for_job(client: TestClient, job_id: str, timeout: float = 120.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["status"] in ("completed", "failed", "cancelled"):
            return body
        time.sleep(0.2)
    raise AssertionError(f"job {job_id} did not finish within {timeout}s")


@pytest.fixture
def video_file(tmp_path: Path) -> Iterator[Path]:
    yield make_video(tmp_path / "clip.mp4")
