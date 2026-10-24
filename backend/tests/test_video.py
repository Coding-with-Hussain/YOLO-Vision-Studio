import io
import json

from tests.conftest import make_video, wait_for_job


def _submit(client, path, settings=None, name=None):
    with path.open("rb") as handle:
        data = {"settings": json.dumps(settings)} if settings else {}
        return client.post(
            "/api/inference/video", files={"file": (name or path.name, handle, "video/mp4")}, data=data
        )


def test_video_job_completes_with_real_progress(loaded_client, video_file):
    response = _submit(loaded_client, video_file, {"confidence": 0.05, "image_size": 320})
    assert response.status_code == 202, response.text
    job = response.json()
    assert job["status"] in ("queued", "running")
    assert job["video"]["width"] == 160 and job["video"]["height"] == 96
    assert job["progress"]["total_frames"] == 12

    final = wait_for_job(loaded_client, job["id"])
    assert final["status"] == "completed", final
    assert final["progress"]["frames_read"] == 12
    assert final["progress"]["frames_analyzed"] == 12
    assert final["progress"]["percent"] == 100.0
    result = final["result"]
    assert result["frames_written"] == 12
    assert result["output_width"] == 160
    assert result["encoder"]
    assert result["output_size_bytes"] > 0
    assert len(result["timeline"]) == 12

    result_endpoint = loaded_client.get(f"/api/jobs/{job['id']}/result")
    assert result_endpoint.status_code == 200
    output = loaded_client.get(result["output_url"])
    assert output.status_code == 200
    assert output.headers["content-type"] == "video/mp4"
    partial = loaded_client.get(result["output_url"], headers={"Range": "bytes=0-99"})
    assert partial.status_code == 206
    assert len(partial.content) == 100
    assert loaded_client.get(result["input_url"]).status_code == 200

    history = loaded_client.get("/api/history", params={"kind": "video"}).json()
    assert history["total"] == 1
    assert history["items"][0]["status"] == "completed"
    assert history["items"][0]["artifacts"]["thumbnail_url"]


def test_frame_interval_and_duration_limit(loaded_client, tmp_path):
    clip = make_video(tmp_path / "long.mp4", frames=30, fps=10)
    settings = {"frame_strategy": "interval", "frame_interval": 3, "max_duration_s": 2, "image_size": 320}
    job = _submit(loaded_client, clip, settings).json()
    assert job["progress"]["total_frames"] == 20
    final = wait_for_job(loaded_client, job["id"])
    assert final["status"] == "completed"
    assert final["result"]["frames_written"] == 20
    assert final["result"]["frames_analyzed"] == 7  # frames 0, 3, ..., 18
    assert final["result"]["truncated"] is True


def test_cancel_running_job(loaded_client, tmp_path):
    clip = make_video(tmp_path / "cancel.mp4", frames=400, size=(320, 240), fps=30)
    job = _submit(loaded_client, clip, {"image_size": 640}).json()
    cancel = loaded_client.post(f"/api/jobs/{job['id']}/cancel")
    assert cancel.status_code == 200
    final = wait_for_job(loaded_client, job["id"])
    assert final["status"] == "cancelled"
    assert final["error_code"] == "CANCELLED"
    assert loaded_client.get(f"/api/jobs/{job['id']}/output").status_code == 410
    assert loaded_client.get(f"/api/jobs/{job['id']}/result").status_code == 409
    # A finished job cannot be cancelled again.
    assert loaded_client.post(f"/api/jobs/{job['id']}/cancel").status_code == 409


def test_corrupted_video_is_rejected(loaded_client):
    response = loaded_client.post(
        "/api/inference/video", files={"file": ("broken.mp4", io.BytesIO(b"\x00" * 4096), "video/mp4")}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_VIDEO"
    uploads = loaded_client.app.state.services.settings.uploads_dir
    assert [p for p in uploads.iterdir() if p.is_dir()] == []


def test_unsupported_video_extension(loaded_client):
    response = loaded_client.post(
        "/api/inference/video", files={"file": ("clip.gif", io.BytesIO(b"GIF89a"), "image/gif")}
    )
    assert response.status_code == 415


def test_video_requires_model(client, video_file):
    response = _submit(client, video_file)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MODEL_NOT_LOADED"


def test_invalid_video_settings(loaded_client, video_file):
    response = _submit(loaded_client, video_file, {"frame_strategy": "random"})
    assert response.status_code == 422
    response = _submit(loaded_client, video_file, {"frame_interval": 0})
    assert response.status_code == 422


def test_unknown_job(client):
    assert client.get("/api/jobs/0123456789abcdef").status_code == 404
    assert client.get("/api/jobs/bad-id").status_code == 404


def test_model_in_use_cannot_be_deleted(loaded_client, tmp_path):
    clip = make_video(tmp_path / "busy.mp4", frames=300, size=(320, 240), fps=30)
    job = _submit(loaded_client, clip, {"image_size": 640}).json()
    model_id = job["model"]["id"]
    response = loaded_client.delete(f"/api/models/{model_id}")
    if response.status_code == 409:
        assert response.json()["error"]["code"] == "MODEL_IN_USE"
        loaded_client.post(f"/api/jobs/{job['id']}/cancel")
        wait_for_job(loaded_client, job["id"])
        assert loaded_client.delete(f"/api/models/{model_id}").status_code == 204
    else:  # the job finished before the delete request
        assert wait_for_job(loaded_client, job["id"])["status"] == "completed"
