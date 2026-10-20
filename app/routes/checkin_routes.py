"""Athlete check-ins and coach feedback using existing locked data storage."""
from datetime import date, datetime, timezone
from typing import Annotated
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from ..auth import get_current_user, require_coach
from ..data import load_users, load_user_data, with_user_data

router = APIRouter(prefix="/api/coaching", tags=["check-ins"])
User = Annotated[dict, Depends(get_current_user)]
Coach = Annotated[dict, Depends(require_coach)]

class CheckIn(BaseModel):
    date: date
    energy: int = Field(ge=1, le=5)
    sleep_hours: float = Field(ge=0, le=24)
    weight: float | None = Field(default=None, gt=0, le=700)
    notes: str = Field(default="", max_length=4000)

class Review(BaseModel):
    feedback: str = Field(min_length=1, max_length=4000, pattern=r"\S")

def authorize(username, user):
    if user.get("role") != "coach" and user["name"] != username:
        raise HTTPException(403, "You can only access your own check-ins")
    if username not in load_users():
        raise HTTPException(404, "Athlete not found")

def stamp():
    return datetime.now(timezone.utc).isoformat()

@router.get("/athletes/{username}/checkins")
def get_checkins(username: str, user: User):
    authorize(username, user)
    return {"checkins": load_user_data(username).get("checkins", [])}

@router.post("/athletes/{username}/checkins")
def submit_checkin(username: str, body: CheckIn, user: User):
    authorize(username, user)
    entry = {**body.model_dump(mode="json"), "id": str(uuid4()), "created_at": stamp(), "submitted_by": user["name"], "status": "pending", "feedback": ""}
    with with_user_data(username) as data:
        data.setdefault("checkins", []).append(entry)
    return entry

@router.patch("/athletes/{username}/checkins/{checkin_id}")
def review_checkin(username: str, checkin_id: str, body: Review, coach: Coach):
    authorize(username, coach)
    with with_user_data(username) as data:
        entry = next((c for c in data.get("checkins", []) if c["id"] == checkin_id), None)
        if entry is None:
            raise HTTPException(404, "Check-in not found")
        entry.update(status="reviewed", feedback=body.feedback.strip(), reviewed_by=coach["name"], reviewed_at=stamp())
        return entry
