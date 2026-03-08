"""Body metrics routes."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..data import load_user_data, save_user_data
from ..models import MetricEntry

router = APIRouter(prefix="/api", tags=["metrics"])


@router.get("/metrics")
async def get_metrics(current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    entries = user_data.get("metrics", [])
    return {"entries": entries}


@router.post("/save-metrics")
async def save_metrics(entry: MetricEntry, current_user: Annotated[dict, Depends(get_current_user)]):
    user_key = current_user["name"]
    user_data = load_user_data(user_key)
    if "metrics" not in user_data:
        user_data["metrics"] = []
    entry_dict = entry.model_dump(exclude_none=True)
    entry_dict["saved_at"] = datetime.now(timezone.utc).isoformat() + "Z"
    user_data["metrics"].append(entry_dict)
    save_user_data(user_key, user_data)
    return {"ok": True}
