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
    stores: list[str] | None = None,
) -> dict:
    """Generate a meal plan that hits the given macro targets."""
    # Determine meal slots
    default_types = ["breakfast", "lunch", "dinner", "snack"]
    slots = meal_types if meal_types else default_types[:meals_per_day]

    # Count AI-generated meals and budget tokens
    fixed = fixed_meals or []
    total_ai_meals = len(slots) * num_days - len(fixed) * (1 if any(f.get("day") for f in fixed) else num_days)
    total_ai_meals = max(total_ai_meals, num_days)
    store_list = stores or []
    # Extra tokens for each additional store shopping list
    store_tokens = max(len(store_list), 1) * 800
    max_tokens = min(600 * total_ai_meals + store_tokens + 1000, 20000)

    cal = int(targets.get('daily_calories', 2000))
    prot = int(targets.get('daily_protein_g', 150))
    carbs = int(targets.get('daily_carbs_g', 200))
    fat = int(targets.get('daily_fat_g', 70))

    prompt_parts = [
        f"Create a {num_days}-day meal plan. Daily targets: {cal}kcal, {prot}g protein, {carbs}g carbs, {fat}g fat.",
        f"Meal slots per day: {', '.join(slots)}.",
        "",
        "CRITICAL INGREDIENT SPECIFICITY RULES:",
        "- Every ingredient MUST specify the exact variant. Never use generic names.",
        "- Dairy: always state fat percentage (e.g. '0% fat Greek yogurt', '2% fat milk', '5% fat Fage Total')",
        "- Meat: always state cut AND fat content (e.g. '5% fat lean beef mince', 'chicken breast skinless', 'pork tenderloin trimmed')",
        "- Bread: specify type (e.g. 'wholemeal sourdough', 'white pitta bread', 'seeded rye bread')",
        "- Rice/pasta: specify type (e.g. 'basmati rice', 'wholemeal fusilli pasta', 'egg noodles')",
        "- Oils: specify type (e.g. 'extra virgin olive oil', 'coconut oil')",
        "- Nuts/seeds: specify if raw, roasted, salted (e.g. 'raw unsalted almonds')",
        "- Cheese: specify type and fat (e.g. 'light mozzarella', 'mature cheddar', 'reduced-fat cottage cheese')",
        "- Protein powder: specify type (e.g. 'whey protein isolate', 'casein protein')",
        "- All serving_size values must be in grams or ml with a number (e.g. '150g', '200ml', '2 large eggs ~120g')",
        "",
    ]

    # Fixed meals with ingredient detail
    if fixed:
        fixed_desc = []
        for fm in fixed:
            day_str = f"day {fm['day']}" if fm.get("day") else "every day"
            ings = fm.get("ingredients", [])
            if ings:
                ing_list = ", ".join(f"{i['serving_size']} {i['food_name']}" if i.get('serving_size') else i['food_name'] for i in ings)
                fixed_desc.append(f'- {fm["meal_type"].capitalize()} on {day_str}: {ing_list}')
            elif fm.get("name"):
                fixed_desc.append(f'- {fm["meal_type"].capitalize()} on {day_str}: "{fm["name"]}"')
        prompt_parts.append(
            "FIXED MEALS (include these exactly with the specified ingredients and amounts. "
            "Calculate their macros accurately. Plan other meals to compensate and hit daily targets):\n"
            + "\n".join(fixed_desc)
        )

    if preferences:
        prompt_parts.append(f"Preferences: {preferences}.")
    if restrictions:
        prompt_parts.append(f"Restrictions: {restrictions}.")

    # Multi-store shopping lists
    if store_list:
        stores_str = ", ".join(store_list)
        prompt_parts.append(
            f"\nSHOPPING LISTS: Generate SEPARATE shopping lists for each of these stores: {stores_str}.\n"
            f"For each store, use product names, brands, and aisle categories that store actually stocks.\n"
            f"Include approximate prices in local currency.\n"
            f"Return as \"shopping_lists\": [{{\n"
            f"  \"store\": \"StoreName\", \"items\": [{{\"item\": \"...\", \"quantity\": \"...\", \"category\": \"...\", \"price\": \"...\"}}]\n"
            f"}}] — one object per store."
        )
    else:
        prompt_parts.append('\nInclude "shopping_list": [{{"item":"...","quantity":"...","category":"..."}}]')

    prompt_parts.append(
        "\nKeep 3-5 ingredients per meal. 1-sentence instructions.\n\n"
        "Return ONLY compact JSON (no markdown, no explanation):\n"
        '{{"days":[{{"day":1,"meals":[{{"meal_type":"breakfast","name":"...","ingredients":'
        '[{{"food_name":"SPECIFIC name with fat%/variant","serving_size":"150g","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}],'
        '"instructions":"...","prep_time_min":0,"meal_macros":{{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}}}],'
        '"day_totals":{{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}}}],'
        + ('"shopping_lists":[{{"store":"...","items":[{{"item":"...","quantity":"...","category":"...","price":"..."}}]}}]}}' if store_list else
           '"shopping_list":[{{"item":"...","quantity":"...","category":"..."}}]}}')
        + "\n\nVary meals across days. Keep JSON compact."
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
