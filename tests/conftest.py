"""Shared fixtures for NumNum Workout tests."""

import json
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Point data to a temp directory BEFORE importing the app
_tmpdir = tempfile.mkdtemp()
os.environ["RAILWAY_VOLUME_MOUNT_PATH"] = ""  # force local mode
os.environ["SECRET_KEY"] = "test-secret-key-do-not-use-in-prod"


@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    """Each test gets its own data directory so tests don't interfere."""
    from app import config

    monkeypatch.setattr(config, "DATA_ROOT", tmp_path)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "user_data")
    monkeypatch.setattr(config, "USERS_FILE", tmp_path / "users.json")
    monkeypatch.setattr(config, "PROGRAM_FILE", tmp_path / "program.json")
    monkeypatch.setattr(config, "EXERCISES_FILE", tmp_path / "exercises.json")
    monkeypatch.setattr(config, "METRICS_FILE", tmp_path / "user_metrics.json")

    # Create user_data dir
    (tmp_path / "user_data").mkdir(exist_ok=True)

    yield tmp_path


@pytest.fixture
def client():
    """FastAPI test client."""
    from app.main import app
    return TestClient(app)


@pytest.fixture
def seed_user(isolated_data):
    """Create a test athlete user and return auth header."""
    from app.auth import hash_password, create_access_token

    users = {
        "testathlete": {
            "passwordHash": hash_password("testpass123"),
            "role": "athlete",
            "email": "test@example.com",
            "email_verified": True,
            "program": "TestProgram",
            "startDate": "2026-01-01",
        }
    }
    with open(isolated_data / "users.json", "w") as f:
        json.dump(users, f)

    token = create_access_token({"sub": "testathlete"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seed_coach(isolated_data):
    """Create a test coach user and return auth header."""
    from app.auth import hash_password, create_access_token

    users_file = isolated_data / "users.json"
    users = {}
    if users_file.exists():
        with open(users_file) as f:
            users = json.load(f)

    users["testcoach"] = {
        "passwordHash": hash_password("coachpass123"),
        "role": "coach",
        "email": "coach@example.com",
        "email_verified": True,
    }
    with open(users_file, "w") as f:
        json.dump(users, f)

    token = create_access_token({"sub": "testcoach"})
    return {"Authorization": f"Bearer {token}"}
