"""AI Program Builder — Claude-powered workout program generation."""

import csv
import io
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from . import config

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
) -> str:
    """Build the user prompt for Claude based on selected program types and config."""
    type_labels = " + ".join(t.title() for t in types)
    is_combo = len(types) > 1

    prompt_parts = [f'Generate a {weeks}-week {type_labels} training program called "{name}".']
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


def parse_ai_csv(response_text: str) -> list[dict]:
    """Parse Claude's CSV response into a list of row dicts."""
    csv_text = response_text.strip()

    # Strip markdown code fences
    if csv_text.startswith("```"):
        lines = csv_text.split("\n")
        csv_text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    # Try standard CSV parse first
    try:
        reader = csv.DictReader(io.StringIO(csv_text))
        if reader.fieldnames and list(reader.fieldnames) == EXPECTED_COLS:
            return list(reader)
    except Exception:
        pass

    # Fallback: parse line by line, handling extra commas in Instruction
    lines = csv_text.strip().split("\n")
    rows = []
    for line in lines[1:]:  # skip header
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) >= 11:
            row = parts[:10] + [",".join(parts[10:])]
            cleaned = [v.strip().strip('"') for v in row]
            rows.append(dict(zip(EXPECTED_COLS, cleaned)))
        elif len(parts) == 11:
            cleaned = [v.strip().strip('"') for v in parts]
            rows.append(dict(zip(EXPECTED_COLS, cleaned)))

    return rows


def csv_rows_to_program(rows: list[dict], program_name: str) -> dict:
    """Convert parsed CSV rows into the program.json structure."""
    from collections import OrderedDict

    weeks_data = {}
    for row in rows:
        try:
            week = int(float(row.get("Week", "1")))
            day = int(float(row.get("Day", "1")))
        except (ValueError, TypeError):
            continue

        order = row.get("Order", "").strip()
        if week not in weeks_data:
            weeks_data[week] = {}
        if day not in weeks_data[week]:
            weeks_data[week][day] = {"day": day, "isRest": False, "exercises": []}

        if order.upper() == "REST":
            weeks_data[week][day]["isRest"] = True
            weeks_data[week][day]["restNote"] = row.get("Instruction", "").strip()
            continue

        exercise = {
            "order": order,
            "name": row.get("Exercise", "").strip(),
            "sets": int(float(row.get("Sets", "0") or "0")),
            "reps": row.get("Reps", "").strip(),
            "tempo": row.get("Tempo", "").strip(),
            "rest": row.get("Rest", "").strip(),
            "rpe": row.get("RPE", "").strip(),
            "instruction": row.get("Instruction", "").strip(),
        }
        weeks_data[week][day]["exercises"].append(exercise)

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
    )

    response_text, cost_info = call_claude(prompt, model)
    rows = parse_ai_csv(response_text)

    if not rows:
        raise ValueError("Failed to parse AI response into valid CSV rows")

    program = csv_rows_to_program(rows, name)
    return program, cost_info


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


def modify_program(program: dict, modification_prompt: str, model_key: str = "sonnet") -> tuple[dict, dict]:
    """
    Modify an existing program via Claude using natural language instructions.
    Returns (modified_program, cost_info).
    """
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
        raise ValueError("No ANTHROPIC_API_KEY found in environment or .env file")

    import anthropic
    model_info = MODELS.get(model_key, MODELS["sonnet"])
    client = anthropic.Anthropic(api_key=api_key)

    user_prompt = f"""Here is the current workout program:

{json.dumps(program, indent=2)}

Coach's modification request: {modification_prompt}

Apply the changes and return the complete modified program as valid JSON."""

    message = client.messages.create(
        model=model_info["id"],
        max_tokens=16384,
        system=MODIFY_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    input_tokens = message.usage.input_tokens
    output_tokens = message.usage.output_tokens
    cost = track_usage(input_tokens, output_tokens, model_key, f"Modify program: {modification_prompt[:80]}")

    response_text = message.content[0].text.strip()

    # Strip markdown fences if present
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    modified = json.loads(response_text)

    return modified, {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost, 6),
        "model": model_key,
    }
