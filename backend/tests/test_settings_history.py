import io
import time

from tests.conftest import png_bytes


def test_settings_defaults_and_update(client):
    defaults = client.get("/api/settings").json()
    assert defaults["default_confidence"] == 0.25
    assert defaults["default_iou"] == 0.45

    updated = client.put("/api/settings", json={"default_confidence": 0.5, "output_retention_hours": 12})
    assert updated.status_code == 200
    assert updated.json()["default_confidence"] == 0.5
    assert client.get("/api/settings").json()["output_retention_hours"] == 12

    for bad in ({"default_confidence": 2}, {"default_image_size": 650}, {"preferred_device": "gpu"}, {"x": 1}):
        response = client.put("/api/settings", json=bad)
        assert response.status_code == 422, bad
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    reset = client.post("/api/settings/reset").json()
    assert reset["default_confidence"] == 0.25


def test_defaults_apply_to_inference(loaded_client):
    loaded_client.put("/api/settings", json={"default_confidence": 0.6, "default_image_size": 320})
    body = loaded_client.post(
        "/api/inference/image", files={"file": ("a.png", io.BytesIO(png_bytes()), "image/png")}
    ).json()
    assert body["params"]["confidence"] == 0.6
    assert body["params"]["image_size"] == 320


def test_storage_status_and_cleanup(loaded_client):
    status = loaded_client.get("/api/storage").json()
    names = {a["name"]: a for a in status["areas"]}
    assert set(names) == {"weights", "uploads", "outputs"}
    assert names["weights"]["file_count"] == 1
    assert all(a["writable"] for a in status["areas"])
    assert "path" not in str(status).lower()

    result = loaded_client.post("/api/storage/cleanup").json()
    assert result["removed_files"] == 0
    assert loaded_client.get("/api/storage").json()["last_cleanup_at"] == result["ran_at"]


def test_expired_outputs_are_reported(loaded_client):
    body = loaded_client.post(
        "/api/inference/image", files={"file": ("a.png", io.BytesIO(png_bytes()), "image/png")}
    ).json()
    services = loaded_client.app.state.services
    services.db.execute("UPDATE history SET expires_at = '2000-01-01T00:00:00Z' WHERE id = ?", (body["id"],))
    result = loaded_client.post("/api/storage/cleanup").json()
    assert result["expired_history_entries"] == 1
    assert loaded_client.get(body["annotated_url"]).status_code == 410
    item = loaded_client.get(f"/api/history/{body['id']}").json()
    assert item["files_expired"] is True
    assert item["artifacts"]["annotated_url"] is None


def _run_image(client, name):
    return client.post(
        "/api/inference/image", files={"file": (name, io.BytesIO(png_bytes()), "image/png")}
    ).json()


def test_history_search_sort_and_delete(loaded_client):
    first = _run_image(loaded_client, "street.png")
    time.sleep(1.1)  # created_at has second resolution
    second = _run_image(loaded_client, "parking.png")

    listing = loaded_client.get("/api/history").json()
    assert [i["id"] for i in listing["items"]] == [second["id"], first["id"]]
    assert loaded_client.get("/api/history", params={"order": "asc"}).json()["items"][0]["id"] == first["id"]
    search = loaded_client.get("/api/history", params={"q": "street"}).json()
    assert [i["id"] for i in search["items"]] == [first["id"]]
    assert loaded_client.get("/api/history", params={"kind": "video"}).json()["total"] == 0
    assert loaded_client.get("/api/history", params={"date_from": "2999-01-01"}).json()["total"] == 0

    detail = loaded_client.get(f"/api/history/{first['id']}").json()
    assert detail["params"]["confidence"] == 0.25
    assert detail["summary"]["width"] == 96

    assert loaded_client.delete(f"/api/history/{first['id']}").status_code == 204
    assert loaded_client.get(f"/api/history/{first['id']}").status_code == 404
    assert loaded_client.get(first["annotated_url"]).status_code == 404

    assert loaded_client.delete("/api/history").json() == {"deleted": 1}
    assert loaded_client.get("/api/history").json()["total"] == 0
    assert loaded_client.get("/api/history", params={"limit": 0}).status_code == 422
