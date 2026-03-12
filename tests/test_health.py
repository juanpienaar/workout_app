"""Basic smoke tests — health check, static endpoints."""


def test_health_check(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_exercises_json_empty(client):
    """When no exercises.json exists, returns empty dict."""
    resp = client.get("/exercises.json")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_program_json_empty(client):
    """When no program.json exists, returns programs key."""
    resp = client.get("/program.json")
    assert resp.status_code == 200
    data = resp.json()
    assert "programs" in data
