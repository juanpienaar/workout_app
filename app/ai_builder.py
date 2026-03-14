"""AI Program Builder — Claude-powered workout program generation."""

import csv
import io
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from . import config
from .logger import log_event

# ── Model definitions ────────────────────────────────────────────

MODELS = {
    "haiku": {
        "id": "claude-haiku-4-5-20251001",
        "label": "Haiku — Fast & cheap",
        "input_per_m": 0.80,
        "output_per_m": 4.00,
    },
    "sonnet": {
        "id": "claude-sonnet-4-5-20250929",
        "label": "Sonnet — Balanced (recommended)",
        "input_per_m": 3.00,
        "output_per_m": 15.00,
    },
    "opus": {
        "id": "claude-opus-4-5-20251101",
        "label": "Opus — Most capable",
        "input_per_m": 15.00,
        "output_per_m": 75.00,
    },
}

COST_FILE = config.API_COSTS_FILE

# ── System prompts ───────────────────────────────────────────────

PROGRAM_SYSTEM_PROMPT = """You are an expert strength and conditioning coach. You design training programs in CSV format.

RULES:
- Always output valid CSV with these exact columns: Program,Week,Day,Order,Exercise,Sets,Reps,Tempo,Rest,RPE,Instruction
- Use exercises from the provided exercise library when possible
- For supersets, use orders like 1a, 1b. For circuits, use 1a, 1b, 1c
- Rest days should have Order=REST, Exercise=Rest Day, Sets=0, Reps=0, empty Tempo/Rest/RPE
- Tempo format: eccentric-pause-concentric-pause (e.g., 3-1-2-0)
- Rest in seconds with s suffix (e.g., 90s, 120s) or minutes (e.g., 2min)
- RPE scale 1-10
- Instruction should be brief form cues
- NEVER use commas inside any field value. Use semicolons or slashes instead
- Output ONLY the CSV data, no markdown, no explanation, no code fences

CROSSFIT-SPECIFIC FORMAT:
- For WODs: Exercise=WOD name; Sets=1; Reps=1; Instruction=full WOD description
- For AMRAP/EMOM: Exercise=format name; Sets=1; Reps=time cap; Instruction=movement list with reps
- For strength: use normal format
- Label sections via Order: W1/W2 for warmup; S1/S2 for strength; M1 for metcon

HYROX-SPECIFIC FORMAT:
- For running: Exercise=Running; Sets=number of intervals; Reps=distance; Instruction=pace/type details
- For station work: Exercise=station name; specify distances and loads in Instruction
- For race sims: Exercise=Race Simulation; Sets=1; Reps=1; Instruction=full sim description"""


# ── Cost tracking ────────────────────────────────────────────────

def load_costs() -> dict:
    if COST_FILE.exists():
        with open(COST_FILE) as f:
            return json.load(f)
    return {"total_cost_usd": 0.0, "requests": []}


def save_costs(costs: dict):
    COST_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(COST_FILE, "w") as f:
        json.dump(costs, f, indent=2)


def track_usage(input_tokens: int, output_tokens: int, model_key: str, description: str = "") -> float:
    costs = load_costs()
    model_info = MODELS.get(model_key, MODELS["sonnet"])
    cost = (input_tokens / 1_000_000) * model_info["input_per_m"] + \
           (output_tokens / 1_000_000) * model_info["output_per_m"]
    costs["total_cost_usd"] = costs.get("total_cost_usd", 0.0) + cost
    costs["requests"].append({
        "timestamp": datetime.now().isoformat(),
        "model": model_key,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost, 6),
        "description": description,
    })
    save_costs(costs)
    return cost


# ── Exercise library context ─────────────────────────────────────

def build_exercise_library_context() -> str:
    """Format exercise library for Claude context."""
    exercises_path = config.EXERCISES_FILE
    if not exercises_path.exists():
        return "No exercise library available."
    with open(exercises_path) as f:
        exercises = json.load(f)

    lines = ["Available exercises in the gym:"]
    for body_part, categories in exercises.items():
        lines.append(f"\n{body_part}:")
        if isinstance(categories, dict):
            for cat, ex_list in categories.items():
                names = [ex["name"] if isinstance(ex, dict) else ex for ex in ex_list]
                lines.append(f"  {cat}: {', '.join(names)}")
        elif isinstance(categories, list):
            names = [ex["name"] if isinstance(ex, dict) else ex for ex in categories]
            lines.append(f"  {', '.join(names)}")
    return "\n".join(lines)


