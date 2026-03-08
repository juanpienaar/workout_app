"""Coach routes: list users, view specific user data."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_coach
from ..data import load_user_data
from .. import config

router = APIRouter(prefix="/api/coach", tags=["coach"])


@router.get("/users")
async def list_users(coach: Annotated[dict, Depends(require_coach)]):
    users = []
    for f in config.DATA_DIR.glob("*.json"):
        user_key = f.stem
        data = load_user_data(user_key)
        log_count = len(data.get("workout_logs", {}))
        whoop_count = len(data.get("whoop_snapshots", []))
        latest_log = None
        if data.get("workout_logs"):
            latest_log = max(data["workout_logs"].keys())
        users.append({
            "user": user_key,
            "workout_logs": log_count,
            "whoop_snapshots": whoop_count,
            "latest_log": latest_log,
        })
    return {"users": users}


@router.get("/user/{username}")
async def get_user(username: str, coach: Annotated[dict, Depends(require_coach)]):
    user_data = load_user_data(username)
    return user_data
