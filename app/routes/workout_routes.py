"""Workout data routes: load, save-day, sync-all, save-whoop."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user
from ..data import load_user_data, save_user_data
from ..models import SaveDayRequest, SyncAllRequest, SaveWhoopRequest

router = APIRouter(prefix="/api", tags=["workout"])


@router.get("/data")
async def get_data(current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    return user_data


@router.post("/save-day")
async def save_day(req: SaveDayRequest, current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    user_data["workout_logs"][req.day_key] = {
        "data": req.data,
        "meta": req.meta,
        "saved_at": datetime.now(timezone.utc).isoformat() + "Z",
    }
    save_user_data(user_key, user_data)
    return {"ok": True}


@router.post("/sync-all")
async def sync_all(req: SyncAllRequest, current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    count = 0
    for day_key, day_info in req.days.items():
        if day_info.get("data") and day_key not in user_data["workout_logs"]:
            user_data["workout_logs"][day_key] = {
                "data": day_info["data"],
                "meta": day_info.get("meta", {}),
                "saved_at": datetime.now(timezone.utc).isoformat() + "Z",
            }
            count += 1
    save_user_data(user_key, user_data)
    return {"ok": True, "synced": count}


@router.get("/messages")
async def get_messages(current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    return user_data.get("messages", [])


@router.post("/messages/mark-read")
async def mark_messages_read(current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    for msg in user_data.get("messages", []):
        msg["read"] = True
    save_user_data(user_key, user_data)
    return {"ok": True}


@router.post("/save-whoop")
async def save_whoop(req: SaveWhoopRequest, current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    snapshot = req.snapshot
    snapshot["saved_at"] = datetime.now(timezone.utc).isoformat() + "Z"
    user_data.setdefault("whoop_snapshots", []).append(snapshot)
    user_data["whoop_snapshots"] = user_data["whoop_snapshots"][-90:]
    save_user_data(user_key, user_data)
    return {"ok": True}
