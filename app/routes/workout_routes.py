"""Workout data routes: load, save-day, sync-all, save-whoop."""

import json
import base64
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from ..auth import get_current_user
from ..data import load_user_data, save_user_data, load_users
from ..models import SaveDayRequest, SyncAllRequest, SaveWhoopRequest
from .. import config

router = APIRouter(prefix="/api", tags=["workout"])


@router.get("/data")
async def get_data(current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    return user_data


@router.get("/my-program")
async def get_my_program(current_user: Annotated[dict, Depends(get_current_user)]):
    """Return the athlete's assigned program (deep copy) or fall back to global library."""
    user_key = current_user["name"]
    user_data = load_user_data(user_key)

    # Check for deep-copied assigned program first (Phase 3)
    if "assigned_program" in user_data:
        return user_data["assigned_program"]

    # Fall back to global program library
    users = load_users()
    program_name = users.get(current_user["sub"], {}).get("program", "")
    if not program_name:
        return {"weeks": []}

    # Load from program.json
    if config.PROGRAM_FILE.exists():
        with open(config.PROGRAM_FILE) as f:
            pdata = json.load(f)
            programs = pdata.get("programs", {})
            if program_name in programs:
                return programs[program_name]

    return {"weeks": []}


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


# ── Avatar upload/download ──────────────────────────────────

MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB

@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload a profile avatar image (max 2MB, jpg/png/webp)."""
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Only JPEG, PNG, and WebP images are allowed")

    data = await file.read()
    if len(data) > MAX_AVATAR_SIZE:
        raise HTTPException(400, "Image must be under 2MB")

    config.AVATARS_DIR.mkdir(parents=True, exist_ok=True)

    # Determine extension
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[file.content_type]
    user_key = current_user["name"]

    # Remove any existing avatar for this user
    for old in config.AVATARS_DIR.glob(f"{user_key}.*"):
        old.unlink()

    avatar_path = config.AVATARS_DIR / f"{user_key}{ext}"
    with open(avatar_path, "wb") as f:
        f.write(data)

    return {"ok": True, "url": f"/api/avatar/{user_key}"}


@router.get("/avatar/{username}")
async def get_avatar(username: str):
    """Serve a user's avatar image. No auth required (public)."""
    for ext in (".jpg", ".png", ".webp"):
        p = config.AVATARS_DIR / f"{username}{ext}"
        if p.exists():
            media = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}[ext]
            return FileResponse(p, media_type=media, headers={"Cache-Control": "public, max-age=3600"})
    raise HTTPException(404, "No avatar found")
