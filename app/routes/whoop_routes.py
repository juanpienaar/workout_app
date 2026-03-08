"""Whoop OAuth + API proxy routes."""

import os
import json
import time
import secrets
import urllib.request
import urllib.parse
import urllib.error
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse

from ..auth import get_current_user
from ..encryption import encrypt_value, decrypt_value
from .. import config

router = APIRouter(prefix="/whoop", tags=["whoop"])

# In-memory pending OAuth states
pending_auth: dict = {}


# ---- Whoop config & token helpers ----

def load_whoop_config() -> dict:
    cfg = {}
    if config.WHOOP_CONFIG_FILE.exists():
        with open(config.WHOOP_CONFIG_FILE) as f:
            cfg = json.load(f)
    return {
        "client_id": os.environ.get("WHOOP_CLIENT_ID", cfg.get("client_id", "")),
        "client_secret": os.environ.get("WHOOP_CLIENT_SECRET", cfg.get("client_secret", "")),
        "redirect_uri": os.environ.get(
            "WHOOP_REDIRECT_URI",
            cfg.get("redirect_uri", f"http://localhost:{config.PORT}/whoop/callback"),
        ),
    }


def load_tokens() -> dict:
    if config.WHOOP_TOKENS_FILE.exists():
        with open(config.WHOOP_TOKENS_FILE) as f:
            return json.load(f)
    return {}


def save_tokens(tokens: dict):
    with open(config.WHOOP_TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


def get_decrypted_token(user_tokens: dict, field: str) -> str:
    val = user_tokens.get(field, "")
    return decrypt_value(val) if val else ""


def refresh_access_token(user_key: str):
    tokens = load_tokens()
    user_tokens = tokens.get(user_key)
    if not user_tokens or not get_decrypted_token(user_tokens, "refresh_token"):
        return None

    cfg = load_whoop_config()
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": get_decrypted_token(user_tokens, "refresh_token"),
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
    }).encode()

    req = urllib.request.Request(
        config.WHOOP_TOKEN_URL, data=data, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "NumNumWorkout/1.0"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            token_data = json.loads(resp.read())
        tokens[user_key] = {
            "access_token": encrypt_value(token_data["access_token"]),
            "refresh_token": encrypt_value(
                token_data.get("refresh_token", get_decrypted_token(user_tokens, "refresh_token"))
            ),
            "expires_at": time.time() + token_data.get("expires_in", 3600),
        }
        save_tokens(tokens)
        return token_data["access_token"]  # Return plaintext for immediate use
    except Exception as e:
        print(f"[whoop] Token refresh failed: {e}")
        return None


def get_valid_token(user_key: str):
    tokens = load_tokens()
    user_tokens = tokens.get(user_key)
    if not user_tokens:
        return None
    if time.time() >= user_tokens.get("expires_at", 0) - 60:
        return refresh_access_token(user_key)
    return get_decrypted_token(user_tokens, "access_token")


def whoop_api_get(user_key: str, endpoint: str):
    token = get_valid_token(user_key)
    if not token:
        return None, "not_connected"

    url = f"{config.WHOOP_API_BASE}{endpoint}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}", "User-Agent": "NumNumWorkout/1.0",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()), None
    except urllib.error.HTTPError as e:
        if e.code == 401:
            new_token = refresh_access_token(user_key)
            if new_token:
                req = urllib.request.Request(url, headers={
                    "Authorization": f"Bearer {new_token}", "User-Agent": "NumNumWorkout/1.0",
                })
                try:
                    with urllib.request.urlopen(req) as resp:
                        return json.loads(resp.read()), None
                except Exception:
                    pass
            return None, "auth_expired"
        return None, f"api_error_{e.code}"
    except Exception as e:
        return None, str(e)


# ---- Routes ----

@router.get("/auth")
async def whoop_auth(user: str = Query(...), current_user: dict = Depends(get_current_user)):
    cfg = load_whoop_config()
    if not cfg["client_id"]:
        raise HTTPException(status_code=500, detail="Whoop not configured")

    state = secrets.token_urlsafe(32)
    pending_auth[state] = {"user_key": current_user["name"], "created_at": time.time()}

    auth_url = (
        f"{config.WHOOP_AUTH_URL}?"
        f"client_id={urllib.parse.quote(cfg['client_id'])}&"
        f"redirect_uri={urllib.parse.quote(cfg['redirect_uri'])}&"
        f"response_type=code&"
        f"scope={urllib.parse.quote(config.WHOOP_SCOPES)}&"
        f"state={state}"
    )
    return {"auth_url": auth_url}


