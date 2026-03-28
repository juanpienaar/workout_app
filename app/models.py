"""Pydantic request/response models."""

from pydantic import BaseModel, EmailStr
from typing import Optional, Any


# ---- Auth ----

class LoginRequest(BaseModel):
    email: str
    password: str
    remember: bool = False

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


# ---- Nutrition ----

class NutritionTargets(BaseModel):
    daily_calories: float
    daily_protein_g: float
    daily_carbs_g: float
    daily_fat_g: float
    daily_fiber_g: Optional[float] = None
    notes: Optional[str] = ""

class SetNutritionTargetsRequest(BaseModel):
    username: str
    targets: NutritionTargets

class FoodEntry(BaseModel):
    id: Optional[str] = None
    food_name: str
    serving_size: str = ""
    serving_grams: Optional[float] = None
    calories: float = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    fiber_g: Optional[float] = None
    micros: Optional[dict[str, float]] = None
    source: str = "manual"  # "usda" | "openfoodfacts" | "claude" | "manual"
    source_id: Optional[str] = None
    meal_type: str = "other"  # "breakfast" | "lunch" | "dinner" | "snack" | "other"
    logged_at: Optional[str] = None

class DailyLogRequest(BaseModel):
    entries: list[FoodEntry]

class FoodSearchRequest(BaseModel):
    query: str

class FoodPhotoRequest(BaseModel):
    description: Optional[str] = ""

class RecipeSaveRequest(BaseModel):
    name: str
    ingredients: list[FoodEntry]
    instructions: str = ""
    prep_time_min: Optional[int] = None
    servings: int = 1
    tags: list[str] = []

class NutritionProfile(BaseModel):
    """Athlete's nutrition profile — drives calorie/macro calculations."""
    goal: str = "maintain"  # "lose" | "maintain" | "gain"
    current_weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    target_weeks: Optional[int] = None  # weeks to reach target
    height_cm: Optional[float] = None
    age: Optional[int] = None
    sex: str = "male"  # "male" | "female"
    activity_level: str = "moderate"  # "sedentary" | "light" | "moderate" | "active" | "very_active"
    diet_type: str = "none"  # "none" | "vegetarian" | "vegan" | "pescatarian" | "keto" | "banting" | "paleo" | "no_red_meat" | "halal" | "kosher"
    allergies: str = ""  # free text
    additional_preferences: str = ""  # free text

class MealPlanGenerateRequest(BaseModel):
    num_days: int = 7
    preferences: str = ""
    restrictions: str = ""

class RecipeFromIngredientsRequest(BaseModel):
    ingredients: list[str]
    preferences: str = ""
    target_calories: Optional[float] = None
