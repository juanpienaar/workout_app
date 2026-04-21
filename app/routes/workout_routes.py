"""Workout data routes: load, save-day, sync-all, save-whoop.

Durability notes:
- All writes go through `with_user_data` (per-user lock + atomic write +
  rolling backup) so concurrent saves from multiple devices cannot clobber
  each other mid-request.
- `save-day` honours a monotonic `client_ts` field so late-arriving requests
  cannot overwrite newer data.
"""

import json
import base64
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from ..auth import get_current_user
from ..data import load_user_data, save_user_data, load_users, with_user_data
from ..models import SaveDayRequest, SyncAllRequest, SaveWhoopRequest
from .. import config

logger = logging.getLogger("numnum.workout")

router = APIRouter(prefix="/api", tags=["workout"])


@router.get("/data")
async def get_data(current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    return user_data


@router.get("/my-program")
async def get_my_program(current_user: Annotated[dict, Depends(get_current_user)]):
    """Return the athlete's assigned program (deep copy) or fall back to global library.

    The returned program dict is annotated with `_program_version` (int ms) so
    the PWA can compare against `/api/program-version` and detect changes made
    from the admin dashboard.
    """
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    version = int(user_data.get("program_version") or 0)

    # Check for deep-copied assigned program first (Phase 3)
    if "assigned_program" in user_data:
        ap = user_data["assigned_program"]
        if isinstance(ap, dict):
            program = dict(ap)  # shallow copy so we can annotate
        else:
            # Safety: if assigned_program was somehow stored as non-dict, wrap it
            program = {"weeks": ap if isinstance(ap, list) else []}
        program["_program_version"] = version
        return program

    # Fall back to global program library
    users = load_users()
    program_name = users.get(current_user["sub"], {}).get("program", "")
    if not program_name:
        return {"weeks": [], "_program_version": version}

    # Load from program.json
    if config.PROGRAM_FILE.exists():
        with open(config.PROGRAM_FILE) as f:
            pdata = json.load(f)
            programs = pdata.get("programs", {})
            if program_name in programs:
                out = dict(programs[program_name])
                out["_program_version"] = version
                return out

    return {"weeks": [], "_program_version": version}


@router.get("/program-version")
async def get_program_version(current_user: Annotated[dict, Depends(get_current_user)]):
    """Lightweight endpoint so the PWA can poll for program changes without
    downloading the full program JSON on every check."""
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    return {"program_version": int(user_data.get("program_version") or 0)}


@router.post("/save-day")
async def save_day(req: SaveDayRequest, current_user: Annotated[dict, Depends(get_current_user)]):
    """Persist a single day's exercise data.

    Concurrency-safe: wrapped in per-user lock and atomic write.
    Stale-write protection: if the request carries `client_ts` older than the
    currently-stored `client_ts`, the write is rejected (HTTP 409).
    """
    user_key = current_user["name"]
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with with_user_data(user_key) as user_data:
        logs = user_data.setdefault("workout_logs", {})
        existing = logs.get(req.day_key)

        # Reject stale writes if we have a newer client_ts on file.
        if req.client_ts is not None and existing is not None:
            existing_ts = existing.get("client_ts")
            if isinstance(existing_ts, int) and existing_ts > req.client_ts:
                logger.warning(
                    "[save-day] stale write rejected for %s/%s (client_ts=%s < stored=%s)",
                    user_key, req.day_key, req.client_ts, existing_ts,
                )
                return {
                    "ok": False,
                    "stale": True,
                    "server_ts": existing_ts,
                    "saved_at": existing.get("saved_at"),
                }

        logs[req.day_key] = {
            "data": req.data,
            "meta": req.meta,
            "saved_at": now_iso,
            "client_ts": req.client_ts,
            "request_id": req.request_id,
        }

    return {"ok": True, "saved_at": now_iso, "client_ts": req.client_ts}


@router.post("/sync-all")
async def sync_all(req: SyncAllRequest, current_user: Annotated[dict, Depends(get_current_user)]):
    """Bulk-upload days that were captured offline.

    Never overwrites days that already exist on the server — the client-side
    pull will reconcile those.
    """
    user_key = current_user["name"]
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    count = 0

    with with_user_data(user_key) as user_data:
        logs = user_data.setdefault("workout_logs", {})
        for day_key, day_info in req.days.items():
            if day_info.get("data") and day_key not in logs:
                logs[day_key] = {
                    "data": day_info["data"],
                    "meta": day_info.get("meta", {}),
                    "saved_at": now_iso,
                    "client_ts": day_info.get("client_ts"),
                }
                count += 1

    return {"ok": True, "synced": count}


@router.get("/messages")
async def get_messages(current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    return user_data.get("messages", [])


@router.post("/messages/mark-read")
async def mark_messages_read(current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    with with_user_data(user_key) as user_data:
        for msg in user_data.get("messages", []):
            msg["read"] = True
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
    with with_user_data(user_key) as user_data:
        msgs = user_data.setdefault("messages", [])
        msgs.append(msg)
        if len(msgs) > 200:
            user_data["messages"] = msgs[-200:]
    return {"ok": True, "message": msg}


@router.post("/save-whoop")
async def save_whoop(req: SaveWhoopRequest, current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    snapshot = req.snapshot
    snapshot["saved_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with with_user_data(user_key) as user_data:
        user_data.setdefault("whoop_snapshots", []).append(snapshot)
        user_data["whoop_snapshots"] = user_data["whoop_snapshots"][-90:]
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