# ── Prompt builder ───────────────────────────────────────────────

def build_prompt(
    types: list[str],
    type_config: dict,
    weeks: int,
    name: str,
    notes: str = "",
    days_per_week: int = 5,
    session_time: int = 60,
    experience: str = "intermediate",
    coach_philosophy: str = "",
    athlete_prompt: str = "",
    day_plan: dict = None,
    progression_style: str = "",
    day_plan_prompt: str = "",
) -> str:
    """Build the user prompt for Claude based on selected program types and config."""
    type_labels = " + ".join(t.title() for t in types) if types else "Custom"
    is_combo = len(types) > 1

    # Start with coach philosophy if provided
    prompt_parts = []
    if coach_philosophy:
        prompt_parts.append(f"""COACH'S TRAINING PHILOSOPHY:
{coach_philosophy}

Apply this philosophy throughout the program design.""")

    # Add athlete-specific context if provided
    if athlete_prompt:
        prompt_parts.append(f"""ATHLETE-SPECIFIC CONTEXT:
{athlete_prompt}

Tailor the program to this athlete's specific needs and goals.""")

    prompt_parts.append(f'Generate a {weeks}-week {type_labels} training program called "{name}".')
    prompt_parts.append(f"""
Common details:
- Experience: {experience}
- Training days per week: {days_per_week} (scatter {7 - days_per_week} rest days across the 7-day week)
- Total days per week: 7 (training + rest = 7)
- Maximum session duration: {session_time} minutes
{f'- Additional notes: {notes}' if notes else ''}""")

    if is_combo:
        prompt_parts.append(f"""
COMBINED PROGRAM RULES:
- This is a combined {type_labels} program. The different disciplines must COMPLEMENT each other.
- Never schedule heavy lower-body strength and a hard running/cycling session on the same or consecutive days.
- Alternate hard and easy days. Balance intensity across the week.
- Each day should focus primarily on one discipline unless explicitly combining (e.g. strength + conditioning finisher).""")

    # Type-specific sections
    if "strength" in type_config:
        cfg = type_config["strength"]
        prompt_parts.append(f"""
STRENGTH / BODYBUILDING:
- Goal: {cfg.get('goal', 'hypertrophy')}
- Split: {cfg.get('split', 'upper/lower')}
- Equipment: {', '.join(cfg.get('equipment', ['full gym']))}""")

    if "crossfit" in type_config:
        cfg = type_config["crossfit"]
        prompt_parts.append(f"""
CROSSFIT:
- Focus: {', '.join(cfg.get('focus', ['general']))}
- Equipment: {', '.join(cfg.get('equipment', ['full gym']))}
- Include benchmark WODs periodically. Use proper CrossFit schemes: AMRAP/EMOM/RFT/For Time/Tabata.
- Each session: warm-up → skill/strength → WOD → cool-down.""")

    if "hyrox" in type_config:
        cfg = type_config["hyrox"]
        prompt_parts.append(f"""
HYROX:
- Phase: {cfg.get('phase', 'base building')}
- Category: {cfg.get('category', 'open')}
- Race format: 8 x (1km Run + Station). Stations: Ski Erg 1000m; Sled Push 50m; Sled Pull 50m; Burpee Broad Jumps 80m; Rowing 1000m; Farmers Carry 200m; Sandbag Lunges 100m; Wall Balls 75-100 reps.
- Include running intervals; station-specific training; race simulations; transition practice.""")

    if "running" in type_config:
        cfg = type_config["running"]
        prompt_parts.append(f"""
RUNNING:
- Goal: {cfg.get('goal', '5K improvement')}
- Current mileage: {cfg.get('mileage', '20km/week')}
- Include: easy runs; tempo runs; interval sessions; long runs; recovery runs.
- Progressive overload on weekly volume (max 10% increase per week).""")

    if "cycling" in type_config:
        cfg = type_config["cycling"]
        prompt_parts.append(f"""
CYCLING:
- Goal: {cfg.get('goal', 'endurance')}
- Bike type: {cfg.get('type', 'road')}
- Current volume: {cfg.get('hours', '5 hours/week')}
- Include: endurance rides; interval sessions; hill repeats; recovery spins.""")

    if "swimming" in type_config:
        cfg = type_config["swimming"]
        prompt_parts.append(f"""
SWIMMING:
- Goal: {cfg.get('goal', 'fitness')}
- Level: {cfg.get('level', 'intermediate')}
- Pool access: {cfg.get('access', '25m pool')}
- Structure sessions as: warm-up → main set → cool-down.
- Use Instruction field for stroke type; pace; rest intervals.""")

    # Day plan section (from "By Day Plan" builder mode)
    if day_plan and any(items for items in day_plan.values() if items):
        dp_lines = ["DAY-BY-DAY EXERCISE PLAN:"]
        dp_lines.append("The coach has assigned specific exercises/muscle groups to each day. Follow this plan as the foundation for EVERY week.")
        for day_name, items in day_plan.items():
            if not items:
                continue
            item_strs = []
            for item in items:
                if isinstance(item, dict):
                    n = item.get("name", "")
                    role = item.get("role")
                    if role and role in ("main", "accessory"):
                        item_strs.append(f"  - {n} [{role.upper()} movement]")
                    else:
                        item_strs.append(f"  - {n}")
                else:
                    item_strs.append(f"  - {item}")
            dp_lines.append(f"\n{day_name}:")
            dp_lines.extend(item_strs)

        dp_lines.append("\nRULES FOR DAY PLAN:")
        dp_lines.append("- Items marked [MAIN movement] are the primary lifts — keep these every week, apply progressive overload.")
        dp_lines.append("- Items marked [ACCESSORY movement] are supplementary — these can be rotated or varied across weeks if the progression style is 'varied'.")
        dp_lines.append("- Items like '[Strength: Back]' mean the coach wants exercises targeting that muscle group — YOU choose appropriate exercises.")
        dp_lines.append("- 'Rest Day' means no training that day.")
        dp_lines.append("- Open WOD items should be included as-is on that day.")

        if progression_style == "progressive":
            dp_lines.append("\nPROGRESSION STYLE: Progressive Overload")
            dp_lines.append("- Keep the SAME exercises each week. Increase load, volume, or intensity over time.")
            dp_lines.append("- Main movements: increase weight or add sets/reps each week.")
            dp_lines.append("- Accessory movements: keep the same exercises but progress reps or load.")
        elif progression_style == "varied":
            dp_lines.append("\nPROGRESSION STYLE: Varied Selection")
            dp_lines.append("- Keep MAIN movements the same each week with progressive overload.")
            dp_lines.append("- ROTATE accessory movements week to week — swap in different exercises that target the same muscle group.")
            dp_lines.append("- This keeps training fresh while still building on the main lifts.")

        if day_plan_prompt:
            dp_lines.append(f"\nADDITIONAL COACHING INSTRUCTIONS:\n{day_plan_prompt}")

        prompt_parts.append("\n".join(dp_lines))

    # Exercise library context
    exercise_context = build_exercise_library_context()
    prompt_parts.append(f"""
{exercise_context}

Generate the complete CSV with all {weeks} weeks. Include the header row.
Each week should have exactly 7 days ({days_per_week} training + {7 - days_per_week} rest).
Fit each training session within {session_time} minutes.
Use exercises from the library above when possible.""")

    return "\n".join(prompt_parts)


