"""JSON file I/O for user data and configuration."""

import json
from pathlib import Path
from . import config

config.DATA_DIR.mkdir(exist_ok=True)


def get_user_file(user_key: str) -> Path:
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in user_key)
    return config.DATA_DIR / f"{safe_name}.json"


def load_user_data(user_key: str) -> dict:
    f = get_user_file(user_key)
    if f.exists():
        with open(f) as fh:
            return json.load(fh)
    return {"workout_logs": {}, "whoop_snapshots": [], "notes": {}, "metrics": []}


def save_user_data(user_key: str, data: dict):
    f = get_user_file(user_key)
    with open(f, "w") as fh:
        json.dump(data, fh, indent=2)


def load_users() -> dict:
    if config.USERS_FILE.exists():
        with open(config.USERS_FILE) as f:
            return json.load(f)
    return {}


def save_users(users: dict):
    with open(config.USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)


def find_user_by_email(email: str) -> tuple[str | None, dict | None]:
    """Find user name and info by email address."""
    users = load_users()
    lower = email.lower().strip()
    for name, info in users.items():
        if info.get("email", "").lower() == lower:
            return name, info
    return None, None


# ── Nutrition Plans (global, like programs) ──

def load_nutrition_plans() -> list:
    if config.NUTRITION_PLANS_FILE.exists():
        with open(config.NUTRITION_PLANS_FILE) as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    return []


def save_nutrition_plans(plans: list):
    with open(config.NUTRITION_PLANS_FILE, "w") as f:
        json.dump(plans, f, indent=2)
