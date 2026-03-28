"""Nutrition AI service — Claude-powered meal planning, recipe generation."""

import asyncio
import json
import logging
import urllib.request
from functools import partial
from typing import Optional

from .. import config

logger = logging.getLogger("numnum.nutrition_ai")


def _call_claude_sync(prompt: str, max_tokens: int = 2048) -> str:
    """Call Claude API synchronously (run in executor). Returns text response."""
    api_key = config.ANTHROPIC_API_KEY
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    body = json.dumps({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        method="POST",
    )
    req.add_header("Content-Type", "application/json")
    req.add_header("x-api-key", api_key)
    req.add_header("anthropic-version", "2023-06-01")

    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())

    text = data.get("content", [{}])[0].get("text", "")

    # Log API cost
    _log_cost(data)

    return text


def _parse_json_response(text: str) -> dict | list:
    """Extract JSON from Claude's response (handles code blocks)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        text = text.rsplit("```", 1)[0]
    return json.loads(text)


def _log_cost(response_data: dict):
    """Log Claude API usage to api_costs.json."""
    try:
        usage = response_data.get("usage", {})
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        # Approximate cost: Sonnet pricing
        cost = (input_tokens * 3 / 1_000_000) + (output_tokens * 15 / 1_000_000)

        costs = []
        if config.API_COSTS_FILE.exists():
            with open(config.API_COSTS_FILE) as f:
                costs = json.load(f)

        from datetime import datetime, timezone
        costs.append({
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "service": "nutrition_ai",
            "model": response_data.get("model", "claude-sonnet"),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": round(cost, 6),
        })

        # Keep last 500 entries
        if len(costs) > 500:
            costs = costs[-500:]

        with open(config.API_COSTS_FILE, "w") as f:
            json.dump(costs, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to log API cost: {e}")


# ────────────────────────────────────────────
#  Meal plan generation
# ────────────────────────────────────────────

async def generate_meal_plan(
    targets: dict,
    num_days: int = 7,
    preferences: str = "",
    restrictions: str = "",
) -> dict:
    """Generate a meal plan that hits the given macro targets."""
    prompt = f"""Create a {num_days}-day meal plan with these daily macro targets:
- Calories: {targets.get('daily_calories', 2000)} kcal
- Protein: {targets.get('daily_protein_g', 150)}g
- Carbs: {targets.get('daily_carbs_g', 200)}g
- Fat: {targets.get('daily_fat_g', 70)}g

{"Preferences: " + preferences if preferences else ""}
{"Dietary restrictions: " + restrictions if restrictions else ""}

For each day, provide 4 meals (breakfast, lunch, dinner, snack).
For each meal provide:
- meal_type: "breakfast" | "lunch" | "dinner" | "snack"
- name: short description
- ingredients: list of {{ food_name, serving_size, calories, protein_g, carbs_g, fat_g }}
- instructions: brief cooking instructions (2-3 sentences)
- prep_time_min: estimated prep time in minutes
- meal_macros: {{ calories, protein_g, carbs_g, fat_g }}

Also provide a shopping_list: list of {{ item, quantity, category }}

Return as JSON:
{{
  "days": [
    {{
      "day": 1,
      "meals": [ ... ],
      "day_totals": {{ calories, protein_g, carbs_g, fat_g }}
    }}
  ],
  "shopping_list": [ ... ]
}}

Make meals practical, varied, and easy to prepare. Use common ingredients.
Return ONLY the JSON, no other text."""

    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, partial(_call_claude_sync, prompt, 4096))

    try:
        plan = _parse_json_response(text)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse meal plan JSON: {text[:200]}")
        raise ValueError("Failed to generate meal plan. Please try again.")

    return plan


# ────────────────────────────────────────────
#  Recipe suggestions from ingredients
# ────────────────────────────────────────────

async def suggest_recipes(
    ingredients: list[str],
    targets: Optional[dict] = None,
    preferences: str = "",
    target_calories: Optional[float] = None,
) -> list[dict]:
    """Suggest recipes using the given ingredients."""
    target_info = ""
    if targets:
        target_info = f"""
Try to make recipes that align with these daily targets:
- Calories: {targets.get('daily_calories', 2000)} kcal
- Protein: {targets.get('daily_protein_g', 150)}g
- Carbs: {targets.get('daily_carbs_g', 200)}g
- Fat: {targets.get('daily_fat_g', 70)}g"""
    elif target_calories:
        target_info = f"\nTarget approximately {target_calories} kcal per recipe."

    prompt = f"""I have these ingredients available: {', '.join(ingredients)}

Suggest 3 recipes I can make primarily with these ingredients (you can include common pantry staples like salt, pepper, oil, etc.).
{target_info}
{"Preferences: " + preferences if preferences else ""}

For each recipe provide:
- name: string
- ingredients: list of {{ food_name, serving_size, calories, protein_g, carbs_g, fat_g }}
- instructions: step-by-step cooking instructions
- prep_time_min: number
- servings: number
- macro_totals: {{ calories, protein_g, carbs_g, fat_g }} (per serving)
- tags: list of strings (e.g. "high-protein", "quick", "vegetarian")

Return as a JSON array of recipes. Return ONLY the JSON, no other text."""

    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, partial(_call_claude_sync, prompt, 3072))

    try:
        recipes = _parse_json_response(text)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse recipe JSON: {text[:200]}")
        raise ValueError("Failed to generate recipes. Please try again.")

    return recipes
