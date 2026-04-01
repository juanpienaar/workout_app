"""Nutrition routes — food logging, macro tracking, recipes, meal plans."""

import copy
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel

from ..auth import get_current_user, require_coach
from ..data import load_users, load_user_data, save_user_data, load_nutrition_plans, save_nutrition_plans
from .. import config
from ..models import (
    NutritionTargets, SetNutritionTargetsRequest, FoodEntry,
    DailyLogRequest, FoodSearchRequest, RecipeSaveRequest,
    MealPlanGenerateRequest, RecipeFromIngredientsRequest,
    NutritionProfile, FavouriteMeal,
)

logger = logging.getLogger("numnum.nutrition")

router = APIRouter(prefix="/api/nutrition", tags=["nutrition"])


# ────────────────────────────────────────────
#  Helper: nutrition data access
# ────────────────────────────────────────────

def _get_nutrition(user_data: dict) -> dict:
    """Get or initialise the nutrition section of user data.

    Data Safety: Entries stored in logs, once saved, should never be silently
    mutated or lost. All access to nutrition data must preserve existing entries
    and maintain referential integrity (e.g., meal_id links, timestamps).
    """
    if "nutrition" not in user_data:
        user_data["nutrition"] = {
            "targets": None,
            "logs": {},
            "recipes": [],
            "meal_plans": [],
            "favourites": [],  # List of favourite meals for quick reuse
        }
    # Ensure favourites list exists even if upgrading from old data
    if "favourites" not in user_data["nutrition"]:
        user_data["nutrition"]["favourites"] = []
    return user_data["nutrition"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ────────────────────────────────────────────
#  Targets (coach sets, athlete reads)
# ────────────────────────────────────────────

@router.get("/targets")
async def get_targets(
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None, description="Athlete username (coach only)"),
):
    """Get nutrition targets for athlete. Coach can query any athlete."""
    target_user = username or current_user["name"]

    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own targets")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    return {"ok": True, "targets": nutrition.get("targets")}


