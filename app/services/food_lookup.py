"""Food lookup service — USDA FoodData Central + Open Food Facts + Claude fallback."""

import asyncio
import json
import logging
import urllib.request
import urllib.parse
import urllib.error
from functools import partial
from pathlib import Path
from typing import Optional

from .. import config

logger = logging.getLogger("numnum.food_lookup")

# ────────────────────────────────────────────
#  Local cache to avoid redundant API calls
# ────────────────────────────────────────────

_cache: dict = {}


def _load_cache():
    global _cache
    if _cache:
        return
    if config.NUTRITION_CACHE_FILE.exists():
        try:
            with open(config.NUTRITION_CACHE_FILE) as f:
                _cache = json.load(f)
        except Exception:
            _cache = {}


def _save_cache():
    try:
        with open(config.NUTRITION_CACHE_FILE, "w") as f:
            json.dump(_cache, f)
    except Exception:
        pass


def _cache_get(key: str) -> Optional[list]:
    _load_cache()
    return _cache.get(key)


def _cache_set(key: str, results: list):
    _load_cache()
    _cache[key] = results
    # Keep cache under 5000 entries
    if len(_cache) > 5000:
        keys = list(_cache.keys())
        for k in keys[:1000]:
            del _cache[k]
    _save_cache()


# ────────────────────────────────────────────
#  USDA FoodData Central
# ────────────────────────────────────────────

def _search_usda_sync(query: str, max_results: int = 10) -> list[dict]:
    """Search USDA FoodData Central API (synchronous, run in executor)."""
    api_key = config.USDA_API_KEY
    if not api_key:
        logger.warning("USDA_API_KEY not set, skipping USDA lookup")
        return []

    url = "https://api.nal.usda.gov/fdc/v1/foods/search"
    params = urllib.parse.urlencode({
        "api_key": api_key,
        "query": query,
        "pageSize": max_results,
        "dataType": "Foundation,SR Legacy,Survey (FNDDS)",
    })

    try:
        req = urllib.request.Request(f"{url}?{params}", method="GET")
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        results = []
        for food in data.get("foods", []):
            nutrients = {n.get("nutrientName", ""): n.get("value", 0) for n in food.get("foodNutrients", [])}
            results.append({
                "food_name": food.get("description", ""),
                "source": "usda",
                "source_id": str(food.get("fdcId", "")),
                "serving_size": "100g",
                "serving_grams": 100,
                "calories": round(nutrients.get("Energy", 0), 1),
                "protein_g": round(nutrients.get("Protein", 0), 1),
                "carbs_g": round(nutrients.get("Carbohydrate, by difference", 0), 1),
                "fat_g": round(nutrients.get("Total lipid (fat)", 0), 1),
                "fiber_g": round(nutrients.get("Fiber, total dietary", 0), 1),
                "micros": {
                    "sodium_mg": round(nutrients.get("Sodium, Na", 0), 1),
                    "sugar_g": round(nutrients.get("Sugars, total including NLEA", nutrients.get("Sugars, Total", 0)), 1),
                    "calcium_mg": round(nutrients.get("Calcium, Ca", 0), 1),
                    "iron_mg": round(nutrients.get("Iron, Fe", 0), 1),
                    "vitamin_c_mg": round(nutrients.get("Vitamin C, total ascorbic acid", 0), 1),
                },
                "brand": food.get("brandName", ""),
            })
        return results
    except Exception as e:
        logger.error(f"USDA lookup error: {e}")
        return []


# ────────────────────────────────────────────
#  Open Food Facts
# ────────────────────────────────────────────

def _search_openfoodfacts_sync(query: str, max_results: int = 10) -> list[dict]:
    """Search Open Food Facts API (synchronous, run in executor)."""
    url = "https://world.openfoodfacts.org/cgi/search.pl"
    params = urllib.parse.urlencode({
        "search_terms": query,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": max_results,
    })

    try:
        req = urllib.request.Request(f"{url}?{params}", method="GET")
        req.add_header("User-Agent", "NumNumWorkout/1.0 (numnum.fit)")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        results = []
        for product in data.get("products", []):
            n = product.get("nutriments", {})
            name = product.get("product_name", "")
            if not name:
                continue

            brand = product.get("brands", "")
            display_name = f"{name} ({brand})" if brand else name

            results.append({
                "food_name": display_name,
                "source": "openfoodfacts",
                "source_id": product.get("code", ""),
                "serving_size": product.get("serving_size", "100g"),
                "serving_grams": float(product.get("serving_quantity", 100) or 100),
                "calories": round(float(n.get("energy-kcal_100g", 0) or 0), 1),
                "protein_g": round(float(n.get("proteins_100g", 0) or 0), 1),
                "carbs_g": round(float(n.get("carbohydrates_100g", 0) or 0), 1),
                "fat_g": round(float(n.get("fat_100g", 0) or 0), 1),
                "fiber_g": round(float(n.get("fiber_100g", 0) or 0), 1),
                "micros": {
                    "sodium_mg": round(float(n.get("sodium_100g", 0) or 0) * 1000, 1),
                    "sugar_g": round(float(n.get("sugars_100g", 0) or 0), 1),
                },
                "brand": brand,
            })
        return results
    except Exception as e:
        logger.error(f"Open Food Facts lookup error: {e}")
        return []


# ────────────────────────────────────────────
#  Claude fallback (text-based food recognition)
# ────────────────────────────────────────────

