"""Email verification routes (open — no JWT needed)."""

import time
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import APIRouter, HTTPException

from ..models import SendVerificationRequest, VerifyEmailRequest
from ..data import load_users, save_users
from .. import config

router = APIRouter(prefix="/api", tags=["verification"])

# In-memory verification codes: {email: {"code": "123456", "expires": timestamp, "user": "name"}}
VERIFICATION_CODES: dict = {}


@router.post("/send-verification")
async def send_verification(req: SendVerificationRequest):
    email = req.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")

    code = str(random.randint(100000, 999999))
    VERIFICATION_CODES[email] = {
        "code": code,
        "expires": time.time() + 600,
        "user": req.user,
    }

    if not config.SMTP_USER or not config.SMTP_PASS:
        return {"ok": True, "dev_code": code, "message": "SMTP not configured — code returned for dev"}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "NumNum Workout — Verify Your Email"
        msg["From"] = config.SMTP_USER
        msg["To"] = email

        html_body = f"""
        <div style="font-family:system-ui;max-width:400px;margin:0 auto;padding:20px;">
            <h2 style="color:#E8475F;">NumNum Workout</h2>
            <p>Hi {req.user},</p>
            <p>Your verification code is:</p>
            <div style="background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;margin:16px 0;">
                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#E8475F;">{code}</span>
            </div>
            <p style="color:#666;font-size:13px;">This code expires in 10 minutes.</p>
        </div>"""
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT) as server:
            server.starttls()
            server.login(config.SMTP_USER, config.SMTP_PASS)
            server.send_message(msg)

        return {"ok": True, "message": "Verification email sent"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.post("/verify-email")
async def verify_email(req: VerifyEmailRequest):
    email = req.email.strip().lower()
    code = req.code.strip()

    if not email or not code:
        raise HTTPException(status_code=400, detail="Missing email or code")

    stored = VERIFICATION_CODES.get(email)
    if not stored:
        raise HTTPException(status_code=400, detail="No verification code found. Request a new one.")

    if time.time() > stored["expires"]:
        del VERIFICATION_CODES[email]
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")

    if stored["code"] != code:
        raise HTTPException(status_code=400, detail="Incorrect code.")

    del VERIFICATION_CODES[email]

    # Mark as verified in users.json
    users = load_users()
    for uname, uinfo in users.items():
        if uinfo.get("email", "").lower() == email:
            uinfo["email_verified"] = True
    save_users(users)

    return {"ok": True, "verified": True}
