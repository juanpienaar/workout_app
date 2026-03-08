"""Pydantic request/response models."""

from pydantic import BaseModel, EmailStr
from typing import Optional, Any


# ---- Auth ----

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_name: str
    role: str
    token_type: str = "bearer"

class RefreshRequest(BaseModel):
    refresh_token: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ---- Workout Data ----

class SaveDayRequest(BaseModel):
    day_key: str
    data: dict[str, Any]
    meta: dict[str, Any] = {}

class SyncAllRequest(BaseModel):
    days: dict[str, Any]


# ---- Metrics ----

class MetricEntry(BaseModel):
    date: str
    weight_kg: Optional[float] = None
    body_fat_pct: Optional[float] = None
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    bicep_cm: Optional[float] = None
    thigh_cm: Optional[float] = None
    calf_cm: Optional[float] = None


# ---- Whoop ----

class SaveWhoopRequest(BaseModel):
    snapshot: dict[str, Any]


# ---- Verification ----

class SendVerificationRequest(BaseModel):
    email: str
    user: str

class VerifyEmailRequest(BaseModel):
    email: str
    code: str
    user: str