# ── CSV parsing ──────────────────────────────────────────────────

EXPECTED_COLS = ["Program", "Week", "Day", "Order", "Exercise",
                 "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]


def _strip_fences(text: str) -> str:
    """Strip markdown code fences (```csv, ```text, ```, etc.) from response."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```csv, ```text, ```, etc.)
        lines = lines[1:]
        # Remove last line if it's ```
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def parse_ai_csv(response_text: str) -> list[dict]:
    """Parse Claude's CSV response into a list of row dicts."""
    csv_text = _strip_fences(response_text.strip())

    log_event("csv_parse", "started", f"Parsing CSV ({len(csv_text)} chars, {csv_text.count(chr(10))+1} lines)", {
        "first_200_chars": csv_text[:200],
    })

    # Try standard CSV parse first
    rows = []
    try:
        reader = csv.DictReader(io.StringIO(csv_text))
        if reader.fieldnames:
            # Normalize fieldnames — strip whitespace and match case-insensitively
            normalized = [f.strip() for f in reader.fieldnames]
            log_event("csv_parse", "info", f"CSV header columns: {normalized}")

            if len(normalized) >= 5:  # Relaxed: at least 5 columns (was 10)
                col_map = {}
                for expected in EXPECTED_COLS:
                    for i, actual in enumerate(normalized):
                        if actual.lower() == expected.lower() and i not in col_map.values():
                            col_map[expected] = actual
                            break
                log_event("csv_parse", "info", f"Column mapping: {col_map} ({len(col_map)}/{len(EXPECTED_COLS)} matched)")

                if len(col_map) >= 5:  # Relaxed: at least 5 of 11 expected columns (was 10)
                    for csv_row in reader:
                        row = {}
                        for expected, actual in col_map.items():
                            row[expected] = (csv_row.get(actual) or "").strip()
                        # Fill missing columns
                        for col in EXPECTED_COLS:
                            if col not in row:
                                row[col] = ""
                        rows.append(row)
    except Exception as e:
        log_event("csv_parse", "warning", f"Standard CSV parse failed: {str(e)}")

    if rows:
        log_event("csv_parse", "success", f"Standard CSV parse: {len(rows)} rows")
        return rows

    # Fallback: use Python csv reader with different dialects
    for delimiter in [",", "\t", ";"]:
        try:
            reader = csv.reader(io.StringIO(csv_text), delimiter=delimiter)
            all_rows = list(reader)
            if len(all_rows) > 1 and len(all_rows[0]) >= 5:
                header = [h.strip() for h in all_rows[0]]
                for data_row in all_rows[1:]:
                    if not any(v.strip() for v in data_row):
                        continue
                    if len(data_row) >= 5:
                        # Handle extra commas in last column (Instruction)
                        if len(data_row) > len(header):
                            data_row = data_row[:len(header)-1] + [delimiter.join(data_row[len(header)-1:])]
                        row = {}
                        for i, col in enumerate(EXPECTED_COLS):
                            if i < len(header) and i < len(data_row):
                                row[col] = data_row[i].strip().strip('"')
                            else:
                                row[col] = ""
                        rows.append(row)
                if rows:
                    log_event("csv_parse", "success", f"Fallback CSV parse (delim={repr(delimiter)}): {len(rows)} rows")
                    return rows
        except Exception:
            pass

    # Last resort: line-by-line comma split
    lines = csv_text.strip().split("\n")
    for line in lines[1:]:  # skip header
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) >= 10:
            row = parts[:10] + [",".join(parts[10:])] if len(parts) > 10 else parts[:10] + [""]
            cleaned = [v.strip().strip('"') for v in row]
            rows.append(dict(zip(EXPECTED_COLS, cleaned)))

    if rows:
        log_event("csv_parse", "success", f"Last-resort line parse: {len(rows)} rows")
    else:
        log_event("csv_parse", "error", f"All parse methods failed", {
            "response_length": len(csv_text),
            "first_500_chars": csv_text[:500],
            "line_count": len(lines),
        })

    return rows