def _ask_claude_food_sync(query: str) -> list[dict]:
    """Use Claude to estimate macros for a food item (synchronous)."""
    api_key = config.ANTHROPIC_API_KEY
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set, skipping Claude fallback")
        return []

    prompt = f"""Estimate the nutritional information for: "{query}"

Return a JSON array of food items. Each item should have:
- food_name: string
- serving_size: string (e.g. "100g", "1 medium banana")
- serving_grams: number
- calories: number (kcal)
- protein_g: number
- carbs_g: number
- fat_g: number
- fiber_g: number

Be as accurate as possible. If the query describes a meal with multiple items, list each separately.
Return ONLY the JSON array, no other text."""

    try:
        body = json.dumps({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
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

        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())

        text = data.get("content", [{}])[0].get("text", "")
        # Extract JSON from response
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]

        items = json.loads(text)
        results = []
        for item in items:
            results.append({
                "food_name": item.get("food_name", query),
                "source": "claude",
                "source_id": "",
                "serving_size": item.get("serving_size", "estimated"),
                "serving_grams": float(item.get("serving_grams", 0) or 0),
                "calories": round(float(item.get("calories", 0) or 0), 1),
                "protein_g": round(float(item.get("protein_g", 0) or 0), 1),
                "carbs_g": round(float(item.get("carbs_g", 0) or 0), 1),
                "fat_g": round(float(item.get("fat_g", 0) or 0), 1),
                "fiber_g": round(float(item.get("fiber_g", 0) or 0), 1),
                "micros": {},
                "brand": "",
            })
        return results
    except Exception as e:
        logger.error(f"Claude food lookup error: {e}")
        return []


def _claude_vision_sync(image_bytes: bytes, content_type: str, description: str = "") -> list[dict]:
    """Use Claude vision to identify food from an image (synchronous)."""
    import base64
    api_key = config.ANTHROPIC_API_KEY
    if not api_key:
        return []

    media_type = content_type if content_type in ("image/jpeg", "image/png", "image/gif", "image/webp") else "image/jpeg"
    b64 = base64.b64encode(image_bytes).decode()

    prompt = """Identify all food items in this image and estimate their nutritional information.

Return a JSON array where each item has:
- food_name: string
- serving_size: string (estimate portion shown)
- serving_grams: number (estimate)
- calories: number (kcal)
- protein_g: number
- carbs_g: number
- fat_g: number
- fiber_g: number

Be as accurate as possible with portion estimation. Return ONLY the JSON array."""

    if description:
        prompt += f"\n\nAdditional context from the user: {description}"

    try:
        body = json.dumps({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": prompt},
                ],
            }],
        }).encode()

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            method="POST",
        )
        req.add_header("Content-Type", "application/json")
        req.add_header("x-api-key", api_key)
        req.add_header("anthropic-version", "2023-06-01")

        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())

        text = data.get("content", [{}])[0].get("text", "")
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]

        items = json.loads(text)
        results = []
        for item in items:
            results.append({
                "food_name": item.get("food_name", "Unknown"),
                "source": "claude",
                "source_id": "",
                "serving_size": item.get("serving_size", "estimated"),
                "serving_grams": float(item.get("serving_grams", 0) or 0),
                "calories": round(float(item.get("calories", 0) or 0), 1),
                "protein_g": round(float(item.get("protein_g", 0) or 0), 1),
                "carbs_g": round(float(item.get("carbs_g", 0) or 0), 1),
                "fat_g": round(float(item.get("fat_g", 0) or 0), 1),
                "fiber_g": round(float(item.get("fiber_g", 0) or 0), 1),
                "micros": {},
                "brand": "",
            })
        return results
    except Exception as e:
        logger.error(f"Claude vision error: {e}")
        return []


# ────────────────────────────────────────────
#  Public API (async)
# ────────────────────────────────────────────

async def search_food(query: str, max_results: int = 10) -> list[dict]:
    """Search for food: USDA first, then Open Food Facts, then Claude.

    Returns merged & deduplicated results.
    """
    cache_key = f"search:{query.lower().strip()}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached[:max_results]

    loop = asyncio.get_event_loop()

    # Run USDA and Open Food Facts in parallel
    usda_task = loop.run_in_executor(None, partial(_search_usda_sync, query, max_results))
    off_task = loop.run_in_executor(None, partial(_search_openfoodfacts_sync, query, max_results))

    usda_results, off_results = await asyncio.gather(usda_task, off_task)

    # Merge: USDA first (more accurate), then Open Food Facts
    results = usda_results + off_results

    # If no results from databases, try Claude
    if not results:
        claude_results = await loop.run_in_executor(None, partial(_ask_claude_food_sync, query))
        results = claude_results

    # Deduplicate by food name (case-insensitive)
    seen = set()
    unique = []
    for r in results:
        key = r["food_name"].lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(r)

    _cache_set(cache_key, unique)
    return unique[:max_results]


async def recognize_from_text(description: str) -> list[dict]:
    """Use Claude to parse a natural language food description."""
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, partial(_ask_claude_food_sync, description))
    return results


async def recognize_from_photo(image_bytes: bytes, content_type: str, description: str = "") -> list[dict]:
    """Use Claude vision to identify food from a photo."""
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, partial(_claude_vision_sync, image_bytes, content_type, description))
    return results