@router.post("/targets")
async def set_targets(
    req: SetNutritionTargetsRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Coach sets macro targets for an athlete."""
    users = load_users()
    if req.username not in users:
        raise HTTPException(404, "Athlete not found")

    user_data = load_user_data(req.username)
    nutrition = _get_nutrition(user_data)

    # Keep history of target changes
    if "target_history" not in nutrition:
        nutrition["target_history"] = []
    if nutrition.get("targets"):
        nutrition["target_history"].append({
            **nutrition["targets"],
            "replaced_at": _now_iso(),
        })
        # Keep last 20 changes
        nutrition["target_history"] = nutrition["target_history"][-20:]

    nutrition["targets"] = {
        **req.targets.model_dump(),
        "set_by": coach["name"],
        "set_at": _now_iso(),
    }
    save_user_data(req.username, user_data)
    return {"ok": True, "targets": nutrition["targets"]}


# ────────────────────────────────────────────
#  Nutrition profile (goal, weight, diet, etc.)
# ────────────────────────────────────────────

ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

DIET_LABELS = {
    "none": "No restrictions",
    "vegetarian": "Vegetarian",
    "vegan": "Vegan",
    "pescatarian": "Pescatarian",
    "keto": "Keto",
    "banting": "Banting / Low-carb",
    "paleo": "Paleo",
    "no_red_meat": "No red meat",
    "halal": "Halal",
    "kosher": "Kosher",
}


def _calc_bmr(weight_kg: float, height_cm: float, age: int, sex: str) -> float:
    """Mifflin-St Jeor BMR equation."""
    if sex == "female":
        return 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
    return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5


def _calc_tdee(profile: dict) -> dict | None:
    """Calculate TDEE and recommended macros from a nutrition profile.

    Returns dict with tdee, recommended_calories, deficit/surplus, and macro split.
    """
    w = profile.get("current_weight_kg")
    h = profile.get("height_cm")
    age = profile.get("age")
    if not all([w, h, age]):
        return None

    bmr = _calc_bmr(w, h, age, profile.get("sex", "male"))
    activity = profile.get("activity_level", "moderate")
    tdee = bmr * ACTIVITY_MULTIPLIERS.get(activity, 1.55)

    goal = profile.get("goal", "maintain")
    target_w = profile.get("target_weight_kg")
    target_weeks = profile.get("target_weeks")

    # Calculate deficit/surplus
    daily_adjustment = 0
    if goal in ("lose", "gain") and target_w and target_weeks and target_weeks > 0:
        weight_diff = target_w - w  # negative for loss
        # 1 kg body weight ≈ 7700 kcal
        total_cal = weight_diff * 7700
        daily_adjustment = total_cal / (target_weeks * 7)
        # Clamp to safe range: max 1000 kcal deficit/surplus per day
        daily_adjustment = max(-1000, min(1000, daily_adjustment))
    elif goal == "lose":
        daily_adjustment = -500  # default moderate deficit
    elif goal == "gain":
        daily_adjustment = 400  # default lean bulk surplus

    recommended = round(tdee + daily_adjustment)
    # Floor at 1200 kcal for safety
    recommended = max(1200, recommended)

    # Macro split based on diet type
    diet = profile.get("diet_type", "none")
    if diet in ("keto", "banting"):
        # High fat, very low carb
        protein_pct, carb_pct, fat_pct = 0.25, 0.05, 0.70
    elif diet == "paleo":
        protein_pct, carb_pct, fat_pct = 0.30, 0.30, 0.40
    elif goal == "gain":
        protein_pct, carb_pct, fat_pct = 0.25, 0.45, 0.30
    elif goal == "lose":
        protein_pct, carb_pct, fat_pct = 0.35, 0.30, 0.35
    else:
        protein_pct, carb_pct, fat_pct = 0.30, 0.40, 0.30

    return {
        "bmr": round(bmr),
        "tdee": round(tdee),
        "daily_adjustment": round(daily_adjustment),
        "recommended_calories": recommended,
        "recommended_protein_g": round((recommended * protein_pct) / 4),
        "recommended_carbs_g": round((recommended * carb_pct) / 4),
        "recommended_fat_g": round((recommended * fat_pct) / 9),
        "macro_split": {"protein_pct": round(protein_pct * 100), "carbs_pct": round(carb_pct * 100), "fat_pct": round(fat_pct * 100)},
    }


@router.get("/profile")
async def get_profile(
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """Get athlete's nutrition profile, including latest metrics weight."""
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own profile")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    profile = nutrition.get("profile")
    calc = _calc_tdee(profile) if profile else None

    # Pull latest weight from body metrics (logged via main app)
    latest_metrics_weight = None
    metrics = user_data.get("metrics", [])
    for m in reversed(metrics):
        if m.get("weight"):
            latest_metrics_weight = m["weight"]
            break

    # Also include user info from users.json
    users = load_users()
    user_info = users.get(target_user, {})

    return {
        "ok": True,
        "username": target_user,
        "program": user_info.get("program", ""),
        "profile": profile,
        "calculated": calc,
        "latest_metrics_weight": latest_metrics_weight,
    }


@router.post("/profile")
async def save_profile(
    profile: NutritionProfile,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Save athlete's nutrition profile (athlete sets their own, or coach can via targets tab)."""
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)
    nutrition["profile"] = {
        **profile.model_dump(),
        "updated_at": _now_iso(),
    }
    save_user_data(current_user["name"], user_data)
    calc = _calc_tdee(nutrition["profile"])
    return {"ok": True, "profile": nutrition["profile"], "calculated": calc}


class SetProfileRequest(BaseModel):
    username: str
    profile: NutritionProfile


@router.post("/profile/set")
async def coach_set_profile(
    req: SetProfileRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Coach sets an athlete's nutrition profile."""
    users = load_users()
    if req.username not in users:
        raise HTTPException(404, "Athlete not found")

    user_data = load_user_data(req.username)
    nutrition = _get_nutrition(user_data)
    nutrition["profile"] = {
        **req.profile.model_dump(),
        "set_by": coach["name"],
        "updated_at": _now_iso(),
    }
    save_user_data(req.username, user_data)
    calc = _calc_tdee(nutrition["profile"])
    return {"ok": True, "profile": nutrition["profile"], "calculated": calc}


@router.get("/calculate")
async def calculate_tdee(
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """Calculate TDEE and recommended macros from stored profile."""
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own calculations")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    profile = nutrition.get("profile")
    if not profile:
        raise HTTPException(400, "No nutrition profile set. Please complete your profile first.")
    calc = _calc_tdee(profile)
    if not calc:
        raise HTTPException(400, "Missing weight, height, or age in profile.")
    return {"ok": True, "profile": profile, "calculated": calc}


# ────────────────────────────────────────────
#  Daily food log
# ────────────────────────────────────────────

@router.get("/logs/{date}")
async def get_daily_log(
    date: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """Get food log for a specific date."""
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own logs")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    day_log = nutrition["logs"].get(date, {"entries": [], "totals": {}})
    return {"ok": True, "date": date, "log": day_log}


@router.post("/logs/{date}")
async def add_food_entry(
    date: str,
    entry: FoodEntry,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Add a food entry to a specific date."""
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)

    if date not in nutrition["logs"]:
        nutrition["logs"][date] = {"entries": [], "created_at": _now_iso()}

    day_log = nutrition["logs"][date]

    # Generate ID and timestamp
    entry_dict = entry.model_dump()
    entry_dict["id"] = entry_dict.get("id") or f"food_{uuid.uuid4().hex[:8]}"
    entry_dict["logged_at"] = entry_dict.get("logged_at") or _now_iso()

    day_log["entries"].append(entry_dict)
    day_log["totals"] = _compute_day_totals(day_log["entries"])
    day_log["updated_at"] = _now_iso()

    save_user_data(current_user["name"], user_data)
    return {"ok": True, "entry": entry_dict, "totals": day_log["totals"]}


@router.put("/logs/{date}/{entry_id}")
async def update_food_entry(
    date: str,
    entry_id: str,
    entry: FoodEntry,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Update a food entry."""
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)
    day_log = nutrition["logs"].get(date)
    if not day_log:
        raise HTTPException(404, "No log for this date")

    for i, existing in enumerate(day_log["entries"]):
        if existing["id"] == entry_id:
            updated = entry.model_dump()
            updated["id"] = entry_id
            updated["logged_at"] = existing.get("logged_at", _now_iso())
            day_log["entries"][i] = updated
            day_log["totals"] = _compute_day_totals(day_log["entries"])
            day_log["updated_at"] = _now_iso()
            save_user_data(current_user["name"], user_data)
            return {"ok": True, "entry": updated, "totals": day_log["totals"]}

    raise HTTPException(404, "Entry not found")


@router.delete("/logs/{date}/{entry_id}")
async def delete_food_entry(
    date: str,
    entry_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Delete a food entry from a date."""
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)
    day_log = nutrition["logs"].get(date)
    if not day_log:
        raise HTTPException(404, "No log for this date")

    original_len = len(day_log["entries"])
    day_log["entries"] = [e for e in day_log["entries"] if e["id"] != entry_id]
    if len(day_log["entries"]) == original_len:
        raise HTTPException(404, "Entry not found")

    day_log["totals"] = _compute_day_totals(day_log["entries"])
    day_log["updated_at"] = _now_iso()
    save_user_data(current_user["name"], user_data)
    return {"ok": True, "totals": day_log["totals"]}


@router.get("/logs/week/{start_date}")
async def get_weekly_logs(
    start_date: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """Get 7 days of food logs starting from start_date."""
    from datetime import timedelta
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own logs")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)

    base = datetime.strptime(start_date, "%Y-%m-%d")
    days = {}
    for i in range(7):
        d = (base + timedelta(days=i)).strftime("%Y-%m-%d")
        log = nutrition["logs"].get(d, {"entries": [], "totals": {}})
        days[d] = {"totals": log.get("totals", {}), "entry_count": len(log.get("entries", []))}

    return {"ok": True, "start_date": start_date, "days": days}


# ────────────────────────────────────────────
#  Meal reordering & metadata
# ────────────────────────────────────────────

class MealReorderRequest(BaseModel):
    meal_order: list[str]  # List of meal IDs in desired order


@router.put("/logs/{date}/reorder")
async def reorder_meals(
    date: str,
    req: MealReorderRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Reorder meals for a specific date.

    Body: {"meal_order": ["meal_id1", "meal_id2", ...]}
    """
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)

    day_log = nutrition["logs"].get(date)
    if not day_log:
        raise HTTPException(404, "No log for this date")

    day_log["meal_order"] = req.meal_order
    day_log["updated_at"] = _now_iso()
    save_user_data(current_user["name"], user_data)
    return {"ok": True, "date": date, "meal_order": req.meal_order}


class MealMetadataRequest(BaseModel):
    meal_name: Optional[str] = None
    time: Optional[str] = None  # HH:MM format


@router.put("/logs/{date}/meal/{meal_id}")
async def update_meal_metadata(
    date: str,
    meal_id: str,
    req: MealMetadataRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Update meal metadata (name and/or time) for all entries in that meal."""
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)

    day_log = nutrition["logs"].get(date)
    if not day_log:
        raise HTTPException(404, "No log for this date")

    # Find all entries with this meal_id and update them
    found_count = 0
    for entry in day_log["entries"]:
        if entry.get("meal_id") == meal_id:
            if req.meal_name is not None:
                entry["meal_name"] = req.meal_name
            if req.time is not None:
                # Update logged_at to preserve the time component of the date
                date_part = entry.get("logged_at", _now_iso()).split("T")[0]
                entry["logged_at"] = f"{date_part}T{req.time}:00Z"
            found_count += 1

    if found_count == 0:
        raise HTTPException(404, "No entries found for this meal_id")

    day_log["totals"] = _compute_day_totals(day_log["entries"])
    day_log["updated_at"] = _now_iso()
    save_user_data(current_user["name"], user_data)
    return {"ok": True, "updated_entries": found_count, "totals": day_log["totals"]}


# ────────────────────────────────────────────
#  Copy / Move meal between days
# ────────────────────────────────────────────

class CopyMoveMealRequest(BaseModel):
    source_date: str         # e.g. "2026-04-01"
    target_date: str         # e.g. "2026-04-03"
    meal_id: str             # meal_id in source date
    action: str = "copy"     # "copy" or "move"


@router.post("/logs/copy-meal")
async def copy_or_move_meal(
    req: CopyMoveMealRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Copy or move a meal (all its entries) from one date to another.

    action="copy" duplicates entries with new IDs on the target date.
    action="move" copies to target then deletes from source.
    """
    if req.action not in ("copy", "move"):
        raise HTTPException(400, "action must be 'copy' or 'move'")
    if req.source_date == req.target_date:
        raise HTTPException(400, "Source and target dates must be different")

    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)

    source_log = nutrition["logs"].get(req.source_date)
    if not source_log:
        raise HTTPException(404, "No log for source date")

    # Find entries for this meal
    source_entries = [e for e in source_log["entries"] if e.get("meal_id") == req.meal_id]
    if not source_entries:
        raise HTTPException(404, "No entries found for this meal_id on source date")

    # Prepare target log
    if req.target_date not in nutrition["logs"]:
        nutrition["logs"][req.target_date] = {"entries": [], "created_at": _now_iso()}
    target_log = nutrition["logs"][req.target_date]

    # Create copies with new IDs and a new meal_id
    new_meal_id = f"meal_{uuid.uuid4().hex[:12]}"
    for entry in source_entries:
        new_entry = copy.deepcopy(entry)
        new_entry["id"] = f"food_{uuid.uuid4().hex[:8]}"
        new_entry["meal_id"] = new_meal_id
        new_entry["logged_at"] = _now_iso()
        target_log["entries"].append(new_entry)

    target_log["totals"] = _compute_day_totals(target_log["entries"])
    target_log["updated_at"] = _now_iso()

    # If move, remove from source
    if req.action == "move":
        source_log["entries"] = [e for e in source_log["entries"] if e.get("meal_id") != req.meal_id]
        source_log["totals"] = _compute_day_totals(source_log["entries"])
        source_log["updated_at"] = _now_iso()

    save_user_data(current_user["name"], user_data)
    return {"ok": True, "action": req.action, "new_meal_id": new_meal_id}


# ────────────────────────────────────────────
#  Favourite meals
# ────────────────────────────────────────────

@router.get("/favourites")
async def get_favourite_meals(
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """List all favourite meals for the athlete."""
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own favourites")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    favourites = nutrition.get("favourites", [])
    return {"ok": True, "favourites": favourites}


@router.post("/favourites")
async def save_favourite_meal(
    req: FavouriteMeal,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Save a meal as a favourite for quick reuse.

    The favourite stores the meal name and its ingredients with per-100g data.
    When reused, quantities can be adjusted.
    """
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)

    # Create favourite record
    fav_id = req.id or f"fav_{uuid.uuid4().hex[:8]}"
    favourite = {
        "id": fav_id,
        "name": req.name,
        "ingredients": [ing.model_dump() for ing in req.ingredients],
        "created_at": req.created_at or _now_iso(),
    }

    nutrition["favourites"].append(favourite)
    save_user_data(current_user["name"], user_data)
    return {"ok": True, "favourite": favourite}


@router.delete("/favourites/{fav_id}")
async def delete_favourite_meal(
    fav_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Delete a favourite meal."""
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)

    original_len = len(nutrition["favourites"])
    nutrition["favourites"] = [f for f in nutrition["favourites"] if f.get("id") != fav_id]

    if len(nutrition["favourites"]) == original_len:
        raise HTTPException(404, "Favourite not found")

    save_user_data(current_user["name"], user_data)
    return {"ok": True, "deleted_id": fav_id}


# ────────────────────────────────────────────
#  Food search / lookup
# ────────────────────────────────────────────

@router.post("/lookup/food")
async def lookup_food(
    req: FoodSearchRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Search for food in USDA + Open Food Facts, fallback to Claude."""
    from ..services.food_lookup import search_food
    results = await search_food(req.query)
    return {"ok": True, "results": results}


@router.post("/lookup/text")
async def recognize_food_text(
    req: FoodSearchRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Use Claude to parse a natural language food description into macros."""
    from ..services.food_lookup import recognize_from_text
    results = await recognize_from_text(req.query)
    return {"ok": True, "results": results}


@router.get("/lookup/barcode/{barcode}")
async def lookup_barcode(
    barcode: str,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Look up a product by barcode (Open Food Facts)."""
    from ..services.food_lookup import lookup_barcode as _lookup_barcode
    result = await _lookup_barcode(barcode)
    if not result:
        raise HTTPException(404, "Product not found for this barcode")
    return {"ok": True, "product": result}


@router.post("/lookup/photo")
async def recognize_food_photo(
    file: UploadFile = File(...),
    description: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Use Claude vision to identify food from a photo and estimate macros."""
    from ..services.food_lookup import recognize_from_photo
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 10MB)")
    results = await recognize_from_photo(data, file.content_type or "image/jpeg", description)
    return {"ok": True, "results": results}


# ────────────────────────────────────────────
#  Recipes
# ────────────────────────────────────────────

@router.get("/recipes")
async def list_recipes(
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """List saved recipes."""
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own recipes")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    return {"ok": True, "recipes": nutrition.get("recipes", [])}


@router.post("/recipes")
async def save_recipe(
    req: RecipeSaveRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Save a new recipe."""
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)

    recipe = {
        "id": f"recipe_{uuid.uuid4().hex[:8]}",
        "name": req.name,
        "ingredients": [i.model_dump() for i in req.ingredients],
        "instructions": req.instructions,
        "prep_time_min": req.prep_time_min,
        "servings": req.servings,
        "tags": req.tags,
        "macro_totals": _compute_day_totals([i.model_dump() for i in req.ingredients]),
        "created_at": _now_iso(),
    }
    nutrition["recipes"].append(recipe)
    save_user_data(current_user["name"], user_data)
    return {"ok": True, "recipe": recipe}


@router.get("/recipes/{recipe_id}")
async def get_recipe(
    recipe_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """Get a specific recipe."""
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own recipes")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    for r in nutrition.get("recipes", []):
        if r["id"] == recipe_id:
            return {"ok": True, "recipe": r}
    raise HTTPException(404, "Recipe not found")


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(
    recipe_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Delete a recipe."""
    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)
    original = len(nutrition.get("recipes", []))
    nutrition["recipes"] = [r for r in nutrition.get("recipes", []) if r["id"] != recipe_id]
    if len(nutrition["recipes"]) == original:
        raise HTTPException(404, "Recipe not found")
    save_user_data(current_user["name"], user_data)
    return {"ok": True}


# ────────────────────────────────────────────
#  Meal plans
# ────────────────────────────────────────────

@router.get("/meal-plans")
async def list_meal_plans(
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """List meal plans."""
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only view own meal plans")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    return {"ok": True, "meal_plans": nutrition.get("meal_plans", [])}


@router.post("/meal-plans/generate")
async def generate_meal_plan(
    req: MealPlanGenerateRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Use Claude to generate a meal plan hitting the user's macro targets."""
    from ..services.nutrition_ai import generate_meal_plan

    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)

    # Use targets if set, otherwise calculate from profile
    targets = nutrition.get("targets")
    profile = nutrition.get("profile")
    calc = _calc_tdee(profile) if profile else None

    if not targets and calc:
        # Auto-derive targets from calculated TDEE
        targets = {
            "daily_calories": calc["recommended_calories"],
            "daily_protein_g": calc["recommended_protein_g"],
            "daily_carbs_g": calc["recommended_carbs_g"],
            "daily_fat_g": calc["recommended_fat_g"],
        }
    if not targets:
        raise HTTPException(400, "No nutrition targets set. Complete your profile or ask your coach to set targets.")

    # Build restrictions from profile diet type + request overrides
    diet_restrictions = []
    if profile:
        dt = profile.get("diet_type", "none")
        if dt != "none":
            diet_restrictions.append(DIET_LABELS.get(dt, dt))
        if profile.get("allergies"):
            diet_restrictions.append(f"Allergies: {profile['allergies']}")
        if profile.get("additional_preferences"):
            diet_restrictions.append(profile["additional_preferences"])
    if req.restrictions:
        diet_restrictions.append(req.restrictions)
    combined_restrictions = ". ".join(diet_restrictions)

    # Build preference context from profile
    pref_parts = []
    if profile:
        goal = profile.get("goal", "maintain")
        if goal == "lose":
            pref_parts.append("Focus on high-protein, satiating meals for weight loss")
        elif goal == "gain":
            pref_parts.append("Include calorie-dense, nutrient-rich meals for muscle gain")
    if req.preferences:
        pref_parts.append(req.preferences)
    combined_prefs = ". ".join(pref_parts)

    try:
        plan = await generate_meal_plan(targets, req.num_days, combined_prefs, combined_restrictions)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"AI generation failed: {e}")

    plan_record = {
        "id": f"plan_{uuid.uuid4().hex[:8]}",
        **plan,
        "created_at": _now_iso(),
        "created_by": current_user["name"],
    }
    nutrition["meal_plans"].append(plan_record)
    # Keep last 10 plans
    if len(nutrition["meal_plans"]) > 10:
        nutrition["meal_plans"] = nutrition["meal_plans"][-10:]
    save_user_data(current_user["name"], user_data)
    return {"ok": True, "meal_plan": plan_record}


class FixedMealIngredient(BaseModel):
    food_name: str
    serving_size: str = ""


class FixedMeal(BaseModel):
    """A meal the coach/athlete wants to lock in — AI will plan around it."""
    day: Optional[int] = None
    meal_type: str
    name: str = ""
    ingredients: list[FixedMealIngredient] = []


class CoachMealPlanRequest(BaseModel):
    username: str
    plan_name: str = ""                # optional name for the plan
    num_days: int = 7
    meals_per_day: int = 4
    meal_types: list[str] = []
    fixed_meals: list[FixedMeal] = []
    preferences: str = ""
    restrictions: str = ""
    stores: list[str] = []             # multiple stores for separate shopping lists


@router.post("/meal-plans/generate-for")
async def coach_generate_meal_plan(
    req: CoachMealPlanRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Coach generates a meal plan for a specific athlete."""
    from ..services.nutrition_ai import generate_meal_plan as _gen

    users = load_users()
    if req.username not in users:
        raise HTTPException(404, "Athlete not found")

    user_data = load_user_data(req.username)
    nutrition = _get_nutrition(user_data)

    # Use targets if set, otherwise calculate from profile
    targets = nutrition.get("targets")
    profile = nutrition.get("profile")
    calc = _calc_tdee(profile) if profile else None

    if not targets and calc:
        targets = {
            "daily_calories": calc["recommended_calories"],
            "daily_protein_g": calc["recommended_protein_g"],
            "daily_carbs_g": calc["recommended_carbs_g"],
            "daily_fat_g": calc["recommended_fat_g"],
        }
    if not targets:
        raise HTTPException(400, f"No nutrition targets set for {req.username}. Set their profile or targets first.")

    # Build restrictions from profile
    diet_restrictions = []
    if profile:
        dt = profile.get("diet_type", "none")
        if dt != "none":
            diet_restrictions.append(DIET_LABELS.get(dt, dt))
        if profile.get("allergies"):
            diet_restrictions.append(f"Allergies: {profile['allergies']}")
        if profile.get("additional_preferences"):
            diet_restrictions.append(profile["additional_preferences"])
    if req.restrictions:
        diet_restrictions.append(req.restrictions)

    pref_parts = []
    if profile:
        goal = profile.get("goal", "maintain")
        if goal == "lose":
            pref_parts.append("Focus on high-protein, satiating meals for weight loss")
        elif goal == "gain":
            pref_parts.append("Include calorie-dense, nutrient-rich meals for muscle gain")
    if req.preferences:
        pref_parts.append(req.preferences)

    # Serialize fixed meals for the AI — include ingredient details
    fixed_meals_data = []
    for fm in (req.fixed_meals or []):
        fmd = {"meal_type": fm.meal_type}
        if fm.day: fmd["day"] = fm.day
        if fm.name: fmd["name"] = fm.name
        if fm.ingredients:
            fmd["ingredients"] = [{"food_name": i.food_name, "serving_size": i.serving_size} for i in fm.ingredients if i.food_name.strip()]
        fixed_meals_data.append(fmd)

    logger.info(f"Coach {coach['name']} generating meal plan for {req.username}: {req.num_days} days, {req.meals_per_day} meals/day")
    logger.info(f"Targets: {targets}")
    logger.info(f"Fixed meals: {len(fixed_meals_data)}, Stores: {req.stores or ['generic']}")
    try:
        plan = await _gen(
            targets,
            num_days=req.num_days,
            meals_per_day=req.meals_per_day,
            meal_types=req.meal_types or [],
            fixed_meals=fixed_meals_data,
            preferences=". ".join(pref_parts),
            restrictions=". ".join(diet_restrictions),
            stores=req.stores,
        )
        logger.info(f"Meal plan generated OK for {req.username}")
    except ValueError as e:
        logger.error(f"Meal plan generation ValueError for {req.username}: {e}")
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Meal plan generation unexpected error for {req.username}: {type(e).__name__}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(500, f"AI generation failed: {type(e).__name__}: {e}")

    plan_id = f"plan_{uuid.uuid4().hex[:8]}"
    plan_name = req.plan_name.strip() if req.plan_name else f"{req.num_days}-Day Meal Plan"
    plan_record = {
        "id": plan_id,
        "name": plan_name,
        "assigned_to": req.username,
        **plan,
        "fixed_meals": fixed_meals_data,
        "stores": req.stores,
        "created_at": _now_iso(),
        "created_by": coach["name"],
    }
    nutrition["meal_plans"].append(plan_record)
    if len(nutrition["meal_plans"]) > 10:
        nutrition["meal_plans"] = nutrition["meal_plans"][-10:]
    save_user_data(req.username, user_data)
    return {"ok": True, "meal_plan": plan_record}


@router.post("/ai/suggest-recipes")
async def suggest_recipes_from_ingredients(
    req: RecipeFromIngredientsRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Claude suggests recipes from a list of available ingredients."""
    from ..services.nutrition_ai import suggest_recipes

    user_data = load_user_data(current_user["name"])
    nutrition = _get_nutrition(user_data)
    targets = nutrition.get("targets")

    recipes = await suggest_recipes(req.ingredients, targets, req.preferences, req.target_calories)
    return {"ok": True, "recipes": recipes}


@router.delete("/meal-plans/{plan_id}")
async def delete_meal_plan(
    plan_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    username: Optional[str] = Query(None),
):
    """Delete a meal plan. Coach can delete for any athlete via ?username=."""
    target_user = username or current_user["name"]
    if target_user != current_user["name"] and current_user.get("role") != "coach":
        raise HTTPException(403, "Can only delete own meal plans")

    user_data = load_user_data(target_user)
    nutrition = _get_nutrition(user_data)
    original = len(nutrition.get("meal_plans", []))
    nutrition["meal_plans"] = [p for p in nutrition.get("meal_plans", []) if p["id"] != plan_id]
    if len(nutrition["meal_plans"]) == original:
        raise HTTPException(404, "Meal plan not found")
    # If deleted plan was the active one, unassign it
    if nutrition.get("active_meal_plan") == plan_id:
        nutrition["active_meal_plan"] = None
    save_user_data(target_user, user_data)
    return {"ok": True}


class AssignMealPlanRequest(BaseModel):
    username: str
    plan_id: Optional[str] = None  # None to unassign


@router.post("/meal-plans/assign")
async def assign_meal_plan(
    req: AssignMealPlanRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Assign (or unassign) a meal plan to an athlete."""
    user_data = load_user_data(req.username)
    nutrition = _get_nutrition(user_data)

    if req.plan_id:
        plan = next((p for p in nutrition.get("meal_plans", []) if p.get("id") == req.plan_id), None)
        if not plan:
            raise HTTPException(404, "Meal plan not found for this athlete")
        nutrition["active_meal_plan"] = req.plan_id
    else:
        nutrition["active_meal_plan"] = None

    save_user_data(req.username, user_data)
    return {"ok": True}


class RenameMealPlanRequest(BaseModel):
    username: str
    plan_id: str
    name: str


@router.post("/meal-plans/rename")
async def rename_meal_plan(
    req: RenameMealPlanRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Rename a meal plan."""
    user_data = load_user_data(req.username)
    nutrition = _get_nutrition(user_data)
    plan = next((p for p in nutrition.get("meal_plans", []) if p.get("id") == req.plan_id), None)
    if not plan:
        raise HTTPException(404, "Meal plan not found")
    plan["name"] = req.name
    save_user_data(req.username, user_data)
    return {"ok": True}


# ────────────────────────────────────────────
#  Standalone Nutrition Plans (global, like workout programs)
# ────────────────────────────────────────────

GOAL_BLURBS = {
    "lose": "Designed for fat loss — high protein, calorie deficit",
    "maintain": "Designed for weight maintenance — balanced macros",
    "gain": "Designed for muscle gain — calorie surplus, high protein",
}


class CreateNutritionPlanRequest(BaseModel):
    plan_name: str
    goal: str = "maintain"  # lose / maintain / gain
    description: str = ""  # coach can write a blurb
    daily_calories: int
    daily_protein_g: int
    daily_carbs_g: int
    daily_fat_g: int
    num_days: int = 7
    meals_per_day: int = 4
    meal_types: list[str] = []
    fixed_meals: list[FixedMeal] = []
    preferences: str = ""
    restrictions: str = ""
    stores: list[str] = []


@router.get("/plans")
async def list_nutrition_plans(
    coach: Annotated[dict, Depends(require_coach)],
):
    """List all standalone nutrition plans."""
    plans = load_nutrition_plans()
    # Return summary (no full day data)
    summaries = []
    for p in plans:
        summaries.append({
            "id": p["id"],
            "name": p.get("name", "Untitled"),
            "goal": p.get("goal", "maintain"),
            "description": p.get("description", ""),
            "daily_calories": p.get("daily_calories", 0),
            "daily_protein_g": p.get("daily_protein_g", 0),
            "daily_carbs_g": p.get("daily_carbs_g", 0),
            "daily_fat_g": p.get("daily_fat_g", 0),
            "num_days": len(p.get("days", [])),
            "stores": p.get("stores", []),
            "created_at": p.get("created_at", ""),
            "created_by": p.get("created_by", ""),
        })
    return {"ok": True, "plans": summaries}


@router.get("/plans/{plan_id}")
async def get_nutrition_plan(
    plan_id: str,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Get full nutrition plan detail."""
    plans = load_nutrition_plans()
    plan = next((p for p in plans if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(404, "Nutrition plan not found")
    return {"ok": True, "plan": plan}


@router.post("/plans/generate")
async def generate_nutrition_plan(
    req: CreateNutritionPlanRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Coach creates a standalone nutrition plan with specified macros."""
    from ..services.nutrition_ai import generate_meal_plan as _gen

    targets = {
        "daily_calories": req.daily_calories,
        "daily_protein_g": req.daily_protein_g,
        "daily_carbs_g": req.daily_carbs_g,
        "daily_fat_g": req.daily_fat_g,
    }

    # Build preference string based on goal
    pref_parts = []
    if req.goal == "lose":
        pref_parts.append("Focus on high-protein, satiating meals for weight loss")
    elif req.goal == "gain":
        pref_parts.append("Include calorie-dense, nutrient-rich meals for muscle gain")
    if req.preferences:
        pref_parts.append(req.preferences)

    restriction_parts = []
    if req.restrictions:
        restriction_parts.append(req.restrictions)

    fixed_meals_data = []
    for fm in (req.fixed_meals or []):
        fmd = {"meal_type": fm.meal_type}
        if fm.day: fmd["day"] = fm.day
        if fm.name: fmd["name"] = fm.name
        if fm.ingredients:
            fmd["ingredients"] = [{"food_name": i.food_name, "serving_size": i.serving_size} for i in fm.ingredients if i.food_name.strip()]
        fixed_meals_data.append(fmd)

    logger.info(f"Coach {coach['name']} generating standalone nutrition plan: {req.plan_name}")
    logger.info(f"Targets: {targets}, Goal: {req.goal}")
    logger.info(f"Fixed meals: {len(fixed_meals_data)}, Stores: {req.stores or ['generic']}")

    try:
        plan = await _gen(
            targets,
            num_days=req.num_days,
            meals_per_day=req.meals_per_day,
            meal_types=req.meal_types or [],
            fixed_meals=fixed_meals_data,
            preferences=". ".join(pref_parts),
            restrictions=". ".join(restriction_parts),
            stores=req.stores,
        )
        logger.info(f"Standalone nutrition plan generated OK: {req.plan_name}")
    except ValueError as e:
        logger.error(f"Nutrition plan generation ValueError: {e}")
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Nutrition plan generation error: {type(e).__name__}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(500, f"AI generation failed: {type(e).__name__}: {e}")

    plan_id = f"nplan_{uuid.uuid4().hex[:8]}"
    auto_blurb = GOAL_BLURBS.get(req.goal, "")
    plan_record = {
        "id": plan_id,
        "name": req.plan_name.strip() or f"{req.num_days}-Day Nutrition Plan",
        "goal": req.goal,
        "description": req.description.strip() or auto_blurb,
        "daily_calories": req.daily_calories,
        "daily_protein_g": req.daily_protein_g,
        "daily_carbs_g": req.daily_carbs_g,
        "daily_fat_g": req.daily_fat_g,
        **plan,
        "fixed_meals": fixed_meals_data,
        "stores": req.stores,
        "created_at": _now_iso(),
        "created_by": coach["name"],
    }

    plans = load_nutrition_plans()
    plans.append(plan_record)
    save_nutrition_plans(plans)
    return {"ok": True, "plan": plan_record}


@router.delete("/plans/{plan_id}")
async def delete_nutrition_plan(
    plan_id: str,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Delete a standalone nutrition plan."""
    plans = load_nutrition_plans()
    original = len(plans)
    plans = [p for p in plans if p["id"] != plan_id]
    if len(plans) == original:
        raise HTTPException(404, "Nutrition plan not found")
    save_nutrition_plans(plans)
    return {"ok": True}


class RenameNutritionPlanRequest(BaseModel):
    name: str
    description: str = ""


@router.put("/plans/{plan_id}")
async def update_nutrition_plan(
    plan_id: str,
    req: RenameNutritionPlanRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Rename / update description of a standalone nutrition plan."""
    plans = load_nutrition_plans()
    plan = next((p for p in plans if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(404, "Nutrition plan not found")
    if req.name:
        plan["name"] = req.name
    if req.description is not None:
        plan["description"] = req.description
    save_nutrition_plans(plans)
    return {"ok": True}


class AssignNutritionPlanToAthleteRequest(BaseModel):
    athlete: str
    plan_id: Optional[str] = None  # None to unassign


@router.post("/plans/assign")
async def assign_nutrition_plan_to_athlete(
    req: AssignNutritionPlanToAthleteRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Assign a standalone nutrition plan to an athlete (copies it into their data)."""
    users = load_users()
    if req.athlete not in users:
        raise HTTPException(404, "Athlete not found")

    user_data = load_user_data(req.athlete)
    nutrition = _get_nutrition(user_data)

    if req.plan_id:
        plans = load_nutrition_plans()
        plan = next((p for p in plans if p["id"] == req.plan_id), None)
        if not plan:
            raise HTTPException(404, "Nutrition plan not found")
        # Copy plan into athlete's meal_plans and set as active
        athlete_plan = copy.deepcopy(plan)
        athlete_plan["assigned_from"] = plan["id"]
        athlete_plan["assigned_at"] = _now_iso()
        # Don't duplicate if already assigned
        existing = [p for p in nutrition.get("meal_plans", []) if p.get("assigned_from") == plan["id"]]
        if not existing:
            nutrition["meal_plans"].append(athlete_plan)
        plan_id_local = athlete_plan["id"]
        nutrition["active_meal_plan"] = plan_id_local
    else:
        nutrition["active_meal_plan"] = None

    save_user_data(req.athlete, user_data)
    return {"ok": True}


# ────────────────────────────────────────────
#  Coach: overview of all athletes' nutrition
# ────────────────────────────────────────────

@router.get("/coach/overview")
async def coach_nutrition_overview(
    coach: Annotated[dict, Depends(require_coach)],
):
    """Get nutrition summary for all athletes (coach only)."""
    users = load_users()
    today = _today()
    athletes = []

    for username, info in users.items():

        user_data = load_user_data(username)
        nutrition = _get_nutrition(user_data)
        targets = nutrition.get("targets")
        profile = nutrition.get("profile")
        today_log = nutrition["logs"].get(today, {"entries": [], "totals": {}})
        totals = today_log.get("totals", {})

        # Pull latest weight from metrics if available
        latest_weight = None
        metrics = user_data.get("metrics", [])
        for m in reversed(metrics):
            if m.get("weight"):
                latest_weight = m["weight"]
                break

        compliance = None
        if targets and totals:
            compliance = {
                "calories_pct": round((totals.get("calories", 0) / targets["daily_calories"]) * 100, 1) if targets.get("daily_calories") else None,
                "protein_pct": round((totals.get("protein_g", 0) / targets["daily_protein_g"]) * 100, 1) if targets.get("daily_protein_g") else None,
                "carbs_pct": round((totals.get("carbs_g", 0) / targets["daily_carbs_g"]) * 100, 1) if targets.get("daily_carbs_g") else None,
                "fat_pct": round((totals.get("fat_g", 0) / targets["daily_fat_g"]) * 100, 1) if targets.get("daily_fat_g") else None,
            }

        # Active meal plan info
        meal_plans = nutrition.get("meal_plans", [])
        active_plan_id = nutrition.get("active_meal_plan")
        active_plan = None
        if active_plan_id:
            active_plan = next((p for p in meal_plans if p.get("id") == active_plan_id), None)

        athletes.append({
            "username": username,
            "program": info.get("program", ""),
            "has_targets": targets is not None,
            "has_profile": profile is not None,
            "profile_summary": {
                "goal": profile.get("goal") if profile else None,
                "diet_type": profile.get("diet_type") if profile else None,
                "current_weight_kg": profile.get("current_weight_kg") if profile else None,
                "activity_level": profile.get("activity_level") if profile else None,
            } if profile else None,
            "latest_metrics_weight": latest_weight,
            "targets": targets,
            "today_totals": totals,
            "today_entries": len(today_log.get("entries", [])),
            "compliance": compliance,
            "active_meal_plan": {
                "id": active_plan["id"],
                "name": active_plan.get("name", f"{len(active_plan.get('days', []))}-Day Plan"),
                "days": len(active_plan.get("days", [])),
                "created_by": active_plan.get("created_by"),
            } if active_plan else None,
            "meal_plan_count": len(meal_plans),
        })

    return {"ok": True, "date": today, "athletes": athletes}


# ────────────────────────────────────────────
#  Helpers
# ────────────────────────────────────────────

def _compute_day_totals(entries: list[dict]) -> dict:
    """Sum up macros across all food entries."""
    totals = {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0}
    for e in entries:
        totals["calories"] += float(e.get("calories", 0) or 0)
        totals["protein_g"] += float(e.get("protein_g", 0) or 0)
        totals["carbs_g"] += float(e.get("carbs_g", 0) or 0)
        totals["fat_g"] += float(e.get("fat_g", 0) or 0)
        totals["fiber_g"] += float(e.get("fiber_g", 0) or 0)

    # Round for readability
    for k in totals:
        totals[k] = round(totals[k], 1)

    # Meal breakdown
    by_meal = {}
    for e in entries:
        meal = e.get("meal_type", "other")
        if meal not in by_meal:
            by_meal[meal] = {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
        by_meal[meal]["calories"] += float(e.get("calories", 0) or 0)
        by_meal[meal]["protein_g"] += float(e.get("protein_g", 0) or 0)
        by_meal[meal]["carbs_g"] += float(e.get("carbs_g", 0) or 0)
        by_meal[meal]["fat_g"] += float(e.get("fat_g", 0) or 0)
    for meal in by_meal:
        for k in by_meal[meal]:
            by_meal[meal][k] = round(by_meal[meal][k], 1)

    totals["by_meal"] = by_meal
    return totals