def csv_rows_to_program(rows: list[dict], program_name: str) -> dict:
    """Convert parsed CSV rows into the program.json structure."""
    from collections import OrderedDict

    # Map day names to numbers (Claude often outputs "Mon", "Monday" etc. instead of 1-7)
    DAY_NAME_MAP = {}
    for i, names in enumerate([
        ["mon", "monday"], ["tue", "tuesday", "tues"],
        ["wed", "wednesday"], ["thu", "thursday", "thur", "thurs"],
        ["fri", "friday"], ["sat", "saturday"], ["sun", "sunday"],
    ], 1):
        for n in names:
            DAY_NAME_MAP[n] = i

    weeks_data = {}
    last_week = 1
    last_day = 1

    # Log the keys from the first row to help debug column mapping issues
    if rows:
        log_event("csv_to_program", "started", f"Converting {len(rows)} rows, columns: {list(rows[0].keys())}", {
            "first_row": rows[0],
            "last_row": rows[-1] if len(rows) > 1 else None,
        })

    for row_idx, row in enumerate(rows):
        # Try to parse Week — handle empty strings, missing keys, non-numeric values
        week_raw = (row.get("Week") or "").strip()
        day_raw = (row.get("Day") or "").strip()

        # Parse week number
        week = None
        try:
            week = int(float(week_raw)) if week_raw else None
        except (ValueError, TypeError):
            pass

        # Parse day — try number first, then day name
        day = None
        try:
            day = int(float(day_raw)) if day_raw else None
        except (ValueError, TypeError):
            pass
        if day is None and day_raw:
            day = DAY_NAME_MAP.get(day_raw.lower())

        # Fallback: if parsing failed, keep the last known week/day
        # (multiple exercises on the same day share the same Week/Day)
        if week is None:
            week = last_week
        if day is None:
            day = last_day

        # Track last known values
        last_week = week
        last_day = day

        order = row.get("Order", "").strip()
        if week not in weeks_data:
            weeks_data[week] = {}
        if day not in weeks_data[week]:
            weeks_data[week][day] = {"day": day, "isRest": False, "exercises": []}

        if order.upper() == "REST":
            weeks_data[week][day]["isRest"] = True
            weeks_data[week][day]["restNote"] = row.get("Instruction", "").strip()
            continue

        try:
            sets_val = int(float(row.get("Sets", "0") or "0"))
        except (ValueError, TypeError):
            sets_val = 0

        exercise = {
            "order": order,
            "name": row.get("Exercise", "").strip(),
            "sets": sets_val,
            "reps": row.get("Reps", "").strip(),
            "tempo": row.get("Tempo", "").strip(),
            "rest": row.get("Rest", "").strip(),
            "rpe": row.get("RPE", "").strip(),
            "instruction": row.get("Instruction", "").strip(),
        }
        weeks_data[week][day]["exercises"].append(exercise)

    log_event("csv_to_program", "info", f"Conversion done: {len(weeks_data)} weeks found from {len(rows)} rows", {
        "week_numbers": sorted(weeks_data.keys()) if weeks_data else [],
        "days_per_week": {str(w): len(d) for w, d in weeks_data.items()} if weeks_data else {},
    })

    # Build sorted structure with exercise groups
    result = {"name": program_name, "weeks": []}
    for week_num in sorted(weeks_data.keys()):
        week_obj = {"week": week_num, "days": []}
        for day_num in sorted(weeks_data[week_num].keys()):
            day_data = weeks_data[week_num][day_num]

            if not day_data["isRest"] and day_data.get("exercises"):
                groups = OrderedDict()
                for ex in day_data["exercises"]:
                    base = ""
                    for ch in ex["order"]:
                        if ch.isdigit():
                            base += ch
                        else:
                            break
                    if not base:
                        base = ex["order"]
                    groups.setdefault(base, []).append(ex)

                day_data["exerciseGroups"] = []
                for base, exercises in groups.items():
                    group_type = "single"
                    if len(exercises) == 2:
                        group_type = "superset"
                    elif len(exercises) >= 3:
                        group_type = "circuit"
                    day_data["exerciseGroups"].append(
                        {"type": group_type, "exercises": exercises}
                    )
                del day_data["exercises"]
            elif "exercises" in day_data:
                del day_data["exercises"]

            week_obj["days"].append(day_data)
        result["weeks"].append(week_obj)

    return result


