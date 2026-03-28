"""Nutrition AI service — Claude-powered meal planning, recipe generation."""

import asyncio
import json
import logging
import urllib.error
import urllib.request
from functools import partial
from typing import Optional

from .. import config

logger = logging.getLogger("numnum.nutrition_ai")


def _call_claude_sync(prompt: str, max_tokens: int = 2048) -> str:
    """Call Claude API synchronously (run in executor). Returns text response."""
    api_key = config.ANTHROPIC_API_KEY
    if not api_key:
        logger.error("ANTHROPIC_API_KEY is not set!")
        raise ValueError("ANTHROPIC_API_KEY not configured")

    logger.info(f"Calling Claude API: model=claude-sonnet-4-20250514, max_tokens={max_tokens}, prompt_len={len(prompt)}")

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

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            data = json.loads(raw)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else "no body"
        logger.error(f"Claude API HTTP error: {e.code} {e.reason} — {error_body[:500]}")
        raise ValueError(f"Claude API error {e.code}: {error_body[:200]}")
    except urllib.error.URLError as e:
        logger.error(f"Claude API URL error: {e.reason}")
        raise ValueError(f"Cannot reach Claude API: {e.reason}")
    except Exception as e:
        logger.error(f"Claude API unexpected error: {type(e).__name__}: {e}")
        raise

    stop_reason = data.get("stop_reason", "unknown")
    usage = data.get("usage", {})
    text = data.get("content", [{}])[0].get("text", "")

    logger.info(
        f"Claude API response: stop_reason={stop_reason}, "
        f"input_tokens={usage.get('input_tokens', '?')}, "
        f"output_tokens={usage.get('output_tokens', '?')}, "
        f"response_len={len(text)}, first_100={text[:100]!r}"
    )

    if stop_reason == "max_tokens":
        logger.warning(f"Claude response TRUNCATED (hit max_tokens={max_tokens})")

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
                loaded = json.load(f)
                costs = loaded if isinstance(loaded, list) else []

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
    meals_per_day: int = 4,
    meal_types: list[str] | None = None,
    fixed_meals: list[dict] | None = None,
    preferences: str = "",
    restrictions: str = "",
    store: str = "",
) -> dict:
    """Generate a meal plan that hits the given macro targets."""
    # Determine meal slots
    default_types = ["breakfast", "lunch", "dinner", "snack"]
    if meal_types:
        slots = meal_types
    else:
        slots = default_types[:meals_per_day]

    # Count how many meals AI needs to generate (subtract fixed meals)
    fixed = fixed_meals or []
    ai_meals_per_day = len(slots)  # worst case; fixed meals reduce this

    # Budget tokens: ~600 tokens per AI-generated meal + shopping list
    total_ai_meals = ai_meals_per_day * num_days - len(fixed) * (1 if any(f.get("day") for f in fixed) else num_days)
    total_ai_meals = max(total_ai_meals, num_days)  # at least 1 per day
    max_tokens = min(600 * total_ai_meals + 1500, 20000)

    # Build the prompt
    cal = int(targets.get('daily_calories', 2000))
    prot = int(targets.get('daily_protein_g', 150))
    carbs = int(targets.get('daily_carbs_g', 200))
    fat = int(targets.get('daily_fat_g', 70))

    prompt_parts = [
        f"Create a {num_days}-day meal plan. Daily targets: {cal}kcal, {prot}g protein, {carbs}g carbs, {fat}g fat.",
        f"Meal slots per day: {', '.join(slots)}.",
    ]

    # Fixed meals instruction
    if fixed:
        fixed_desc = []
        for fm in fixed:
            day_str = f"day {fm['day']}" if fm.get("day") else "every day"
            macros = ""
            if fm.get("calories"):
                macros = f" ({fm['calories']}kcal"
                if fm.get("protein_g"): macros += f", {fm['protein_g']}g protein"
                if fm.get("carbs_g"): macros += f", {fm['carbs_g']}g carbs"
                if fm.get("fat_g"): macros += f", {fm['fat_g']}g fat"
                macros += ")"
            fixed_desc.append(f'- {fm["meal_type"].capitalize()} on {day_str}: "{fm["name"]}"{macros}')
        prompt_parts.append(
            "FIXED MEALS (include these exactly as specified, plan other meals around their macros):\n"
            + "\n".join(fixed_desc)
        )

    if preferences:
        prompt_parts.append(f"Preferences: {preferences}.")
    if restrictions:
        prompt_parts.append(f"Restrictions: {restrictions}.")

    # Store-specific shopping list
    if store:
        prompt_parts.append(
            f"SHOPPING LIST: Generate the shopping list specifically for {store}. "
            f"Use product names, brands, and aisle categories that {store} actually stocks. "
            f"Include approximate prices in local currency where possible."
        )
    else:
        prompt_parts.append("Include a shopping_list with items, quantities, and categories.")

    prompt_parts.append(
        "Keep 3-4 ingredients per meal. 1-sentence instructions.\n\n"
        "Return ONLY compact JSON (no markdown, no explanation):\n"
        '{{"days":[{{"day":1,"meals":[{{"meal_type":"breakfast","name":"...","ingredients":'
        '[{{"food_name":"...","serving_size":"...","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}],'
        '"instructions":"...","prep_time_min":0,"meal_macros":{{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}}}],'
        '"day_totals":{{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}}}],'
        + ('"shopping_list":[{{"item":"...","quantity":"...","category":"...","price":"..."}}]}}' if store else
           '"shopping_list":[{{"item":"...","quantity":"...","category":"..."}}]}}')
        + "\n\nUse common, practical ingredients. Vary meals across days. Keep JSON compact."
    )

    prompt = "\n".join(prompt_parts)

    logger.info(f"Generating {num_days}-day meal plan: cal={targets.get('daily_calories')}, max_tokens={max_tokens}")

    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, partial(_call_claude_sync, prompt, max_tokens))

    logger.info(f"Got Claude response for meal plan: len={len(text)}")

    try:
        plan = _parse_json_response(text)
        logger.info(f"Parsed meal plan OK: {len(plan.get('days', []))} days")
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse failed: {e}")
        logger.error(f"Response first 1000 chars: {text[:1000]}")
        logger.error(f"Response last 200 chars: {text[-200:]}")
        # Try to salvage truncated JSON by closing brackets
        try:
            plan = _salvage_truncated_json(text)
            logger.info(f"Salvaged truncated meal plan JSON: {len(plan.get('days', []))} days")
        except Exception as se:
            logger.error(f"Salvage also failed: {se}")
            raise ValueError(f"AI returned malformed data (response len={len(text)}). Try fewer days (3 or 5) or try again.")

    return plan


def _salvage_truncated_json(text: str) -> dict:
    """Try to fix truncated JSON from Claude by closing open brackets."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        text = text.rsplit("```", 1)[0]
    # Close open brackets/braces
    open_braces = text.count("{") - text.count("}")
    open_brackets = text.count("[") - text.count("]")
    # Trim to last complete item (find last comma before EOF)
    if open_braces > 0 or open_brackets > 0:
        # Try to find a reasonable truncation point
        for i in range(len(text) - 1, max(0, len(text) - 200), -1):
            if text[i] == "}":
                candidate = text[:i+1] + "]" * open_brackets + "}" * max(0, open_braces - 1)
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    continue
    raise ValueError("Cannot salvage")


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
