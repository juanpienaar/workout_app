"""Workout data route tests — save-day, sync-all, load data."""

import json


def test_get_data_empty(client, seed_user):
    """New user has empty workout logs."""
    resp = client.get("/api/data", headers=seed_user)
    assert resp.status_code == 200
    data = resp.json()
    assert data["workout_logs"] == {}


def test_save_day(client, seed_user):
    """Save a workout day and retrieve it."""
    day_data = {
        "day_key": "week1_day1",
        "data": {
            "Bench Press": {
                "set1": {"weight": 80, "reps": 8, "done": True},
                "set2": {"weight": 80, "reps": 7, "done": True},
            }
        },
        "meta": {
            "week": 1,
            "day": 1,
            "program": "TestProgram",
            "completedAt": "2026-03-10T10:00:00Z",
        },
    }
    resp = client.post("/api/save-day", json=day_data, headers=seed_user)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Verify it's retrievable
    get_resp = client.get("/api/data", headers=seed_user)
    logs = get_resp.json()["workout_logs"]
    assert "week1_day1" in logs
    assert logs["week1_day1"]["data"]["Bench Press"]["set1"]["weight"] == 80
    assert "saved_at" in logs["week1_day1"]


def test_save_day_with_meta(client, seed_user):
    """Meta fields are preserved correctly."""
    day_data = {
        "day_key": "week2_day3",
        "data": {"Squats": {"set1": {"weight": 100, "reps": 5, "done": True}}},
        "meta": {"week": 2, "day": 3, "program": "TestProgram"},
    }
    client.post("/api/save-day", json=day_data, headers=seed_user)

    logs = client.get("/api/data", headers=seed_user).json()["workout_logs"]
    assert logs["week2_day3"]["meta"]["week"] == 2
    assert logs["week2_day3"]["meta"]["day"] == 3


def test_sync_all(client, seed_user):
    """Sync-all merges multiple days at once."""
    sync_data = {
        "days": {
            "week1_day1": {
                "data": {"Deadlift": {"set1": {"weight": 120, "reps": 5, "done": True}}},
                "meta": {"week": 1, "day": 1},
            },
            "week1_day2": {
                "data": {"OHP": {"set1": {"weight": 40, "reps": 10, "done": True}}},
                "meta": {"week": 1, "day": 2},
            },
        }
    }
    resp = client.post("/api/sync-all", json=sync_data, headers=seed_user)
    assert resp.status_code == 200
    assert resp.json()["synced"] == 2

    logs = client.get("/api/data", headers=seed_user).json()["workout_logs"]
    assert "week1_day1" in logs
    assert "week1_day2" in logs


def test_sync_all_no_duplicates(client, seed_user):
    """Sync-all doesn't overwrite existing days."""
    # Save a day first
    client.post("/api/save-day", json={
        "day_key": "week1_day1",
        "data": {"Bench": {"set1": {"weight": 80, "reps": 8, "done": True}}},
        "meta": {"week": 1, "day": 1},
    }, headers=seed_user)

    # Try to sync the same day with different data
    resp = client.post("/api/sync-all", json={
        "days": {
            "week1_day1": {
                "data": {"Bench": {"set1": {"weight": 999, "reps": 1, "done": True}}},
                "meta": {"week": 1, "day": 1},
            },
        }
    }, headers=seed_user)
    assert resp.json()["synced"] == 0  # should skip existing

    # Original data preserved
    logs = client.get("/api/data", headers=seed_user).json()["workout_logs"]
    assert logs["week1_day1"]["data"]["Bench"]["set1"]["weight"] == 80


def test_save_day_unauthenticated(client):
    """Can't save workout without auth."""
    resp = client.post("/api/save-day", json={
        "day_key": "week1_day1",
        "data": {},
        "meta": {},
    })
    assert resp.status_code == 401