# ── Claude API call ──────────────────────────────────────────────

def call_claude(prompt: str, model_key: str = "sonnet") -> tuple[Optional[str], dict]:
    """
    Call Claude API and return (response_text, cost_info).
    cost_info = {input_tokens, output_tokens, cost_usd, model}
    """
    import os
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        # Try .env file
        env_path = config.APP_DIR / ".env"
        if env_path.exists():
            for line in open(env_path):
                if line.startswith("ANTHROPIC_API_KEY="):
                    api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break

    if not api_key:
        raise ValueError("No ANTHROPIC_API_KEY found in environment or .env file")

    import anthropic
    model_info = MODELS.get(model_key, MODELS["sonnet"])
    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model=model_info["id"],
        max_tokens=16384,
        system=PROGRAM_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    input_tokens = message.usage.input_tokens
    output_tokens = message.usage.output_tokens
    cost = track_usage(input_tokens, output_tokens, model_key, f"AI Builder: {prompt[:80]}")
    response_text = message.content[0].text

    return response_text, {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost, 6),
        "model": model_key,
    }


# ── Main generate function ───────────────────────────────────────

def generate_program(
    types: list[str],
    type_config: dict,
    model: str,
    weeks: int,
    name: str,
    notes: str = "",
    days_per_week: int = 5,
    session_time: int = 60,
    experience: str = "intermediate",
    coach_philosophy: str = "",
    athlete_prompt: str = "",
    day_plan: dict = None,
    progression_style: str = "",
    day_plan_prompt: str = "",
) -> tuple[dict, dict]:
    """
    Generate a program via Claude.
    Returns (program_dict, cost_info).
    """
    prompt = build_prompt(
        types=types,
        type_config=type_config,
        weeks=weeks,
        name=name,
        notes=notes,
        days_per_week=days_per_week,
        session_time=session_time,
        experience=experience,
        coach_philosophy=coach_philosophy,
        athlete_prompt=athlete_prompt,
        day_plan=day_plan,
        progression_style=progression_style,
        day_plan_prompt=day_plan_prompt,
    )

    log_event("ai_generate", "started", f"Generating '{name}' ({weeks} weeks, model={model})", {
        "types": types, "model": model, "weeks": weeks, "name": name,
        "has_day_plan": bool(day_plan and any(v for v in day_plan.values() if v)),
        "progression_style": progression_style,
        "prompt_length": len(prompt),
    })

    max_attempts = 2
    last_error = None
    total_cost = {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "model": model}

    for attempt in range(1, max_attempts + 1):
        try:
            response_text, cost_info = call_claude(prompt, model)
        except Exception as e:
            log_event("ai_generate", "error", f"Claude API call failed (attempt {attempt}): {str(e)}", {"name": name, "model": model})
            last_error = e
            continue

        total_cost["input_tokens"] += cost_info.get("input_tokens", 0)
        total_cost["output_tokens"] += cost_info.get("output_tokens", 0)
        total_cost["cost_usd"] += cost_info.get("cost_usd", 0.0)

        log_event("ai_generate", "api_complete", f"Got response (attempt {attempt}, {cost_info.get('output_tokens', 0)} tokens)", {
            "name": name, "attempt": attempt, **cost_info,
            "response_preview": response_text[:500] if response_text else "EMPTY",
        })

        rows = parse_ai_csv(response_text)

        if not rows:
            log_event("ai_generate", "warning", f"CSV parse failed (attempt {attempt}), {'retrying' if attempt < max_attempts else 'giving up'}", {
                "name": name, "response_preview": response_text[:1000] if response_text else "EMPTY",
            })
            last_error = ValueError("Failed to parse AI response into valid CSV rows")
            continue

        program = csv_rows_to_program(rows, name)

        if not program.get("weeks"):
            log_event("ai_generate", "warning", f"Program has no weeks after conversion (attempt {attempt})", {
                "name": name, "rows_parsed": len(rows),
                "sample_rows": [rows[i] for i in range(min(3, len(rows)))],
            })
            last_error = ValueError("Program generated but has no weeks — CSV rows could not be converted to weeks")
            continue

        log_event("ai_generate", "success", f"Program '{name}' generated: {len(program.get('weeks', []))} weeks (attempt {attempt})", {
            "name": name, "attempt": attempt,
            "weeks_generated": len(program.get("weeks", [])),
            "total_days": sum(len(w.get("days", [])) for w in program.get("weeks", [])),
            **total_cost,
        })

        return program, total_cost

    # All attempts failed
    log_event("ai_generate", "error", f"All {max_attempts} attempts failed for '{name}'", {
        "name": name, "last_error": str(last_error),
    })
    raise last_error or ValueError("Program generation failed after all attempts")


