import io
import os
import pickle

from tests.conftest import upload_model, zipped_pickle


class _Evil:
    def __reduce__(self):
        return (os.system, ("echo pwned",))


def _post(client, name: str, data: bytes):
    return client.post("/api/models/upload", files={"file": (name, io.BytesIO(data), "application/octet-stream")})


def _stored_weights(client):
    weights = client.app.state.services.settings.weights_dir
    return [p for p in weights.iterdir() if p.suffix == ".pt" and not p.name.startswith(".")]


def test_rejects_wrong_extension(client):
    response = _post(client, "model.onnx", b"abc")
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "INVALID_MODEL_EXTENSION"


def test_rejects_empty_file(client):
    response = _post(client, "best.pt", b"")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "EMPTY_FILE"


def test_rejects_oversized_file(make_client):
    client = make_client(max_model_size_mb=1)
    response = _post(client, "best.pt", b"0" * (2 * 1024 * 1024 + 10))
    assert response.status_code == 413
    assert _stored_weights(client) == []


def test_rejects_non_checkpoint(client):
    response = _post(client, "best.pt", b"this is not a pytorch file" * 100)
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "MODEL_REJECTED_UNSAFE"
    assert body["details"]["reason"] == "not_zip"
    assert _stored_weights(client) == []


def test_rejects_malicious_pickle_without_executing_it(client, tmp_path):
    marker = tmp_path / "pwned"

    class Touch:
        def __reduce__(self):
            return (os.system, (f"touch {marker}",))

    response = _post(client, "best.pt", zipped_pickle(pickle.dumps({"model": Touch()}, protocol=2)))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "MODEL_REJECTED_UNSAFE"
    assert not marker.exists()
    assert _stored_weights(client) == []


def test_invalid_checkpoint_with_scan_disabled_reports_load_failure(make_client):
    client = make_client(model_security_scan=False)
    response = _post(client, "best.pt", zipped_pickle(pickle.dumps({"weights": [1, 2, 3]}, protocol=2)))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "MODEL_LOAD_FAILED"
    assert client.get("/api/models").json()["models"] == []


def test_classification_model_is_unsupported(client, classify_model_path):
    response = upload_model(client, classify_model_path)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_TASK"
    assert client.get("/api/models").json()["models"] == []


def test_upload_loads_model_with_real_metadata(client, tiny_model_path):
    response = upload_model(client, tiny_model_path, "best.pt")
    assert response.status_code == 201, response.text
    model = response.json()
    assert model["name"] == "best.pt"
    assert model["status"] == "loaded"
    assert model["is_active"] is True
    assert model["task"] == "detect"
    assert model["num_classes"] == 80
    # Built from YAML without a dataset, so the classes are named "0".."79".
    assert model["class_names"][:2] == ["0", "1"]
    assert model["architecture"] == "yolov8n"
    assert model["parameters"] > 1_000_000
    assert model["device"] == "cpu"
    assert model["file_size_bytes"] == tiny_model_path.stat().st_size
    assert len(model["sha256"]) == 64

    listing = client.get("/api/models").json()
    assert listing["active_model_id"] == model["id"]
    assert [m["id"] for m in listing["models"]] == [model["id"]]

    health = client.get("/api/health").json()
    assert health["active_model"]["name"] == "best.pt"

    # Stored under a generated name, never the client's filename.
    assert [p.name for p in _stored_weights(client)] == [f"{model['id']}.pt"]


def test_duplicate_upload_is_detected(loaded_client, tiny_model_path):
    response = upload_model(loaded_client, tiny_model_path, "copy.pt")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MODEL_ALREADY_EXISTS"


def test_load_unload_reload_and_delete(loaded_client):
    model_id = loaded_client.get("/api/models").json()["active_model_id"]

    unloaded = loaded_client.post(f"/api/models/{model_id}/unload").json()
    assert unloaded["status"] == "not_loaded"
    assert loaded_client.get("/api/models").json()["active_model_id"] is None

    reloaded = loaded_client.post(f"/api/models/{model_id}/load", json={"force_reload": True})
    assert reloaded.status_code == 200
    assert reloaded.json()["status"] == "loaded"
    assert reloaded.json()["is_active"] is True

    cuda = loaded_client.post(f"/api/models/{model_id}/load", json={"device": "cuda"})
    if not loaded_client.get("/api/health").json()["cuda_available"]:
        assert cuda.status_code == 400
        assert cuda.json()["error"]["code"] == "DEVICE_UNAVAILABLE"

    assert loaded_client.delete(f"/api/models/{model_id}").status_code == 204
    assert loaded_client.get("/api/models").json() == {"models": [], "active_model_id": None}
    assert loaded_client.get(f"/api/models/{model_id}").status_code == 404
    assert _stored_weights(loaded_client) == []


def test_unknown_and_malformed_model_ids(client):
    assert client.get("/api/models/0123456789abcdef").status_code == 404
    assert client.get("/api/models/..%2F..%2Fetc").status_code == 404
    assert client.delete("/api/models/not-an-id").json()["error"]["code"] == "MODEL_NOT_FOUND"
