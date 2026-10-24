"""Optional accuracy check with a real trained checkpoint.

Runs only when ``YVS_TEST_MODEL`` points to a COCO-trained Ultralytics model,
for example ``YVS_TEST_MODEL=/path/to/yolo11n.pt pytest tests/test_real_model.py``.
"""

import os
from pathlib import Path

import pytest

from tests.conftest import upload_model

MODEL = os.environ.get("YVS_TEST_MODEL")
pytestmark = pytest.mark.skipif(not MODEL or not Path(MODEL).is_file(), reason="set YVS_TEST_MODEL to a .pt file")


def test_detects_people_and_bus(client):
    import ultralytics

    response = upload_model(client, Path(MODEL))
    assert response.status_code == 201, response.text
    image = Path(ultralytics.__file__).parent / "assets" / "bus.jpg"
    with image.open("rb") as handle:
        result = client.post("/api/inference/image", files={"file": ("bus.jpg", handle, "image/jpeg")}).json()
    names = {d["class_name"] for d in result["detections"]}
    assert {"person", "bus"} <= names
    assert result["class_counts"]["person"] >= 3
    assert (result["image"]["width"], result["image"]["height"]) == (810, 1080)
