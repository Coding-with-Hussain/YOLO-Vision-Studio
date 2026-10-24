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


def test_serves_built_frontend_without_shadowing_api(make_client, tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>studio</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    client = make_client(frontend_dist_dir=dist)
    assert "studio" in client.get("/").text
    assert "studio" in client.get("/models").text  # client-side route
    assert client.get("/assets/app.js").status_code == 200
    assert client.get("/api/health").json()["status"] == "ok"
    missing = client.get("/api/unknown")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"
    assert client.get("/../../etc/passwd").status_code in (200, 404)
    assert "root:" not in client.get("/..%2F..%2Fetc%2Fpasswd").text