# ── Program modification via natural language ───────────────────

MODIFY_SYSTEM_PROMPT = """You are an expert strength and conditioning coach.
You will receive a workout program as JSON and a modification request from a coach.
Apply the requested changes to the program and return the complete modified program as valid JSON.

RULES:
- Return ONLY the JSON. No markdown, no explanation, no code fences.
- Preserve the exact same structure: {name, weeks: [{week, days: [{day, isRest, exerciseGroups: [{type, exercises: [{order, name, sets, reps, tempo, rest, rpe, instruction}]}]}]}]}
- Keep all unmodified parts exactly the same.
- When modifying exercises, use realistic values for sets, reps, tempo, rest, and RPE.
- If asked to make something "harder", increase sets/reps/RPE. If "easier", decrease them.
- If asked to swap exercises, replace with appropriate alternatives."""


def _extract_json(text: str) -> str:
    """Extract JSON from a response that may contain markdown fences or extra text."""
    text = text.strip()
    # Strip ```json or ``` fences
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # If still not valid JSON, try to find the outermost { }
    if not text.startswith("{"):
        start = text.find("{")
        if start >= 0:
            # Find matching closing brace
            depth = 0
            for i, c in enumerate(text[start:], start):
                if c == "{": depth += 1
                elif c == "}": depth -= 1
                if depth == 0:
                    text = text[start:i+1]
                    break
    return text


