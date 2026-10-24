def test_health_reports_runtime(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "YOLO Vision Studio"
    assert body["torch_version"]
    assert body["ultralytics_version"]
    assert body["default_device"] in ("cpu", "cuda:0")
    assert any(d["type"] == "cpu" for d in body["devices"])
    assert body["active_model"] is None
    assert body["limits"]["max_model_size_mb"] > 0
    # No filesystem paths may leak through the API.
    assert "/" not in str(body["issues"])


def test_unknown_route_uses_error_envelope(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_cors_allows_configured_origin(client):
    response = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    blocked = client.options(
        "/api/health",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert blocked.headers.get("access-control-allow-origin") is None