@router.get("/callback", response_class=HTMLResponse)
async def whoop_callback(code: str = None, state: str = None, error: str = None):
    """OAuth callback — returns HTML (browser redirect, no JWT needed)."""
    if error:
        return f"<h2>Authorization Failed</h2><p>{error}</p><script>setTimeout(()=>window.close(),3000)</script>"

    if not code or not state or state not in pending_auth:
        return "<h2>Invalid callback</h2><p>Missing code or invalid state.</p>"

    auth_info = pending_auth.pop(state)
    user_key = auth_info["user_key"]
    cfg = load_whoop_config()

    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": cfg["redirect_uri"],
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
    }).encode()

    req = urllib.request.Request(
        config.WHOOP_TOKEN_URL, data=data, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "NumNumWorkout/1.0"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            token_data = json.loads(resp.read())
        tokens = load_tokens()
        tokens[user_key] = {
            "access_token": encrypt_value(token_data["access_token"]),
            "refresh_token": encrypt_value(token_data.get("refresh_token", "")),
            "expires_at": time.time() + token_data.get("expires_in", 3600),
        }
        save_tokens(tokens)
        app_url = config.APP_URL
        return (
            "<div style='text-align:center;padding:60px 20px;font-family:system-ui;'>"
            "<h2 style='color:#00C853;'>Whoop Connected!</h2>"
            "<p>Redirecting back to the app...</p>"
            "<script>"
            "setTimeout(()=>{"
            "if(window.opener){window.opener.postMessage('whoop_connected','*');window.close();}"
            f"else{{window.location.href='{app_url}';}}"
            "},1500);"
            "</script>"
            "</div>"
        )
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return f"<h2>Token Exchange Failed</h2><pre>{e.code}: {body}</pre>"
    except Exception as e:
        return f"<h2>Token Exchange Failed</h2><pre>{e}</pre>"


@router.get("/status")
async def whoop_status(user: str = Query(...)):
    tokens = load_tokens()
    connected = user in tokens and bool(tokens[user].get("access_token"))
    return {"connected": connected}


@router.get("/disconnect")
async def whoop_disconnect(user: str = Query(...), current_user: dict = Depends(get_current_user)):
    tokens = load_tokens()
    tokens.pop(current_user["name"], None)
    save_tokens(tokens)
    return {"ok": True}


@router.get("/recovery")
async def whoop_recovery(user: str = Query(...), current_user: dict = Depends(get_current_user)):
    data, err = whoop_api_get(current_user["name"], "/v2/recovery?limit=1")
    if err:
        raise HTTPException(status_code=401 if "auth" in str(err) else 502, detail=err)
    return data


@router.get("/sleep")
async def whoop_sleep(user: str = Query(...), current_user: dict = Depends(get_current_user)):
    data, err = whoop_api_get(current_user["name"], "/v2/activity/sleep?limit=1")
    if err:
        raise HTTPException(status_code=401 if "auth" in str(err) else 502, detail=err)
    return data


@router.get("/strain")
async def whoop_strain(user: str = Query(...), current_user: dict = Depends(get_current_user)):
    data, err = whoop_api_get(current_user["name"], "/v2/cycle?limit=1")
    if err:
        raise HTTPException(status_code=401 if "auth" in str(err) else 502, detail=err)
    return data


@router.get("/workout")
async def whoop_workout(user: str = Query(...), current_user: dict = Depends(get_current_user)):
    data, err = whoop_api_get(current_user["name"], "/v2/activity/workout?limit=1")
    if err:
        raise HTTPException(status_code=401 if "auth" in str(err) else 502, detail=err)
    return data


@router.get("/summary")
async def whoop_summary(user: str = Query(...), current_user: dict = Depends(get_current_user)):
    user_key = current_user["name"]
    result = {}
    data, err = whoop_api_get(user_key, "/v2/recovery?limit=1")
    if err:
        raise HTTPException(status_code=401 if "auth" in str(err) else 502, detail=err)
    result["recovery"] = data
    data, err = whoop_api_get(user_key, "/v2/cycle?limit=1")
    if not err:
        result["strain"] = data
    data, err = whoop_api_get(user_key, "/v2/activity/sleep?limit=1")
    if not err:
        result["sleep"] = data
    return result