def modify_program(program: dict, modification_prompt: str, model_key: str = "sonnet") -> tuple[dict, dict]:
    """
    Modify an existing program via Claude using natural language instructions.
    Returns (modified_program, cost_info).
    """
    log_event("ai_modify", "started", f"Modifying program: {modification_prompt[:100]}", {
        "prompt": modification_prompt, "model": model_key,
        "program_name": program.get("name", "unknown"),
        "weeks_count": len(program.get("weeks", [])),
    })

    import os
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        env_path = config.APP_DIR / ".env"
        if env_path.exists():
            for line in open(env_path):
                if line.startswith("ANTHROPIC_API_KEY="):
                    api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break

    if not api_key:
        log_event("ai_modify", "error", "No ANTHROPIC_API_KEY found")
        raise ValueError("No ANTHROPIC_API_KEY found in environment or .env file")

    import anthropic
    model_info = MODELS.get(model_key, MODELS["sonnet"])
    client = anthropic.Anthropic(api_key=api_key)

    user_prompt = f"""Here is the current workout program:

{json.dumps(program, indent=2)}

Coach's modification request: {modification_prompt}

Apply the changes and return the complete modified program as valid JSON."""

    try:
        message = client.messages.create(
            model=model_info["id"],
            max_tokens=16384,
            system=MODIFY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
    except Exception as e:
        log_event("ai_modify", "error", f"Claude API call failed: {str(e)}", {"model": model_key})
        raise

    input_tokens = message.usage.input_tokens
    output_tokens = message.usage.output_tokens
    cost = track_usage(input_tokens, output_tokens, model_key, f"Modify program: {modification_prompt[:80]}")

    response_text = message.content[0].text.strip()

    log_event("ai_modify", "api_complete", f"Got response ({output_tokens} tokens)", {
        "input_tokens": input_tokens, "output_tokens": output_tokens,
        "cost_usd": round(cost, 6), "model": model_key,
        "response_preview": response_text[:500],
    })

    # Extract and parse JSON
    json_text = _extract_json(response_text)
    try:
        modified = json.loads(json_text)
    except json.JSONDecodeError as e:
        log_event("ai_modify", "error", f"JSON parse failed: {str(e)}", {
            "json_error": str(e),
            "response_preview": response_text[:1000],
            "extracted_json_preview": json_text[:500],
        })
        raise

    log_event("ai_modify", "success", f"Program modified successfully", {
        "weeks_count": len(modified.get("weeks", [])),
        "input_tokens": input_tokens, "output_tokens": output_tokens,
        "cost_usd": round(cost, 6),
    })

    return modified, {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost, 6),
        "model": model_key,
    }
