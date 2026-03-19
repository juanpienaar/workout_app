"""Auth routes: login, refresh, forgot-password, reset-password."""

import secrets
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..models import LoginRequest, LoginResponse, RefreshRequest, TokenResponse, ForgotPasswordRequest, ResetPasswordRequest
from ..auth import (
    verify_password, needs_rehash, upgrade_password,
    create_access_token, create_refresh_token, decode_token, hash_password,
)
from ..data import load_users, save_users, find_user_by_email
from .. import config

router = APIRouter(prefix="/api/auth", tags=["auth"])

limiter = Limiter(key_func=get_remote_address)

# In-memory password reset tokens: {token: {"email": ..., "expires": ...}}
RESET_TOKENS: dict = {}


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(request: Request, req: LoginRequest):
    user_name, user_info = find_user_by_email(req.email)
    if not user_name or not user_info:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    stored_hash = user_info.get("passwordHash", "")
    if not verify_password(req.password, stored_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Auto-upgrade SHA256 → bcrypt
    if needs_rehash(stored_hash):
        upgrade_password(user_name, req.password)

    role = user_info.get("role", "athlete")
    token_data = {"sub": user_name, "role": role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data, remember=req.remember)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_name=user_name,
        role=role,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh(request: Request, req: RefreshRequest):
    payload = decode_token(req.refresh_token, expected_type="refresh")
    user_name = payload.get("sub")
    role = payload.get("role", "athlete")
    if not user_name:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    access_token = create_access_token({"sub": user_name, "role": role})
    return TokenResponse(access_token=access_token)


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, req: ForgotPasswordRequest):
    user_name, user_info = find_user_by_email(req.email)
    # Always return success (don't reveal if email exists)
    if not user_name:
        return {"ok": True, "message": "If that email is registered, a reset link has been sent."}

    token = secrets.token_urlsafe(32)
    RESET_TOKENS[token] = {"email": req.email.lower().strip(), "user": user_name, "expires": time.time() + 3600}

    reset_url = f"{config.APP_URL}/reset-password?token={token}"

    if not config.SMTP_USER or not config.SMTP_PASS:
        return {"ok": True, "dev_token": token, "message": "SMTP not configured — token returned for dev"}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "NumNum Workout — Reset Your Password"
        msg["From"] = config.SMTP_USER
        msg["To"] = req.email

        html_body = f"""
        <div style="font-family:system-ui;max-width:400px;margin:0 auto;padding:20px;">
            <h2 style="color:#E8475F;">NumNum Workout</h2>
            <p>Hi {user_name},</p>
            <p>Click below to reset your password:</p>
            <a href="{reset_url}" style="display:inline-block;background:#E8475F;color:white;
               padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">
               Reset Password
            </a>
            <p style="color:#666;font-size:13px;">This link expires in 1 hour.</p>
        </div>"""
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT) as server:
            server.starttls()
            server.login(config.SMTP_USER, config.SMTP_PASS)
            server.send_message(msg)

        return {"ok": True, "message": "If that email is registered, a reset link has been sent."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.post("/reset-password")
@limiter.limit("3/minute")
async def reset_password(request: Request, req: ResetPasswordRequest):
    stored = RESET_TOKENS.get(req.token)
    if not stored:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if time.time() > stored["expires"]:
        del RESET_TOKENS[req.token]
        raise HTTPException(status_code=400, detail="Reset token expired")

    user_name = stored["user"]
    users = load_users()
    if user_name not in users:
        raise HTTPException(status_code=400, detail="User not found")

    users[user_name]["passwordHash"] = hash_password(req.new_password)
    save_users(users)
    del RESET_TOKENS[req.token]

    return {"ok": True, "message": "Password updated successfully"}
