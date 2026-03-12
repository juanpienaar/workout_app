"""Authentication tests — login, token refresh, password hashing."""

import json


def test_login_success(client, seed_user, isolated_data):
    """Athlete can log in with correct email + password."""
    resp = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "testpass123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user_name"] == "testathlete"
    assert data["role"] == "athlete"


def test_login_wrong_password(client, seed_user):
    resp = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "wrongpass",
    })
    assert resp.status_code == 401


def test_login_nonexistent_email(client, seed_user):
    resp = client.post("/api/auth/login", json={
        "email": "nobody@example.com",
        "password": "whatever",
    })
    assert resp.status_code == 401


def test_token_refresh(client, seed_user):
    """Can refresh an access token using a valid refresh token."""
    # First login to get tokens
    login = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "testpass123",
    })
    refresh_token = login.json()["refresh_token"]

    # Use refresh token
    resp = client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_unauthenticated_request(client):
    """API routes return 401 without auth header."""
    resp = client.get("/api/data")
    assert resp.status_code == 401
