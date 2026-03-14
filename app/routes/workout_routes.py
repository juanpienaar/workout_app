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
        "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
                "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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


from pydantic import BaseModel as _BaseModel

class AthleteReplyRequest(_BaseModel):
    message: str
    reply_to: str = ""

@router.post("/messages/reply")
async def reply_message(req: AthleteReplyRequest, current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    if not req.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    user_data = load_user_data(user_key)
    msgs = user_data.setdefault("messages", [])
    msg = {
        "id": f"msg_{int(datetime.now(timezone.utc).timestamp()*1000)}",
        "text": req.message.strip(),
        "day_key": "",
        "source": "athlete",
        "from": user_key,
        "sent_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "read": False,
        "reply_to": req.reply_to,
    }
    msgs.append(msg)
    if len(msgs) > 200:
        user_data["messages"] = msgs[-200:]
    save_user_data(user_key, user_data)
    return {"ok": True, "message": msg}


@router.post("/save-whoop")
async def save_whoop(req: SaveWhoopRequest, current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    snapshot = req.snapshot
    snapshot["saved_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    user_data.setdefault("whoop_snapshots", []).append(snapshot)
    user_data["whoop_snapshots"] = user_data["whoop_snapshots"][-90:]
    save_user_data(user_key, user_data)
    return {"ok": True}
