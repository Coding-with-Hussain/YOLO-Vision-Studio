import io
import json

import numpy as np
import pytest
import torch
from PIL import Image

from app.services.inference import results_to_detections
from app.services.model_registry import LoadedModel
from tests.conftest import png_bytes


def _infer(client, data: bytes, name: str = "scene.png", settings: dict | None = None, **form):
    fields = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in form.items()}
    if settings is not None:
        fields["settings"] = json.dumps(settings)
    return client.post("/api/inference/image", files={"file": (name, io.BytesIO(data), "image/png")}, data=fields)


def test_requires_a_loaded_model(client):
    response = _infer(client, png_bytes())
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MODEL_NOT_LOADED"


def test_image_inference_response_format(loaded_client):
    response = _infer(loaded_client, png_bytes(96, 64), settings={"confidence": 0.05, "image_size": 320})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["image"] == {"filename": "scene.png", "width": 96, "height": 64}
    assert body["model"]["name"] == "best.pt"
    assert body["model"]["task"] == "detect"
    assert body["params"]["confidence"] == 0.05
    assert body["params"]["image_size"] == 320
    assert body["device"] == "cpu"
    assert body["count"] == len(body["detections"])
    assert sum(body["class_counts"].values()) == body["count"]
    assert body["timings"]["total_ms"] > 0
    assert body["timings"]["inference_ms"] is not None
    for det in body["detections"]:
        assert set(det) >= {"class_id", "class_name", "confidence", "bbox"}
        assert 0.05 <= det["confidence"] <= 1
        box = det["bbox"]
        assert 0 <= box["x1"] <= box["x2"] <= 96
        assert box["width"] == pytest.approx(box["x2"] - box["x1"], abs=0.02)
    assert body["saved"] is True

    annotated = loaded_client.get(body["annotated_url"])
    assert annotated.status_code == 200
    assert annotated.headers["content-type"] == "image/jpeg"
    download = loaded_client.get(body["annotated_url"] + "?download=true")
    assert "attachment" in download.headers["content-disposition"]
    assert loaded_client.get(body["thumbnail_url"]).status_code == 200
    assert loaded_client.get(body["original_url"]).headers["content-type"] == "image/png"

    history = loaded_client.get("/api/history").json()
    assert history["total"] == 1
    assert history["items"][0]["kind"] == "image"
    assert history["items"][0]["artifacts"]["annotated_url"] == body["annotated_url"]
    stats = loaded_client.get("/api/stats").json()
    assert stats["images_processed"] == 1
    assert stats["total_detections"] == body["count"]


def test_unsaved_results_are_returned_inline(loaded_client):
    body = _infer(loaded_client, png_bytes(), save=False).json()
    assert body["saved"] is False
    assert body["annotated_url"] is None
    assert body["annotated_data_url"].startswith("data:image/jpeg;base64,")


def test_exif_orientation_is_applied(loaded_client):
    image = Image.new("RGB", (120, 40), (200, 30, 30))
    exif = image.getexif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise when displayed
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif.tobytes())
    body = _infer(loaded_client, buffer.getvalue(), name="phone.jpg").json()
    assert (body["image"]["width"], body["image"]["height"]) == (40, 120)


@pytest.mark.parametrize(
    "settings, field",
    [
        ({"confidence": 1.5}, "settings.confidence"),
        ({"confidence": 0.01}, "settings.confidence"),
        ({"iou": 0.95}, "settings.iou"),
        ({"image_size": 650}, "settings.image_size"),
        ({"max_detections": 0}, "settings.max_detections"),
        ({"device": "tpu"}, "settings.device"),
        ({"unknown": 1}, "settings.unknown"),
    ],
)
def test_settings_validation(loaded_client, settings, field):
    response = _infer(loaded_client, png_bytes(), settings=settings)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert field in [e["field"] for e in error["details"]["errors"]]


def test_invalid_settings_json(loaded_client):
    response = loaded_client.post(
        "/api/inference/image",
        files={"file": ("a.png", io.BytesIO(png_bytes()), "image/png")},
        data={"settings": "{not json"},
    )
    assert response.status_code == 422


def test_unknown_classes_are_rejected(loaded_client):
    response = _infer(loaded_client, png_bytes(), settings={"classes": [0, 500]})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNKNOWN_CLASSES"


def test_class_filter_is_applied(loaded_client):
    body = _infer(loaded_client, png_bytes(), settings={"classes": [0], "confidence": 0.05}).json()
    assert body["params"]["classes"] == [0]
    assert all(d["class_id"] == 0 for d in body["detections"])


def test_cuda_request_without_gpu(loaded_client):
    if loaded_client.get("/api/health").json()["cuda_available"]:
        pytest.skip("CUDA is available on this machine")
    response = _infer(loaded_client, png_bytes(), settings={"device": "cuda"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "DEVICE_UNAVAILABLE"


def test_invalid_image_payloads(loaded_client):
    corrupt = _infer(loaded_client, b"\x89PNG\r\n\x1a\nnot really", name="broken.png")
    assert corrupt.status_code == 422
    assert corrupt.json()["error"]["code"] == "INVALID_IMAGE"

    wrong_ext = _infer(loaded_client, png_bytes(), name="scene.gif")
    assert wrong_ext.status_code == 415

    gif = io.BytesIO()
    Image.new("RGB", (8, 8)).save(gif, format="GIF")
    disguised = _infer(loaded_client, gif.getvalue(), name="scene.png")
    assert disguised.status_code == 415
    assert disguised.json()["error"]["code"] == "UNSUPPORTED_IMAGE_FORMAT"

    empty = _infer(loaded_client, b"", name="empty.png")
    assert empty.status_code == 422


def test_oversized_image(make_client, tiny_model_path):
    from tests.conftest import upload_model

    client = make_client(max_image_pixels=1_000_000)
    assert upload_model(client, tiny_model_path).status_code == 201
    response = _infer(client, png_bytes(1200, 1000))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "IMAGE_TOO_LARGE"


class _FakeBoxes:
    def __init__(self):
        self.xyxy = torch.tensor([[10.0, 20.0, 50.0, 80.0], [-5.0, 0.0, 30.0, 300.0]])
        self.conf = torch.tensor([0.42, 0.91])
        self.cls = torch.tensor([1.0, 0.0])

    def __len__(self):
        return 2


class _FakeResult:
    boxes = _FakeBoxes()
    masks = None
    keypoints = None
    obb = None


def test_results_conversion_clamps_and_sorts():
    model = LoadedModel(
        id="0" * 16, name="m.pt", yolo=None, task="detect", names={0: "person", 1: "car"},
        device="cpu", loaded_at="", load_time_ms=0,
    )
    detections = results_to_detections(_FakeResult(), model, width=100, height=100)
    assert [d.class_name for d in detections] == ["person", "car"]  # sorted by confidence
    person = detections[0]
    assert person.bbox.x1 == 0 and person.bbox.y2 == 100  # clamped to the image
    car = detections[1]
    assert (car.bbox.x, car.bbox.y, car.bbox.width, car.bbox.height) == (10, 20, 40, 60)
    assert np.isclose(car.confidence, 0.42)
