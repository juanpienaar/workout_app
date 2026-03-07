"""
Workout App Admin Dashboard
Run with: streamlit run admin.py
"""

import streamlit as st
import pandas as pd
import json
import hashlib
import subprocess
import csv
import io
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime

# ==================== CONFIG ====================
APP_DIR = Path(__file__).parent
CSV_FILE = APP_DIR / "program.csv"
USERS_FILE = APP_DIR / "users.json"
EXERCISES_FILE = APP_DIR / "exercises.json"
PROGRAM_JSON = APP_DIR / "program.json"
APP_URL = "https://numnum.fit/"
COST_FILE = APP_DIR / "api_costs.json"
METRICS_FILE = APP_DIR / "user_metrics.json"

st.set_page_config(page_title="NumNum Workout Admin", page_icon="🔥", layout="wide")

# ==================== NUMNUM BRANDING ====================
NUMNUM_LOGO_PATH = APP_DIR / "numnum-logo.svg"

NUMNUM_CSS = """
<style>
    /* NumNum brand colors */
    :root {
        --nn-primary: #E8475F;
        --nn-primary-dark: #AD1457;
        --nn-accent: #FFC107;
        --nn-accent-dark: #FF8F00;
        --nn-warm: #FF7043;
    }
    /* Sidebar branding */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
    }
    [data-testid="stSidebar"] .stMarkdown p,
    [data-testid="stSidebar"] .stMarkdown h1,
    [data-testid="stSidebar"] .stMarkdown h2,
    [data-testid="stSidebar"] .stMarkdown h3,
    [data-testid="stSidebar"] label {
        color: #f0f0f0 !important;
    }
    /* Primary buttons */
    .stButton > button[kind="primary"] {
        background: linear-gradient(135deg, #FF7043, #E8475F, #AD1457) !important;
        border: none !important;
        color: white !important;
    }
    .stButton > button[kind="primary"]:hover {
        background: linear-gradient(135deg, #FF8A65, #EF5350, #C62828) !important;
    }
    /* Metric styling */
    [data-testid="stMetricValue"] {
        color: #E8475F !important;
    }
    /* Tab highlight */
    .stTabs [aria-selected="true"] {
        color: #E8475F !important;
        border-bottom-color: #E8475F !important;
    }
</style>
"""
st.markdown(NUMNUM_CSS, unsafe_allow_html=True)

# ==================== AI MODELS ====================
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


# ==================== DATA LAYER ====================
# Internal: CSV is the storage engine but never exposed to the user.

def _load_csv():
    if CSV_FILE.exists():
        return pd.read_csv(CSV_FILE)
    return pd.DataFrame(
        columns=["Program", "Week", "Day", "Order", "Exercise",
                 "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]
    )


def _save_csv(df):
    df.to_csv(CSV_FILE, index=False)
    st.session_state["needs_deploy"] = True


def load_program_data():
    """Load all program data."""
    return _load_csv()


def save_program_data(df):
    """Save all program data."""
    _save_csv(df)


def get_program_names():
    """Get list of all program names."""
    df = load_program_data()
    if "Program" in df.columns and len(df) > 0:
        return sorted(df["Program"].dropna().unique().tolist())
    return []


def _safe_numeric(val):
    """Try to convert a value to a number, return None if not possible."""
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def load_program(name):
    """Load a single program by name, dropping rows with invalid Week/Day."""
    df = load_program_data()
    if len(df) > 0:
        result = df[df["Program"] == name].copy()
        # Drop rows where Week or Day is NaN
        result = result.dropna(subset=["Week", "Day"])
        # Drop rows where Week or Day aren't valid numbers
        result = result[result["Week"].apply(_safe_numeric).notna()]
        result = result[result["Day"].apply(_safe_numeric).notna()]
        return result
    return pd.DataFrame()


def save_program(name, df):
    """Save a single program (replaces existing if same name)."""
    current = load_program_data()
    if len(current) > 0:
        current = current[current["Program"] != name]
        combined = pd.concat([current, df], ignore_index=True)
    else:
        combined = df
    save_program_data(combined)


def delete_program(name):
    """Delete a program by name."""
    current = load_program_data()
    if len(current) > 0:
        filtered = current[current["Program"] != name]
        save_program_data(filtered)


# ==================== HELPERS ====================
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def load_users():
    if USERS_FILE.exists():
        with open(USERS_FILE) as f:
            return json.load(f)
    return {}


def save_users(users):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)
    # Flag that user data has changed and needs deployment
    st.session_state["needs_deploy"] = True


def load_exercises():
    if EXERCISES_FILE.exists():
        with open(EXERCISES_FILE) as f:
            return json.load(f)
    return {}


def save_exercises(exercises):
    with open(EXERCISES_FILE, "w") as f:
        json.dump(exercises, f, indent=2)


def run_build():
    result = subprocess.run(
        ["python3", str(APP_DIR / "build.py"), str(CSV_FILE)],
        capture_output=True, text=True, cwd=str(APP_DIR),
    )
    return result


def git_push(message="Update workout program"):
    cmds = [
        ["git", "add", "program.json", "users.json", "index.html", "exercises.json"],
        ["git", "commit", "-m", message],
        ["git", "push"],
    ]
    outputs = []
    for cmd in cmds:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(APP_DIR))
        outputs.append(f"$ {' '.join(cmd)}\n{result.stdout}\n{result.stderr}")
    return "\n".join(outputs)


def render_deploy_banner():
    """Show a prominent deploy banner if changes are pending."""
    if st.session_state.get("needs_deploy"):
        st.markdown(
            """<div style="background:linear-gradient(135deg,#FF7043,#E8475F);padding:12px 20px;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
            <span style="color:white;font-weight:600;">⚠️ Changes have been made that need to be deployed to the workout app.</span>
            </div>""",
            unsafe_allow_html=True,
        )
        col1, col2 = st.columns([1, 4])
        with col1:
            if st.button("🚀 Deploy Now", type="primary", key="quick_deploy"):
                with st.spinner("Building & deploying..."):
                    build_result = run_build()
                    if build_result.returncode != 0:
                        st.error(f"Build failed: {build_result.stderr}")
                    else:
                        push_result = git_push("Update program & user data")
                        st.session_state["needs_deploy"] = False
                        st.success("Deployed successfully!")
                        st.rerun()
        with col2:
            st.caption("This will rebuild program.json and push to GitHub Pages.")


def get_all_exercise_names(exercises):
    names = []
    for body_part, categories in exercises.items():
        for category, ex_list in categories.items():
            for ex in ex_list:
                names.append(f"{ex['name']} ({ex['equipment']})")
    return sorted(set(names))


def get_builder_rows():
    if "builder_rows" not in st.session_state:
        st.session_state.builder_rows = []
    return st.session_state.builder_rows


def get_days_for_week(rows, week):
    """Get exercises grouped by day for a given week."""
    days = {}
    for r in rows:
        if r["Week"] == week:
            d = r["Day"]
            if d not in days:
                days[d] = []
            days[d].append(r)
    return days


DAY_LABELS = {1: "Day 1", 2: "Day 2", 3: "Day 3", 4: "Day 4", 5: "Day 5", 6: "Day 6", 7: "Day 7"}


# ==================== BODY METRICS ====================
def load_metrics():
    if METRICS_FILE.exists():
        with open(METRICS_FILE) as f:
            return json.load(f)
    return {}


def save_metrics(metrics):
    with open(METRICS_FILE, "w") as f:
        json.dump(metrics, f, indent=2)


METRIC_FIELDS = [
    ("weight_kg", "Weight (kg)"),
    ("chest_cm", "Chest (cm)"),
    ("waist_cm", "Waist (cm)"),
    ("hips_cm", "Hips (cm)"),
    ("bicep_cm", "Bicep (cm)"),
    ("thigh_cm", "Thigh (cm)"),
    ("calf_cm", "Calf (cm)"),
]


# ==================== MUSCLE DIAGRAM ====================
# Maps exercise library body parts → muscle regions used in SVG
MUSCLE_MAP = {
    "Chest":                      {"primary": ["chest"], "secondary": ["front_delts", "triceps"]},
    "Back":                       {"primary": ["upper_back", "lats"], "secondary": ["biceps", "rear_delts"]},
    "Shoulders":                  {"primary": ["front_delts", "side_delts", "rear_delts"], "secondary": ["traps"]},
    "Legs (Quads)":               {"primary": ["quads"], "secondary": ["glutes", "core"]},
    "Legs (Hamstrings & Glutes)": {"primary": ["hamstrings", "glutes"], "secondary": ["lower_back"]},
    "Calves":                     {"primary": ["calves"], "secondary": []},
    "Biceps":                     {"primary": ["biceps"], "secondary": ["forearms"]},
    "Triceps":                    {"primary": ["triceps"], "secondary": ["front_delts"]},
    "Core":                       {"primary": ["core", "obliques"], "secondary": ["lower_back"]},
}

ALL_MUSCLES = [
    "chest", "upper_back", "lats", "front_delts", "side_delts", "rear_delts",
    "traps", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes",
    "calves", "core", "obliques", "lower_back",
]


def get_exercise_body_part(exercise_name, exercises_data):
    """Look up which body part an exercise belongs to."""
    for body_part, categories in exercises_data.items():
        for cat, ex_list in categories.items():
            for ex in ex_list:
                if ex["name"] == exercise_name:
                    return body_part
    return None


def calculate_muscle_load(df, exercises_data, week=None, day=None):
    """Calculate load per muscle region from program data.
    Load = sets × (RPE/10) for primary muscles, half that for secondary."""
    loads = {m: 0.0 for m in ALL_MUSCLES}

    filtered = df.copy()
    if week is not None:
        filtered = filtered[filtered["Week"] == week]
    if day is not None:
        filtered = filtered[filtered["Day"] == day]

    # Skip rest days
    filtered = filtered[filtered["Order"].astype(str).str.upper() != "REST"]

    for _, row in filtered.iterrows():
        ex_name = str(row.get("Exercise", ""))
        body_part = get_exercise_body_part(ex_name, exercises_data)
        if not body_part or body_part not in MUSCLE_MAP:
            continue

        try:
            sets = float(row.get("Sets", 0))
        except (ValueError, TypeError):
            sets = 0
        try:
            rpe = float(row.get("RPE", 7))
        except (ValueError, TypeError):
            rpe = 7

        effort = sets * (rpe / 10.0)
        mapping = MUSCLE_MAP[body_part]
        for m in mapping["primary"]:
            loads[m] += effort
        for m in mapping["secondary"]:
            loads[m] += effort * 0.4

    return loads


def load_to_color(load, max_load):
    """Convert a load value to an RGB color. 0=grey, low=blue, high=red."""
    if max_load == 0 or load == 0:
        return "#2a2a3a"
    ratio = min(load / max_load, 1.0)
    if ratio < 0.5:
        # Blue to yellow
        t = ratio * 2
        r = int(40 + t * 215)
        g = int(80 + t * 140)
        b = int(220 - t * 180)
    else:
        # Yellow to red
        t = (ratio - 0.5) * 2
        r = int(255)
        g = int(220 - t * 200)
        b = int(40 - t * 40)
    return f"rgb({r},{g},{b})"


def render_body_svg(muscle_loads, title="", width=220):
    """Render a front+back body SVG with colored muscle regions."""
    max_load = max(muscle_loads.values()) if muscle_loads else 0

    def c(muscle):
        return load_to_color(muscle_loads.get(muscle, 0), max_load)

    # Simplified body diagram using basic shapes
    svg = f'''<div style="text-align:center;">
    {f'<div style="color:#aaa;font-size:12px;margin-bottom:4px;font-weight:600;">{title}</div>' if title else ''}
    <div style="display:flex;justify-content:center;gap:12px;">
    <!-- FRONT VIEW -->
    <div>
    <div style="color:#666;font-size:10px;margin-bottom:2px;">Front</div>
    <svg width="{width}" height="{int(width*2.2)}" viewBox="0 0 140 310">
    <!-- Head -->
    <ellipse cx="70" cy="22" rx="14" ry="17" fill="#333" stroke="#555" stroke-width="0.5"/>
    <!-- Neck/Traps -->
    <rect x="60" y="38" width="20" height="10" rx="3" fill="{c('traps')}"/>
    <!-- Front Delts -->
    <ellipse cx="40" cy="56" rx="12" ry="10" fill="{c('front_delts')}"/>
    <ellipse cx="100" cy="56" rx="12" ry="10" fill="{c('front_delts')}"/>
    <!-- Side Delts -->
    <ellipse cx="32" cy="52" rx="7" ry="9" fill="{c('side_delts')}"/>
    <ellipse cx="108" cy="52" rx="7" ry="9" fill="{c('side_delts')}"/>
    <!-- Chest -->
    <ellipse cx="55" cy="72" rx="18" ry="14" fill="{c('chest')}"/>
    <ellipse cx="85" cy="72" rx="18" ry="14" fill="{c('chest')}"/>
    <!-- Biceps -->
    <ellipse cx="28" cy="85" rx="7" ry="18" fill="{c('biceps')}"/>
    <ellipse cx="112" cy="85" rx="7" ry="18" fill="{c('biceps')}"/>
    <!-- Core -->
    <rect x="50" y="88" width="40" height="35" rx="5" fill="{c('core')}"/>
    <!-- Obliques -->
    <rect x="42" y="92" width="9" height="26" rx="3" fill="{c('obliques')}"/>
    <rect x="89" y="92" width="9" height="26" rx="3" fill="{c('obliques')}"/>
    <!-- Forearms -->
    <ellipse cx="22" cy="118" rx="5" ry="18" fill="{c('forearms')}"/>
    <ellipse cx="118" cy="118" rx="5" ry="18" fill="{c('forearms')}"/>
    <!-- Quads -->
    <ellipse cx="55" cy="165" rx="14" ry="35" fill="{c('quads')}"/>
    <ellipse cx="85" cy="165" rx="14" ry="35" fill="{c('quads')}"/>
    <!-- Calves (front) -->
    <ellipse cx="52" cy="235" rx="9" ry="28" fill="{c('calves')}"/>
    <ellipse cx="88" cy="235" rx="9" ry="28" fill="{c('calves')}"/>
    </svg>
    </div>
    <!-- BACK VIEW -->
    <div>
    <div style="color:#666;font-size:10px;margin-bottom:2px;">Back</div>
    <svg width="{width}" height="{int(width*2.2)}" viewBox="0 0 140 310">
    <!-- Head -->
    <ellipse cx="70" cy="22" rx="14" ry="17" fill="#333" stroke="#555" stroke-width="0.5"/>
    <!-- Traps -->
    <path d="M50,42 Q70,32 90,42 L85,55 Q70,48 55,55 Z" fill="{c('traps')}"/>
    <!-- Rear Delts -->
    <ellipse cx="38" cy="56" rx="10" ry="9" fill="{c('rear_delts')}"/>
    <ellipse cx="102" cy="56" rx="10" ry="9" fill="{c('rear_delts')}"/>
    <!-- Upper Back -->
    <rect x="48" y="58" width="44" height="22" rx="5" fill="{c('upper_back')}"/>
    <!-- Triceps -->
    <ellipse cx="30" cy="82" rx="7" ry="18" fill="{c('triceps')}"/>
    <ellipse cx="110" cy="82" rx="7" ry="18" fill="{c('triceps')}"/>
    <!-- Lats -->
    <path d="M48,78 L42,105 Q70,115 98,105 L92,78 Z" fill="{c('lats')}"/>
    <!-- Lower Back -->
    <rect x="55" y="105" width="30" height="20" rx="4" fill="{c('lower_back')}"/>
    <!-- Forearms -->
    <ellipse cx="22" cy="118" rx="5" ry="18" fill="{c('forearms')}"/>
    <ellipse cx="118" cy="118" rx="5" ry="18" fill="{c('forearms')}"/>
    <!-- Glutes -->
    <ellipse cx="55" cy="135" rx="16" ry="12" fill="{c('glutes')}"/>
    <ellipse cx="85" cy="135" rx="16" ry="12" fill="{c('glutes')}"/>
    <!-- Hamstrings -->
    <ellipse cx="55" cy="175" rx="13" ry="30" fill="{c('hamstrings')}"/>
    <ellipse cx="85" cy="175" rx="13" ry="30" fill="{c('hamstrings')}"/>
    <!-- Calves (back) -->
    <ellipse cx="52" cy="235" rx="9" ry="28" fill="{c('calves')}"/>
    <ellipse cx="88" cy="235" rx="9" ry="28" fill="{c('calves')}"/>
    </svg>
    </div>
    </div>'''

    # Legend: show muscles with load > 0
    active = {m: v for m, v in muscle_loads.items() if v > 0}
    if active:
        sorted_muscles = sorted(active.items(), key=lambda x: -x[1])
        legend_items = "".join(
            f'<span style="display:inline-block;margin:2px 6px;padding:2px 8px;border-radius:4px;'
            f'background:{load_to_color(v, max_load)};color:#fff;font-size:10px;">'
            f'{m.replace("_", " ").title()} ({v:.0f})</span>'
            for m, v in sorted_muscles
        )
        svg += f'<div style="margin-top:6px;">{legend_items}</div>'

    svg += '</div>'
    return svg


# ==================== AI FUNCTIONS ====================
def load_api_key():
    env_file = APP_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip()
    import os
    return os.environ.get("ANTHROPIC_API_KEY", "")


def load_costs():
    if COST_FILE.exists():
        with open(COST_FILE) as f:
            return json.load(f)
    return {"total_cost_usd": 0.0, "requests": []}


def save_costs(costs):
    with open(COST_FILE, "w") as f:
        json.dump(costs, f, indent=2)


def track_usage(input_tokens, output_tokens, model_key="sonnet", description=""):
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


def call_claude(prompt, system_prompt="", model_key=None):
    """Call Claude API with the selected model and track costs."""
    if model_key is None:
        model_key = st.session_state.get("selected_model", "sonnet")
    model_id = MODELS[model_key]["id"]
    api_key = load_api_key()
    if not api_key:
        return None, "No API key found. Add it to .env file."

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=model_id,
            max_tokens=16384,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
        )
        input_tokens = message.usage.input_tokens
        output_tokens = message.usage.output_tokens
        cost = track_usage(input_tokens, output_tokens, model_key, prompt[:80])
        response_text = message.content[0].text
        return response_text, f"Model: {model_key} | Tokens: {input_tokens:,} in / {output_tokens:,} out | Cost: ${cost:.4f}"
    except Exception as e:
        return None, f"API Error: {str(e)}"


def build_exercise_library_context(exercises):
    """Format exercise library for Claude context."""
    lines = ["Available exercises in the gym:"]
    for body_part, categories in exercises.items():
        lines.append(f"\n{body_part}:")
        for cat, ex_list in categories.items():
            names = [ex["name"] for ex in ex_list]
            lines.append(f"  {cat}: {', '.join(names)}")
    return "\n".join(lines)


def build_program_context(program_name):
    """Format a program's current structure for Claude context."""
    df = load_program(program_name)
    if len(df) == 0:
        return f"Program '{program_name}' is empty."

    lines = [f"Current program: {program_name}"]
    lines.append(f"Full CSV data:\nProgram,Week,Day,Order,Exercise,Sets,Reps,Tempo,Rest,RPE,Instruction")
    for _, row in df.iterrows():
        vals = [str(row.get(c, "")) for c in ["Program", "Week", "Day", "Order", "Exercise",
                                                "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]]
        lines.append(",".join(vals))
    return "\n".join(lines)


def parse_ai_csv(response_text):
    """Parse Claude's CSV response into a DataFrame."""
    csv_text = response_text.strip()
    # Strip markdown code fences
    if csv_text.startswith("```"):
        lines = csv_text.split("\n")
        csv_text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    EXPECTED_COLS = ["Program", "Week", "Day", "Order", "Exercise",
                     "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]

    # Try standard parse first
    try:
        df = pd.read_csv(io.StringIO(csv_text))
        if list(df.columns) == EXPECTED_COLS:
            return df
    except Exception:
        pass

    # Fallback: parse line by line, handling extra commas in the last field (Instruction)
    lines = csv_text.strip().split("\n")
    header = lines[0].strip()
    # Skip header line
    rows = []
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) >= 11:
            # First 10 fields, then join the rest as Instruction
            row = parts[:10] + [",".join(parts[10:])]
            rows.append([v.strip().strip('"') for v in row])
        elif len(parts) == 11:
            rows.append([v.strip().strip('"') for v in parts])

    df = pd.DataFrame(rows, columns=EXPECTED_COLS)
    return df


# ==================== SYSTEM PROMPTS ====================
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
- NEVER use commas inside any field value. Use semicolons or slashes instead (e.g., "rower/bike/jump rope" not "rower, bike, jump rope")
- Output ONLY the CSV data, no markdown, no explanation, no code fences

CROSSFIT-SPECIFIC FORMAT:
- For WODs: Exercise=WOD name (e.g. "Fran" or "MetCon"); Sets=1; Reps=1; Instruction=full WOD description
- For AMRAP/EMOM: Exercise=format name; Sets=1; Reps=time cap; Instruction=movement list with reps
- For strength: use normal format (Exercise/Sets/Reps/Tempo/Rest)
- Label sections via Order: W1/W2 for warmup; S1/S2 for strength; M1 for metcon

HYROX-SPECIFIC FORMAT:
- For running: Exercise=Running; Sets=number of intervals; Reps=distance; Instruction=pace/type details
- For station work: Exercise=station name (e.g. Sled Push / Ski Erg); specify distances and loads in Instruction
- For race sims: Exercise=Race Simulation; Sets=1; Reps=1; Instruction=full sim description"""

AMENDMENT_SYSTEM_PROMPT = """You are an expert strength and conditioning coach. You amend existing training programs based on specific requests.

CRITICAL RULES:
- Output valid CSV with header: Program,Week,Day,Order,Exercise,Sets,Reps,Tempo,Rest,RPE,Instruction
- Only modify what was explicitly requested — keep untouched sections exactly as they are
- For new exercises, prefer the provided exercise library
- Maintain program integrity (valid day/week numbers, proper order values)
- Use supersets (1a, 1b) and circuits (1a, 1b, 1c) when appropriate
- Tempo format: eccentric-pause-concentric-pause (e.g., 3-1-2-0)
- Rest in seconds (90s, 120s) or minutes (2min)
- RPE scale 1-10
- Output ONLY the complete updated CSV (with header), no markdown, no explanation, no code fences"""

DAY_SUGGEST_SYSTEM_PROMPT = """You are an expert strength and conditioning coach. You suggest exercises for specific training days.

RULES:
- Output valid CSV rows with columns: Program,Week,Day,Order,Exercise,Sets,Reps,Tempo,Rest,RPE,Instruction
- Use exercises from the provided exercise library when possible
- For supersets, use orders like 1a, 1b. For circuits, use 1a, 1b, 1c
- Tempo format: eccentric-pause-concentric-pause (e.g., 3-1-2-0)
- Rest in seconds with s suffix (e.g., 90s, 120s)
- RPE scale 1-10
- Instruction should be brief form cues
- Output ONLY the CSV rows (no header row), no markdown, no explanation, no code fences
- The user will provide Program name, Week, and Day numbers to use"""

PDF_IMPORT_SYSTEM_PROMPT = """You are an expert strength and conditioning coach. You convert workout program PDFs into structured CSV format.

You will receive raw text extracted from a PDF workout program. Your job is to parse it into the standard CSV format.

RULES:
- Output valid CSV with these exact columns: Program,Week,Day,Order,Exercise,Sets,Reps,Tempo,Rest,RPE,Instruction
- Parse the PDF structure carefully: identify weeks, days, exercises, sets, reps, tempo, rest periods
- CRITICAL: You MUST include ALL weeks from the PDF. If it says 8 weeks, output all 8 weeks. Do NOT stop early or truncate.
- For supersets (A1/A2 or paired exercises), use orders like 1a, 1b. For circuits/giant sets (B1/B2/B3), use 2a, 2b, 2c
- Map PDF ordering labels (A1, A2, B1, B2, C, D) to numeric orders (1a, 1b, 2a, 2b, 3, 4)
- Tempo format: eccentric-pause-concentric-pause (e.g., 3-0-1-1). Convert from PDF format if different (e.g., "3011" → "3-0-1-1")
- Rest in seconds with s suffix (e.g., 75s, 90s) or minutes (e.g., 2min)
- RPE scale 1-10. If not specified in the PDF, estimate based on rep ranges and context (lower reps = higher RPE)
- Warmup exercises should be included with Order starting from W1, W2, etc. or as separate entries with "Warmup" in Instruction
- Conditioning/finisher sections (e.g., "For Time", "EMOM") should be included as single entries with full description in Instruction
- DAY MAPPING: Map days to a 7-day week where Day 1=Monday through Day 7=Sunday. Rest days should typically be Day 6 (Saturday) and Day 7 (Sunday) unless the PDF specifies otherwise. If the PDF has 5 training days, they should be Days 1-5 with Days 6-7 as rest.
- Rest days: Order=REST, Exercise=Rest Day, Sets=0, Reps=0
- Every week MUST have exactly 7 days (training + rest = 7)
- Instruction column: include any form cues, notes, or special instructions from the PDF. Keep instructions concise.
- LANGUAGE: The PDF may be in ANY language (Spanish, French, Portuguese, German, etc.). You MUST detect the language and translate ALL exercise names, instructions, and notes into English. The final CSV must be entirely in English.
- NEVER use commas inside any field value. Use semicolons or slashes instead (e.g., "rower/bike/jump rope" not "rower, bike, jump rope")
- Be concise in Instruction fields to save space — use short form cues not full sentences
- Output ONLY the CSV data, no markdown, no explanation, no code fences"""


# ==================== WEEK VISUAL ====================
def render_week_visual(rows, week, allow_edit=True):
    """Render a 7-day week visual with exercise blocks."""
    days = get_days_for_week(rows, week)
    cols = st.columns(7)

    for day_num in range(1, 8):
        with cols[day_num - 1]:
            day_exercises = days.get(day_num, [])
            is_rest = any(r["Order"] == "REST" for r in day_exercises)
            has_content = len(day_exercises) > 0
            ex_count = len([r for r in day_exercises if r["Order"] != "REST"])

            if is_rest:
                st.markdown(f"**{DAY_LABELS[day_num]}**")
                st.markdown(
                    '<div style="background:#1a2e1a;border:1px solid #2a4a2a;border-radius:8px;'
                    'padding:10px;text-align:center;min-height:120px;">'
                    '<span style="font-size:24px;">🧘</span><br>'
                    '<span style="color:#4ade80;font-size:13px;font-weight:600;">REST</span>'
                    '</div>',
                    unsafe_allow_html=True,
                )
            elif has_content:
                st.markdown(f"**{DAY_LABELS[day_num]}**")
                ex_html = ""
                for r in day_exercises:
                    ex_html += (
                        f'<div style="background:#1a1a2e;border-radius:4px;padding:4px 6px;'
                        f'margin-bottom:3px;font-size:11px;">'
                        f'<b>{r["Exercise"]}</b><br>'
                        f'<span style="color:#888;">{r["Sets"]}×{r["Reps"]}</span>'
                        f'</div>'
                    )
                st.markdown(
                    f'<div style="background:#16213e;border:1px solid #2a2a4a;border-radius:8px;'
                    f'padding:8px;min-height:120px;">'
                    f'<span style="color:#60a5fa;font-size:11px;font-weight:600;">'
                    f'{ex_count} exercises</span><br>'
                    f'{ex_html}'
                    f'</div>',
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(f"**{DAY_LABELS[day_num]}**")
                st.markdown(
                    '<div style="background:#111;border:1px dashed #333;border-radius:8px;'
                    'padding:10px;text-align:center;min-height:120px;color:#555;font-size:12px;">'
                    'Empty'
                    '</div>',
                    unsafe_allow_html=True,
                )

            if allow_edit and has_content:
                if st.button(f"Edit", key=f"edit_w{week}_d{day_num}", use_container_width=True):
                    st.session_state.edit_day = {"week": week, "day": day_num}
                    st.rerun()


# ==================== SIDEBAR ====================
# NumNum logo — use base64-encoded SVG for reliable rendering
import base64
if NUMNUM_LOGO_PATH.exists():
    logo_b64 = base64.b64encode(NUMNUM_LOGO_PATH.read_bytes()).decode()
    st.sidebar.markdown(
        f'<div style="text-align:center;padding:10px 0;"><img src="data:image/svg+xml;base64,{logo_b64}" width="120" alt="NumNum"></div>',
        unsafe_allow_html=True,
    )
st.sidebar.markdown('<h2 style="text-align:center;margin:0;padding:0 0 5px 0;color:#E8475F;">NumNum Workout</h2>', unsafe_allow_html=True)
st.sidebar.caption('<p style="text-align:center;">Admin Dashboard</p>', unsafe_allow_html=True)

# Model selector in sidebar
if "selected_model" not in st.session_state:
    st.session_state.selected_model = "sonnet"

model_options = {v["label"]: k for k, v in MODELS.items()}
selected_label = st.sidebar.selectbox(
    "AI Model",
    list(model_options.keys()),
    index=list(model_options.values()).index(st.session_state.selected_model),
)
st.session_state.selected_model = model_options[selected_label]
model_info = MODELS[st.session_state.selected_model]
st.sidebar.caption(f"${model_info['input_per_m']}/M in · ${model_info['output_per_m']}/M out")

st.sidebar.divider()

page = st.sidebar.radio(
    "Navigate",
    ["🤖 Program Builder", "📋 Programs", "👥 Users", "🏋️ Exercises", "📥 Import CSV", "📊 Coach Dashboard", "🚀 Deploy", "⚙️ Settings"],
)

st.sidebar.divider()

# Persistent program name
if "active_program_name" not in st.session_state:
    st.session_state.active_program_name = ""

st.sidebar.subheader("Active Program")
st.session_state.active_program_name = st.sidebar.text_input(
    "Program Name",
    value=st.session_state.active_program_name,
    placeholder="e.g., Hypertrophy A",
    key="sidebar_prog_name",
)
active_prog = st.session_state.active_program_name

st.sidebar.divider()
st.sidebar.caption(f"App: [{APP_URL}]({APP_URL})")
st.sidebar.markdown('<p style="text-align:center;font-size:11px;color:#666;margin-top:20px;">Powered by NumNum V5</p>', unsafe_allow_html=True)


# ==================== PAGE: PROGRAM BUILDER (AI-first) ====================
if page == "🤖 Program Builder":
    st.title("🤖 Program Builder")

    exercises_data = load_exercises()
    exercise_context = build_exercise_library_context(exercises_data) if exercises_data else ""

    api_key = load_api_key()
    if not api_key:
        st.error("No API key found. Create a `.env` file with `ANTHROPIC_API_KEY=sk-ant-...`")
    else:
        st.success(f"API connected · Model: **{MODELS[st.session_state.selected_model]['label']}**")

        tab1, tab2, tab3, tab_pdf, tab4 = st.tabs([
            "📝 Generate Program",
            "✏️ Amend Program",
            "👤 User Variant",
            "📄 Import from PDF",
            "💰 Cost Tracker",
        ])

        # ==================== TAB 1: GENERATE FULL PROGRAM ====================
        with tab1:
            st.subheader("Generate a New Program")
            st.caption("Describe the program and the AI will build it for you.")

            prog_name_ai = st.text_input("Program Name", value=active_prog or "", key="ai_prog_name")

            program_type = st.selectbox("Program Type", [
                "Strength / Bodybuilding",
                "CrossFit",
                "Hyrox",
            ], key="program_type_sel")

            if program_type == "Strength / Bodybuilding":
                col1, col2 = st.columns(2)
                with col1:
                    experience = st.selectbox("Experience Level", ["Beginner", "Intermediate", "Advanced"])
                    goal = st.selectbox("Primary Goal", [
                        "Hypertrophy", "Strength", "Power", "General Fitness",
                        "Fat Loss", "Athletic Performance",
                    ])
                    days_per_week = st.selectbox("Training Days per Week", [3, 4, 5, 6], index=2)
                with col2:
                    num_weeks = st.number_input("Number of Weeks", min_value=1, max_value=16, value=4)
                    split_type = st.selectbox("Split Type", [
                        "Push/Pull/Legs", "Upper/Lower", "Full Body",
                        "Bro Split", "Push/Pull/Legs/Upper/Lower", "Let AI decide",
                    ])
                    equipment = st.multiselect(
                        "Available Equipment",
                        ["Barbell", "Dumbbell", "Cable", "Machine", "Smith Machine", "Bodyweight", "EZ Bar"],
                        default=["Barbell", "Dumbbell", "Cable", "Machine"],
                    )

                extra_notes = st.text_area(
                    "Additional instructions",
                    placeholder="e.g., Focus on weak hamstrings, include face pulls every session, no deadlifts due to injury...",
                    height=80,
                )

            elif program_type == "CrossFit":
                col1, col2 = st.columns(2)
                with col1:
                    experience = st.selectbox("Experience Level", ["Beginner (Scaled)", "Intermediate (RX)", "Advanced (RX+)"])
                    num_weeks = st.number_input("Number of Weeks", min_value=1, max_value=16, value=4)
                    days_per_week = st.selectbox("Training Days per Week", [3, 4, 5, 6], index=2)
                with col2:
                    cf_focus = st.multiselect(
                        "CrossFit Focus Areas",
                        ["Benchmark Girls WODs", "Hero WODs", "Olympic Lifting", "Gymnastics",
                         "Metabolic Conditioning", "Strength Cycles", "Skill Work"],
                        default=["Benchmark Girls WODs", "Metabolic Conditioning", "Strength Cycles"],
                    )
                    cf_equipment = st.multiselect(
                        "Available Equipment",
                        ["Barbell", "Pull-up Bar", "Rings", "Rower", "Assault Bike", "Ski Erg",
                         "Jump Rope", "Kettlebell", "Wall Ball", "GHD", "Box", "Dumbbell", "Rope"],
                        default=["Barbell", "Pull-up Bar", "Rower", "Jump Rope", "Kettlebell", "Wall Ball", "Box", "Dumbbell"],
                    )

                st.markdown("**Benchmark WOD Reference** (auto-included in AI prompt)")
                with st.expander("CrossFit Benchmark WODs"):
                    st.markdown("""
**The Girls (Original):**
- **Fran:** 21-15-9 Thrusters (95/65lb) & Pull-ups
- **Diane:** 21-15-9 Deadlifts (225/155lb) & HSPU
- **Grace:** 30 Clean & Jerks (135/95lb) for time
- **Helen:** 3 RFT: 400m Run / 21 KB Swings (53/35lb) / 12 Pull-ups
- **Elizabeth:** 21-15-9 Cleans (135/95lb) & Ring Dips
- **Isabel:** 30 Snatches (135/95lb) for time
- **Angie:** 100 Pull-ups / 100 Push-ups / 100 Sit-ups / 100 Squats
- **Barbara:** 5 RFT: 20 Pull-ups / 30 Push-ups / 40 Sit-ups / 50 Squats (3 min rest)
- **Chelsea:** EMOM 30: 5 Pull-ups / 10 Push-ups / 15 Squats
- **Jackie:** 1000m Row / 50 Thrusters (45/35lb) / 30 Pull-ups
- **Karen:** 150 Wall Balls (20/14lb)
- **Linda:** 10-9-8-7-6-5-4-3-2-1 Deadlift (1.5x BW) / Bench (BW) / Clean (0.75x BW)
- **Mary:** AMRAP 20: 5 HSPU / 10 Pistols / 15 Pull-ups
- **Nancy:** 5 RFT: 400m Run / 15 OHS (95/65lb)
- **Annie:** 50-40-30-20-10 Double-unders & Sit-ups
- **Eva:** 5 RFT: 800m Run / 30 KB Swings (70/53lb) / 30 Pull-ups
- **Kelly:** 5 RFT: 400m Run / 30 Box Jumps (24/20") / 30 Wall Balls (20/14lb)
- **Amanda:** 9-7-5 Muscle-ups & Snatches (135/95lb)
- **Cindy:** AMRAP 20: 5 Pull-ups / 10 Push-ups / 15 Squats

**Hero WODs:**
- **Murph:** 1 Mile Run / 100 Pull-ups / 200 Push-ups / 300 Squats / 1 Mile Run (20/14lb vest)
- **DT:** 5 RFT: 12 Deadlifts / 9 Hang Power Cleans / 6 Push Jerks (155/105lb)
- **The Seven:** 7 RFT: 7 HSPU / 7 Thrusters (135/95lb) / 7 Knees-to-elbows / 7 Deadlifts (245/165lb) / 7 Burpees / 7 KB Swings (70/53lb) / 7 Pull-ups
- **Nate:** AMRAP 20: 2 Muscle-ups / 4 HSPU / 8 KB Swings (70/53lb)
- **Chad:** 1000 Box Step-ups (20" box / 45/25lb vest)
""")

                extra_notes = st.text_area(
                    "Additional instructions",
                    placeholder="e.g., Include Fran and Grace in week 1, focus on Olympic lifting technique, scale pull-ups to banded...",
                    height=80,
                    key="cf_notes",
                )

            elif program_type == "Hyrox":
                col1, col2 = st.columns(2)
                with col1:
                    experience = st.selectbox("Experience Level", ["Beginner", "Intermediate", "Competitive"])
                    num_weeks = st.number_input("Number of Weeks", min_value=1, max_value=16, value=8)
                    days_per_week = st.selectbox("Training Days per Week", [3, 4, 5, 6], index=2)
                with col2:
                    hyrox_phase = st.selectbox("Training Phase", [
                        "Base Building (aerobic foundation)",
                        "Station Strength (station-specific work)",
                        "Race Simulation (full practice)",
                        "Full Prep (combined program)",
                    ])
                    hyrox_category = st.selectbox("Race Category", [
                        "Singles Open", "Singles Pro", "Doubles", "Relay",
                    ])

                st.markdown("**Hyrox Race Stations** (auto-included in AI prompt)")
                with st.expander("Hyrox Race Format"):
                    st.markdown("""
**Race structure:** 8 × (1km Run + Functional Station)

**The 8 Stations (in order):**
1. **Ski Erg** — 1000m
2. **Sled Push** — 50m (152/102kg men/women)
3. **Sled Pull** — 50m (103/78kg men/women)
4. **Burpee Broad Jumps** — 80m
5. **Rowing** — 1000m
6. **Farmers Carry** — 200m (2×24/16kg)
7. **Sandbag Lunges** — 100m (20/10kg)
8. **Wall Balls** — 75/100 reps (6/4kg to 3m/2.7m target)

**Key training elements:** Running endurance, sled conditioning, grip strength, lunging endurance, wall ball capacity, transitions.
""")

                extra_notes = st.text_area(
                    "Additional instructions",
                    placeholder="e.g., Weak on sled push, need to improve 1km run pace, focus on wall ball endurance...",
                    height=80,
                    key="hyrox_notes",
                )

            if st.button("🤖 Generate Program", type="primary", use_container_width=True):
                if program_type == "Strength / Bodybuilding":
                    prompt = f"""Generate a {num_weeks}-week training program called "{prog_name_ai}".

Details:
- Experience: {experience}
- Goal: {goal}
- Training days per week: {days_per_week} (scatter {7 - days_per_week} rest days across the 7-day week)
- Split: {split_type}
- Available equipment: {', '.join(equipment)}
- Total days per week: 7 (training + rest = 7)
{f'- Additional notes: {extra_notes}' if extra_notes else ''}

{exercise_context}

Generate the complete CSV with all {num_weeks} weeks. Include the header row.
Each week should have exactly 7 days ({days_per_week} training + {7 - days_per_week} rest).
Use exercises from the library above when possible."""

                elif program_type == "CrossFit":
                    cf_wods_context = """
CROSSFIT BENCHMARK WODS REFERENCE:
Girls: Fran (21-15-9 Thrusters 95lb & Pull-ups), Diane (21-15-9 DL 225lb & HSPU), Grace (30 C&J 135lb),
Helen (3 RFT: 400m/21 KB Swings 53lb/12 Pull-ups), Elizabeth (21-15-9 Cleans 135lb & Ring Dips),
Isabel (30 Snatches 135lb), Angie (100 PU/100 Push-ups/100 Sit-ups/100 Squats),
Barbara (5 RFT: 20 PU/30 Push-ups/40 Sit-ups/50 Squats), Chelsea (EMOM 30: 5 PU/10 Push-ups/15 Squats),
Jackie (1000m Row/50 Thrusters 45lb/30 PU), Karen (150 Wall Balls 20lb),
Linda (10-1 DL 1.5xBW/Bench BW/Clean 0.75xBW), Mary (AMRAP 20: 5 HSPU/10 Pistols/15 PU),
Nancy (5 RFT: 400m/15 OHS 95lb), Annie (50-40-30-20-10 DU & Sit-ups),
Cindy (AMRAP 20: 5 PU/10 Push-ups/15 Squats), Kelly (5 RFT: 400m/30 BJ 24"/30 WB 20lb),
Amanda (9-7-5 MU & Snatches 135lb), Eva (5 RFT: 800m/30 KBS 70lb/30 PU)

Hero WODs: Murph (1mi/100 PU/200 Push-ups/300 Squats/1mi w/vest),
DT (5 RFT: 12 DL/9 HPC/6 PJ 155lb), Nate (AMRAP 20: 2 MU/4 HSPU/8 KBS 70lb)
"""
                    prompt = f"""Generate a {num_weeks}-week CrossFit training program called "{prog_name_ai}".

Details:
- Experience: {experience}
- Training days per week: {days_per_week} (scatter {7 - days_per_week} rest days across the 7-day week)
- Focus areas: {', '.join(cf_focus)}
- Available equipment: {', '.join(cf_equipment)}
- Total days per week: 7 (training + rest = 7)
{f'- Additional notes: {extra_notes}' if extra_notes else ''}

{cf_wods_context}

{exercise_context}

CROSSFIT PROGRAMMING GUIDELINES:
- Each training day should have: a Warm-up section (mobility/activation); a Strength or Skill component; a WOD/MetCon
- Include benchmark WODs (Girls/Heroes) periodically for testing
- Use proper CrossFit rep schemes: AMRAP; EMOM; For Time; Tabata; RFT (rounds for time)
- For WODs: put the full WOD description in the Instruction field
- Vary time domains: short (<7min); medium (7-15min); long (15min+)
- Include skill progressions for gymnastics movements
- Scale appropriately for the experience level

Generate the complete CSV with all {num_weeks} weeks. Include the header row.
Each week should have exactly 7 days ({days_per_week} training + {7 - days_per_week} rest)."""

                elif program_type == "Hyrox":
                    prompt = f"""Generate a {num_weeks}-week Hyrox training program called "{prog_name_ai}".

Details:
- Experience: {experience}
- Training days per week: {days_per_week} (scatter {7 - days_per_week} rest days across the 7-day week)
- Training Phase: {hyrox_phase}
- Race Category: {hyrox_category}
- Total days per week: 7 (training + rest = 7)
{f'- Additional notes: {extra_notes}' if extra_notes else ''}

{exercise_context}

HYROX RACE FORMAT:
8 stations each preceded by a 1km run (8km total running):
1. Ski Erg 1000m
2. Sled Push 50m (152/102kg)
3. Sled Pull 50m (103/78kg)
4. Burpee Broad Jumps 80m
5. Rowing 1000m
6. Farmers Carry 200m (2×24/16kg)
7. Sandbag Lunges 100m (20/10kg)
8. Wall Balls 75/100 reps (6/4kg)

HYROX PROGRAMMING GUIDELINES:
- Include running sessions (intervals; tempo; long runs) as primary conditioning
- Program station-specific training: sled work; ski erg; rowing; wall balls; lunges; carries
- Include strength work to support race demands: squats; deadlifts; pressing; grip work
- Program transition practice (moving between stations under fatigue)
- Include race simulation sessions combining multiple stations with running
- Progress from base building → station strength → race-specific → taper
- For running exercises: use Instruction field for pace/interval details
- For station exercises: specify machine settings; distances; weights in Instruction

Generate the complete CSV with all {num_weeks} weeks. Include the header row.
Each week should have exactly 7 days ({days_per_week} training + {7 - days_per_week} rest)."""

                with st.spinner("Building your program... (this may take 15-30 seconds)"):
                    response, usage_info = call_claude(prompt, PROGRAM_SYSTEM_PROMPT)

                if response:
                    try:
                        df_ai = parse_ai_csv(response)
                        # Store in session state so it persists across reruns
                        st.session_state["generated_program"] = df_ai.to_dict("records")
                        st.session_state["generated_program_name"] = prog_name_ai
                        st.session_state["generated_usage_info"] = usage_info
                        st.rerun()
                    except Exception as e:
                        st.warning(f"Could not parse response: {e}")
                        st.text("Raw AI response:")
                        st.code(response)
                else:
                    st.error(usage_info)

            # Show generated program (persists across reruns)
            if "generated_program" in st.session_state and st.session_state["generated_program"]:
                df_ai = pd.DataFrame(st.session_state["generated_program"])
                gen_name = st.session_state.get("generated_program_name", prog_name_ai)
                gen_usage = st.session_state.get("generated_usage_info", "")

                st.divider()
                st.subheader(f"Generated: {gen_name}")
                if gen_usage:
                    st.caption(gen_usage)
                st.success(f"{len(df_ai)} exercises across {df_ai['Week'].nunique()} weeks")
                st.dataframe(df_ai, use_container_width=True)

                col1, col2, col3, col4 = st.columns(4)
                with col1:
                    if st.button("💾 Save to Program Library", key="ai_save_prog", type="primary"):
                        save_program(gen_name, df_ai)
                        st.session_state.active_program_name = gen_name
                        # Clear the generated data
                        del st.session_state["generated_program"]
                        st.success(f"Saved **{gen_name}**! View it on the 📋 Programs page.")
                        st.rerun()
                with col2:
                    if st.button("💾 Save & Assign", key="ai_save_assign"):
                        save_program(gen_name, df_ai)
                        st.session_state.active_program_name = gen_name
                        del st.session_state["generated_program"]
                        st.success(f"Saved! Switch to 👥 Users to assign.")
                        st.rerun()
                with col3:
                    if st.button("📥 Load into Editor", key="ai_load_builder"):
                        rows = get_builder_rows()
                        st.session_state.builder_rows = [
                            r for r in rows if r.get("Program") != gen_name
                        ]
                        for _, row in df_ai.iterrows():
                            st.session_state.builder_rows.append(row.to_dict())
                        st.session_state.active_program_name = gen_name
                        del st.session_state["generated_program"]
                        st.success("Loaded into editor!")
                        st.rerun()
                with col4:
                    if st.button("🗑️ Discard", key="ai_discard"):
                        del st.session_state["generated_program"]
                        st.rerun()

        # ==================== TAB 2: AMEND EXISTING PROGRAM ====================
        with tab2:
            st.subheader("Amend an Existing Program")
            st.caption("Select a program and describe what you want to change. The AI will update it.")

            programs = get_program_names()
            if not programs:
                st.info("No programs saved yet. Generate one first.")
            else:
                amend_prog = st.selectbox("Select program to amend", programs, key="amend_prog_sel")

                # Show current program preview
                with st.expander("View current program", expanded=False):
                    df_current = load_program(amend_prog)
                    if len(df_current) > 0:
                        for week in sorted(df_current["Week"].unique()):
                            week_df = df_current[df_current["Week"] == week]
                            st.markdown(f"**Week {int(float(week))}**")
                            for day in sorted(week_df["Day"].unique()):
                                day_df = week_df[week_df["Day"] == day]
                                is_rest = any(day_df["Order"].astype(str).str.upper() == "REST")
                                if is_rest:
                                    st.markdown(f"  Day {int(float(day))}: 🧘 Rest")
                                else:
                                    exs = day_df["Exercise"].tolist()
                                    st.markdown(f"  Day {int(float(day))}: {', '.join(exs)}")

                amendment = st.text_area(
                    "What would you like to change?",
                    placeholder="e.g., Replace chest exercises on Day 1 with dumbbell variations\n"
                                "Make Week 3 harder by increasing RPE by 1\n"
                                "Add face pulls to every upper body day\n"
                                "Swap Day 2 and Day 4",
                    height=100,
                    key="amendment_text",
                )

                if st.button("✏️ Apply Amendment", type="primary", use_container_width=True):
                    if not amendment:
                        st.error("Describe what you want to change.")
                    else:
                        program_context = build_program_context(amend_prog)
                        prompt = f"""Amend this training program based on the request below.

{program_context}

AMENDMENT REQUEST: {amendment}

Available exercises:
{exercise_context}

Output the COMPLETE updated program as CSV with header row. Keep everything not explicitly changed exactly as-is."""

                        with st.spinner("Applying amendment..."):
                            response, usage_info = call_claude(prompt, AMENDMENT_SYSTEM_PROMPT)

                        if response:
                            try:
                                df_amended = parse_ai_csv(response)
                                st.session_state["amended_program"] = df_amended.to_dict("records")
                                st.session_state["amended_program_name"] = amend_prog
                                st.session_state["amended_usage_info"] = usage_info
                                st.rerun()
                            except Exception as e:
                                st.warning(f"Could not parse: {e}")
                                st.code(response)
                        else:
                            st.error(usage_info)

                # Show amended result (persists across reruns)
                if "amended_program" in st.session_state and st.session_state["amended_program"]:
                    df_amended = pd.DataFrame(st.session_state["amended_program"])
                    amend_name = st.session_state.get("amended_program_name", amend_prog)
                    amend_usage = st.session_state.get("amended_usage_info", "")

                    st.divider()
                    st.subheader(f"Amended: {amend_name}")
                    if amend_usage:
                        st.caption(amend_usage)

                    # Side by side
                    df_original = load_program(amend_name)
                    col1, col2 = st.columns(2)
                    with col1:
                        st.markdown("**Before**")
                        st.caption(f"{len(df_original)} rows")
                        st.dataframe(df_original[["Week", "Day", "Exercise", "Sets", "Reps", "RPE"]].head(20), use_container_width=True)
                    with col2:
                        st.markdown("**After**")
                        st.caption(f"{len(df_amended)} rows")
                        st.dataframe(df_amended[["Week", "Day", "Exercise", "Sets", "Reps", "RPE"]].head(20), use_container_width=True)

                    bcol1, bcol2, bcol3 = st.columns(3)
                    with bcol1:
                        if st.button("✅ Save Updated Program", key="amend_save", type="primary"):
                            save_program(amend_name, df_amended)
                            del st.session_state["amended_program"]
                            st.success(f"Saved updated {amend_name}!")
                            st.rerun()
                    with bcol2:
                        if st.button("🔄 Save as New Program", key="amend_save_new"):
                            new_name = f"{amend_name} v2"
                            df_amended["Program"] = new_name
                            save_program(new_name, df_amended)
                            del st.session_state["amended_program"]
                            st.success(f"Saved as '{new_name}'!")
                            st.rerun()
                    with bcol3:
                        if st.button("🗑️ Discard", key="amend_discard"):
                            del st.session_state["amended_program"]
                            st.rerun()

        # ==================== TAB 3: USER VARIANT ====================
        with tab3:
            st.subheader("Create a User-Specific Variant")
            st.caption("Modify a user's program with natural language. Creates a personal variant.")

            users = load_users()
            if not users:
                st.info("No users yet. Add users on the Users page first.")
            else:
                user_options = {
                    f"{name} — {info.get('program', 'No program')}": name
                    for name, info in users.items()
                }
                selected_user_label = st.selectbox("Select user", list(user_options.keys()), key="variant_user")
                selected_user = user_options[selected_user_label]
                user_info = users[selected_user]
                current_program = user_info.get("program", "")

                if not current_program:
                    st.warning(f"{selected_user} has no program assigned.")
                else:
                    st.markdown(f"Current program: **{current_program}**")

                    # Show current program preview
                    with st.expander("View current program", expanded=False):
                        df_user_prog = load_program(current_program)
                        if len(df_user_prog) > 0:
                            for week in sorted(df_user_prog["Week"].unique()):
                                week_df = df_user_prog[df_user_prog["Week"] == week]
                                st.markdown(f"**Week {int(float(week))}**")
                                for day in sorted(week_df["Day"].unique()):
                                    day_df = week_df[week_df["Day"] == day]
                                    is_rest = any(day_df["Order"].astype(str).str.upper() == "REST")
                                    if is_rest:
                                        st.markdown(f"  Day {int(float(day))}: 🧘 Rest")
                                    else:
                                        exs = day_df["Exercise"].tolist()
                                        st.markdown(f"  Day {int(float(day))}: {', '.join(exs)}")

                    variant_request = st.text_area(
                        f"What should we change for {selected_user}?",
                        placeholder=f"e.g., Change Day 3 to a pull day\n"
                                    f"Remove all barbell exercises (shoulder injury)\n"
                                    f"Add more core work on rest days",
                        height=100,
                        key="variant_text",
                    )

                    if st.button(f"🤖 Create Variant for {selected_user}", type="primary", use_container_width=True):
                        if not variant_request:
                            st.error("Describe what to change.")
                        else:
                            program_context = build_program_context(current_program)
                            prompt = f"""Amend this training program for {selected_user}.

{program_context}

CHANGE REQUEST: {variant_request}

Available exercises:
{exercise_context}

Output the COMPLETE updated program as CSV with header row.
IMPORTANT: Keep the Program column as "{current_program}" — the system will rename it."""

                            with st.spinner(f"Building variant for {selected_user}..."):
                                response, usage_info = call_claude(prompt, AMENDMENT_SYSTEM_PROMPT)

                            if response:
                                try:
                                    df_variant = parse_ai_csv(response)
                                    variant_name = f"{current_program} ({selected_user})"
                                    df_variant["Program"] = variant_name
                                    st.session_state["variant_program"] = df_variant.to_dict("records")
                                    st.session_state["variant_name"] = variant_name
                                    st.session_state["variant_user"] = selected_user
                                    st.session_state["variant_usage_info"] = usage_info
                                    st.rerun()
                                except Exception as e:
                                    st.warning(f"Could not parse: {e}")
                                    st.code(response)
                            else:
                                st.error(usage_info)

                    # Show variant result (persists across reruns)
                    if "variant_program" in st.session_state and st.session_state["variant_program"]:
                        df_variant = pd.DataFrame(st.session_state["variant_program"])
                        v_name = st.session_state.get("variant_name", "")
                        v_user = st.session_state.get("variant_user", selected_user)
                        v_usage = st.session_state.get("variant_usage_info", "")

                        st.divider()
                        st.subheader(f"Variant: {v_name}")
                        if v_usage:
                            st.caption(v_usage)
                        st.success(f"{len(df_variant)} rows")
                        st.dataframe(df_variant[["Week", "Day", "Exercise", "Sets", "Reps", "RPE"]].head(20), use_container_width=True)

                        bcol1, bcol2 = st.columns(2)
                        with bcol1:
                            if st.button("✅ Save & Assign Variant", key="variant_save", type="primary"):
                                save_program(v_name, df_variant)
                                users = load_users()
                                users[v_user]["program"] = v_name
                                save_users(users)
                                del st.session_state["variant_program"]
                                st.success(f"Saved and assigned {v_name} to {v_user}!")
                                st.rerun()
                        with bcol2:
                            if st.button("🗑️ Discard", key="variant_discard"):
                                del st.session_state["variant_program"]
                                st.rerun()

        # ==================== TAB: IMPORT FROM PDF ====================
        with tab_pdf:
            st.subheader("Import Program from PDF")
            st.caption("Upload a PDF containing a workout program. The AI will parse it into a usable program.")

            pdf_prog_name = st.text_input("Program Name", value="", key="pdf_prog_name",
                                          placeholder="e.g., Functional Body Composition")

            uploaded_pdf = st.file_uploader("Upload workout PDF", type=["pdf"], key="pdf_uploader")

            # Extract text from PDF and store in session state
            if uploaded_pdf:
                # Auto-install pdfplumber if missing
                try:
                    import pdfplumber
                except ImportError:
                    with st.spinner("Installing PDF reader (one-time setup)..."):
                        import subprocess as _sp
                        _sp.check_call([sys.executable, "-m", "pip", "install", "pdfplumber", "-q"])
                    import pdfplumber

                try:
                    pdf_bytes = uploaded_pdf.read()
                    pdf_text_pages = []
                    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                        total_pages = len(pdf.pages)
                        st.caption(f"PDF loaded: {total_pages} pages")

                        for page in pdf.pages:
                            text = page.extract_text()
                            if text:
                                pdf_text_pages.append(text)

                    full_text = "\n\n--- PAGE BREAK ---\n\n".join(pdf_text_pages)
                    # Store in session state so it survives reruns
                    st.session_state["pdf_extracted_text"] = full_text

                    with st.expander("Preview extracted text", expanded=False):
                        st.text(full_text[:3000] + ("..." if len(full_text) > 3000 else ""))
                        st.caption(f"Total characters: {len(full_text):,}")

                except Exception as e:
                    st.error(f"Could not read PDF: {e}")

            # Retrieve stored text
            full_text = st.session_state.get("pdf_extracted_text", None)

            # Show button — always visible, checks conditions on click
            if st.button("🤖 Parse PDF into Program", type="primary", use_container_width=True):
                if not full_text:
                    st.error("Please upload a PDF first.")
                elif not pdf_prog_name:
                    st.error("Please enter a program name.")
                else:
                    prompt = f"""Parse this workout program PDF into CSV format.

Program name to use: "{pdf_prog_name}"

Here is the extracted text from the PDF:

{full_text}

Convert ALL weeks and days found in the PDF into the CSV format.
Use "{pdf_prog_name}" as the Program column value for all rows.
Include the CSV header row."""

                    with st.spinner("Parsing PDF... (this may take 30-60 seconds for large programs)"):
                        response, usage_info = call_claude(prompt, PDF_IMPORT_SYSTEM_PROMPT)

                    if response:
                        try:
                            df_pdf = parse_ai_csv(response)
                            df_pdf["Program"] = pdf_prog_name
                            st.session_state["pdf_imported_program"] = df_pdf.to_dict("records")
                            st.session_state["pdf_imported_name"] = pdf_prog_name
                            st.session_state["pdf_imported_usage"] = usage_info
                            # Clear extracted text
                            if "pdf_extracted_text" in st.session_state:
                                del st.session_state["pdf_extracted_text"]
                            st.rerun()
                        except Exception as e:
                            st.warning(f"Could not parse AI response: {e}")
                            st.text("Raw AI response:")
                            st.code(response)
                    else:
                        st.error(usage_info)

            # Show imported result (persists across reruns)
            if "pdf_imported_program" in st.session_state and st.session_state["pdf_imported_program"]:
                df_pdf = pd.DataFrame(st.session_state["pdf_imported_program"])
                pdf_name = st.session_state.get("pdf_imported_name", pdf_prog_name)
                pdf_usage = st.session_state.get("pdf_imported_usage", "")

                st.divider()
                st.subheader(f"Imported: {pdf_name}")
                if pdf_usage:
                    st.caption(pdf_usage)

                weeks_found = df_pdf["Week"].nunique() if "Week" in df_pdf.columns else 0
                days_found = df_pdf[~df_pdf["Order"].astype(str).str.upper().eq("REST")]["Day"].nunique() if "Day" in df_pdf.columns else 0
                st.success(f"{len(df_pdf)} rows · {weeks_found} weeks · {days_found} training day types")
                st.dataframe(df_pdf, use_container_width=True)

                col1, col2, col3, col4 = st.columns(4)
                with col1:
                    if st.button("💾 Save to Program Library", key="pdf_save", type="primary"):
                        save_program(pdf_name, df_pdf)
                        st.session_state.active_program_name = pdf_name
                        del st.session_state["pdf_imported_program"]
                        st.success(f"Saved **{pdf_name}**! View it on the 📋 Programs page.")
                        st.rerun()
                with col2:
                    if st.button("💾 Save & Assign", key="pdf_save_assign"):
                        save_program(pdf_name, df_pdf)
                        st.session_state.active_program_name = pdf_name
                        del st.session_state["pdf_imported_program"]
                        st.success(f"Saved! Switch to 👥 Users to assign.")
                        st.rerun()
                with col3:
                    csv_data = df_pdf.to_csv(index=False)
                    st.download_button(
                        "📥 Export CSV",
                        data=csv_data,
                        file_name=f"{pdf_name.replace(' ', '_').lower()}.csv",
                        mime="text/csv",
                        key="pdf_export_csv",
                    )
                with col4:
                    if st.button("🗑️ Discard", key="pdf_discard"):
                        del st.session_state["pdf_imported_program"]
                        st.rerun()

        # ==================== TAB 4: COST TRACKER ====================
        with tab4:
            st.subheader("💰 API Cost Tracker")

            costs = load_costs()

            total_cost = costs.get("total_cost_usd", 0.0)
            requests = costs.get("requests", [])

            # Summary metrics
            col1, col2, col3 = st.columns(3)
            col1.metric("Total Spend", f"${total_cost:.4f}")
            col2.metric("Total Requests", len(requests))

            # Per-model breakdown
            model_costs = {}
            for req in requests:
                m = req.get("model", "sonnet")
                if m not in model_costs:
                    model_costs[m] = {"cost": 0.0, "count": 0}
                model_costs[m]["cost"] += req.get("cost_usd", 0.0)
                model_costs[m]["count"] += 1

            breakdown = " · ".join(
                f"{m.capitalize()}: ${info['cost']:.4f} ({info['count']})"
                for m, info in model_costs.items()
            )
            col3.metric("Breakdown", breakdown if breakdown else "No requests yet")

            st.caption("Pricing: " + " · ".join(
                f"{m.capitalize()}: ${info['input_per_m']}/{info['output_per_m']} per M tokens"
                for m, info in MODELS.items()
            ))

            if requests:
                st.divider()
                st.markdown("**Recent Requests:**")
                for req in reversed(requests[-20:]):
                    ts = req.get("timestamp", "")[:16].replace("T", " ")
                    m = req.get("model", "sonnet")
                    st.markdown(
                        f"- `{ts}` **{m}** — {req.get('input_tokens', 0):,} in / {req.get('output_tokens', 0):,} out "
                        f"— **${req.get('cost_usd', 0):.4f}** — _{req.get('description', '')}_"
                    )

                st.divider()
                if st.button("🗑️ Reset Cost Tracker"):
                    save_costs({"total_cost_usd": 0.0, "requests": []})
                    st.success("Reset!")
                    st.rerun()
            else:
                st.info("No API calls yet. Generate a program to see costs here.")


# ==================== PAGE: PROGRAMS ====================
elif page == "📋 Programs":
    st.title("📋 Programs")
    render_deploy_banner()

    programs = get_program_names()

    if not programs:
        st.info("No programs yet. Use the Program Builder to generate one.")
    else:
        # Program cards
        for prog_name in programs:
            df_prog = load_program(prog_name)
            users = load_users()
            assigned_users = [n for n, info in users.items() if info.get("program") == prog_name]
            weeks = sorted(df_prog["Week"].dropna().unique()) if len(df_prog) > 0 else []
            training_days = len(df_prog[~df_prog["Order"].astype(str).str.upper().eq("REST")]["Day"].dropna().unique()) if len(df_prog) > 0 else 0

            with st.expander(
                f"**{prog_name}** — {len(weeks)} weeks · {len(assigned_users)} user{'s' if len(assigned_users) != 1 else ''}",
                expanded=len(programs) == 1,
            ):
                if assigned_users:
                    st.caption(f"Assigned to: {', '.join(assigned_users)}")

                # Week visual
                rows_for_visual = [r.to_dict() for _, r in df_prog.iterrows()]
                if weeks:
                    vis_week = st.selectbox(
                        "View week", [int(float(w)) for w in weeks],
                        key=f"vis_{prog_name}",
                    )
                    render_week_visual(rows_for_visual, vis_week, allow_edit=False)

                    # Day detail drill-down
                    DAY_NAMES = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday",
                                 5: "Friday", 6: "Saturday", 7: "Sunday"}
                    week_data = df_prog[df_prog["Week"].apply(lambda x: int(float(x))) == vis_week]
                    all_days = sorted([int(float(d)) for d in week_data["Day"].unique() if _safe_numeric(d) is not None])

                    if all_days:
                        detail_day = st.selectbox(
                            "Drill into day",
                            all_days,
                            format_func=lambda d: f"Day {d} — {DAY_NAMES.get(d, '')}",
                            key=f"detail_day_{prog_name}",
                        )
                        day_data = week_data[week_data["Day"].apply(lambda x: int(float(x))) == detail_day]

                        is_rest = any(day_data["Order"].astype(str).str.upper() == "REST")
                        if is_rest:
                            st.info(f"🧘 Day {detail_day} ({DAY_NAMES.get(detail_day, '')}) is a rest day.")
                        else:
                            st.markdown(f"**Day {detail_day} — {DAY_NAMES.get(detail_day, '')}**")
                            for _, row in day_data.iterrows():
                                order = str(row.get("Order", ""))
                                exercise = str(row.get("Exercise", ""))
                                sets = row.get("Sets", "")
                                reps = row.get("Reps", "")
                                tempo = row.get("Tempo", "")
                                rest = row.get("Rest", "")
                                rpe = row.get("RPE", "")
                                instruction = str(row.get("Instruction", ""))

                                # Format as a clean block
                                detail_parts = []
                                if sets and str(sets) != "nan" and str(sets) != "0":
                                    detail_parts.append(f"**Sets:** {int(float(sets)) if _safe_numeric(sets) else sets}")
                                if reps and str(reps) != "nan":
                                    detail_parts.append(f"**Reps:** {reps}")
                                if tempo and str(tempo) != "nan":
                                    detail_parts.append(f"**Tempo:** {tempo}")
                                if rest and str(rest) != "nan":
                                    detail_parts.append(f"**Rest:** {rest}")
                                if rpe and str(rpe) != "nan":
                                    detail_parts.append(f"**RPE:** {rpe}")

                                st.markdown(f"**{order}.** {exercise}")
                                if detail_parts:
                                    st.caption(" · ".join(detail_parts))
                                if instruction and instruction != "nan":
                                    st.caption(f"💡 {instruction}")

                    st.divider()

                    # Muscle diagram: per-day + full week
                    exercises_data = load_exercises()
                    if exercises_data:
                        st.divider()
                        st.markdown("**Muscle Load Map**")

                        # Day selector for per-day view
                        week_df = df_prog[df_prog["Week"] == vis_week]
                        available_days = sorted(week_df["Day"].unique())
                        training_days_list = [
                            int(float(d)) for d in available_days
                            if _safe_numeric(d) is not None and not any(week_df[(week_df["Day"] == d)]["Order"].astype(str).str.upper() == "REST")
                        ]

                        diagram_cols = st.columns(2)
                        with diagram_cols[0]:
                            if training_days_list:
                                sel_day = st.selectbox(
                                    "View day", training_days_list,
                                    key=f"muscle_day_{prog_name}",
                                )
                                day_loads = calculate_muscle_load(df_prog, exercises_data, week=vis_week, day=sel_day)
                                st.markdown(
                                    render_body_svg(day_loads, title=f"Day {sel_day}"),
                                    unsafe_allow_html=True,
                                )
                            else:
                                st.caption("No training days this week.")

                        with diagram_cols[1]:
                            week_loads = calculate_muscle_load(df_prog, exercises_data, week=vis_week)
                            st.markdown(
                                render_body_svg(week_loads, title=f"Full Week {int(vis_week)}"),
                                unsafe_allow_html=True,
                            )

                # Actions
                st.divider()
                acol1, acol2, acol3, acol4 = st.columns(4)
                with acol1:
                    edit_key = f"editing_{prog_name}"
                    if st.session_state.get(edit_key):
                        if st.button("❌ Cancel Edit", key=f"cancel_edit_{prog_name}"):
                            st.session_state[edit_key] = False
                            st.rerun()
                    else:
                        if st.button("✏️ Edit Program", key=f"edit_{prog_name}"):
                            st.session_state[edit_key] = True
                            st.rerun()
                with acol2:
                    if st.button("👥 Assign to Users", key=f"assign_{prog_name}"):
                        st.session_state.active_program_name = prog_name
                        st.session_state["assign_program"] = prog_name
                        st.rerun()
                with acol3:
                    ai_edit_key = f"ai_editing_{prog_name}"
                    if st.session_state.get(ai_edit_key):
                        if st.button("❌ Cancel AI", key=f"cancel_ai_{prog_name}"):
                            st.session_state[ai_edit_key] = False
                            st.rerun()
                    else:
                        if st.button("🤖 AI Edit", key=f"ai_edit_{prog_name}"):
                            st.session_state[ai_edit_key] = True
                            st.rerun()
                with acol4:
                    if st.button("🗑️ Delete", key=f"del_{prog_name}", type="secondary"):
                        delete_program(prog_name)
                        st.success(f"Deleted {prog_name}")
                        st.rerun()

                # --- Inline Manual Edit ---
                if st.session_state.get(f"editing_{prog_name}"):
                    st.markdown("#### ✏️ Edit Program")
                    st.caption("Edit exercises directly. Changes apply to the selected week/day.")

                    edit_cols = ["Order", "Exercise", "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]
                    edit_df = day_data[edit_cols].copy() if 'day_data' in dir() and len(day_data) > 0 else pd.DataFrame(columns=edit_cols)

                    edited = st.data_editor(
                        edit_df,
                        num_rows="dynamic",
                        use_container_width=True,
                        key=f"editor_{prog_name}_{vis_week}_{detail_day if 'detail_day' in dir() else 0}",
                    )

                    save_col1, save_col2 = st.columns(2)
                    with save_col1:
                        if st.button("💾 Save Changes", key=f"save_edit_{prog_name}", type="primary"):
                            if 'vis_week' in dir() and 'detail_day' in dir():
                                # Build updated rows with Program/Week/Day
                                new_rows = edited.copy()
                                new_rows["Program"] = prog_name
                                new_rows["Week"] = vis_week
                                new_rows["Day"] = detail_day

                                # Remove old day data from full program, add new
                                full_df = load_program_data()
                                mask = (
                                    (full_df["Program"] == prog_name) &
                                    (full_df["Week"].apply(lambda x: int(float(x)) if _safe_numeric(x) else None) == int(vis_week)) &
                                    (full_df["Day"].apply(lambda x: int(float(x)) if _safe_numeric(x) else None) == int(detail_day))
                                )
                                kept = full_df[~mask]
                                combined = pd.concat([kept, new_rows], ignore_index=True)
                                save_program_data(combined)

                                # Rebuild JSON
                                with st.spinner("Rebuilding program.json..."):
                                    result = run_build()
                                if result.returncode == 0:
                                    st.success("Saved & rebuilt!")
                                    st.session_state["needs_deploy"] = True
                                    st.session_state[f"editing_{prog_name}"] = False
                                    st.rerun()
                                else:
                                    st.error(f"Build failed: {result.stderr}")
                            else:
                                st.warning("Select a week and day first.")
                    with save_col2:
                        if st.button("📋 Save Entire Week", key=f"save_week_{prog_name}"):
                            st.info("Use Save Changes on each day, or use AI Edit for bulk changes.")

                # --- AI Edit ---
                if st.session_state.get(f"ai_editing_{prog_name}"):
                    st.markdown("#### 🤖 AI Program Editor")
                    st.caption("Describe the changes you want and AI will update the program.")

                    ai_scope = st.radio(
                        "Scope of changes",
                        ["Selected day only", "Selected week", "Entire program"],
                        key=f"ai_scope_{prog_name}",
                        horizontal=True,
                    )

                    ai_instruction = st.text_area(
                        "What changes would you like?",
                        placeholder="e.g. Replace barbell bench press with dumbbell bench press, add 2 sets of face pulls at the end, increase RPE by 1 across all exercises...",
                        key=f"ai_instruction_{prog_name}",
                    )

                    if st.button("🚀 Apply AI Changes", key=f"apply_ai_{prog_name}", type="primary"):
                        if not ai_instruction.strip():
                            st.warning("Please describe the changes you want.")
                        else:
                            # Build context based on scope
                            if ai_scope == "Selected day only" and 'vis_week' in dir() and 'detail_day' in dir():
                                scope_df = df_prog[
                                    (df_prog["Week"].apply(lambda x: int(float(x)) if _safe_numeric(x) else None) == int(vis_week)) &
                                    (df_prog["Day"].apply(lambda x: int(float(x)) if _safe_numeric(x) else None) == int(detail_day))
                                ]
                                scope_label = f"Week {vis_week}, Day {detail_day}"
                            elif ai_scope == "Selected week" and 'vis_week' in dir():
                                scope_df = df_prog[df_prog["Week"].apply(lambda x: int(float(x)) if _safe_numeric(x) else None) == int(vis_week)]
                                scope_label = f"Week {vis_week}"
                            else:
                                scope_df = df_prog
                                scope_label = "entire program"

                            # Build CSV context
                            csv_lines = ["Program,Week,Day,Order,Exercise,Sets,Reps,Tempo,Rest,RPE,Instruction"]
                            for _, row in scope_df.iterrows():
                                vals = [str(row.get(c, "")) for c in ["Program", "Week", "Day", "Order", "Exercise",
                                                                       "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]]
                                csv_lines.append(",".join(vals))
                            csv_context = "\n".join(csv_lines)

                            exercises_data = load_exercises()
                            ex_context = build_exercise_library_context(exercises_data) if exercises_data else ""

                            prompt = f"""You are a strength & conditioning coach editing a workout program.

SCOPE: {scope_label} of program "{prog_name}"

CURRENT PROGRAM DATA (CSV):
{csv_context}

{ex_context}

USER REQUEST:
{ai_instruction}

INSTRUCTIONS:
- Return ONLY the updated CSV rows (including the header line).
- Keep the exact same CSV format: Program,Week,Day,Order,Exercise,Sets,Reps,Tempo,Rest,RPE,Instruction
- Only modify what the user requested. Keep everything else unchanged.
- Use exercises from the library when possible.
- Do NOT include any explanation, just the CSV."""

                            with st.spinner("AI is editing the program..."):
                                response, usage_info = call_claude(prompt)

                            if response:
                                st.caption(usage_info)
                                # Parse AI response as CSV
                                try:
                                    from io import StringIO
                                    ai_csv = response.strip()
                                    # Remove markdown code fences if present
                                    if ai_csv.startswith("```"):
                                        ai_csv = "\n".join(ai_csv.split("\n")[1:])
                                    if ai_csv.endswith("```"):
                                        ai_csv = ai_csv.rsplit("```", 1)[0]
                                    ai_df = pd.read_csv(StringIO(ai_csv.strip()))

                                    st.markdown("**Preview of changes:**")
                                    st.dataframe(ai_df, use_container_width=True)

                                    if st.button("✅ Accept Changes", key=f"accept_ai_{prog_name}", type="primary"):
                                        # Replace scope in full data
                                        full_df = load_program_data()
                                        if ai_scope == "Selected day only" and 'vis_week' in dir() and 'detail_day' in dir():
                                            mask = (
                                                (full_df["Program"] == prog_name) &
                                                (full_df["Week"].apply(lambda x: int(float(x)) if _safe_numeric(x) else None) == int(vis_week)) &
                                                (full_df["Day"].apply(lambda x: int(float(x)) if _safe_numeric(x) else None) == int(detail_day))
                                            )
                                        elif ai_scope == "Selected week" and 'vis_week' in dir():
                                            mask = (
                                                (full_df["Program"] == prog_name) &
                                                (full_df["Week"].apply(lambda x: int(float(x)) if _safe_numeric(x) else None) == int(vis_week))
                                            )
                                        else:
                                            mask = (full_df["Program"] == prog_name)

                                        kept = full_df[~mask]
                                        combined = pd.concat([kept, ai_df], ignore_index=True)
                                        save_program_data(combined)

                                        with st.spinner("Rebuilding program.json..."):
                                            result = run_build()
                                        if result.returncode == 0:
                                            st.success("AI changes applied & rebuilt!")
                                            st.session_state["needs_deploy"] = True
                                            st.session_state[f"ai_editing_{prog_name}"] = False
                                            st.rerun()
                                        else:
                                            st.error(f"Build failed: {result.stderr}")
                                except Exception as e:
                                    st.error(f"Failed to parse AI response as CSV: {e}")
                                    st.code(response)
                            else:
                                st.error(usage_info)

        # Quick assign flow (triggered from program card)
        if "assign_program" in st.session_state:
            assign_prog = st.session_state["assign_program"]
            st.divider()
            st.subheader(f"Assign '{assign_prog}' to Users")

            users = load_users()
            all_users = list(users.keys())

            if not all_users:
                st.warning("No users exist yet. Add users on the Users page first.")
            else:
                selected_users = st.multiselect("Select users", all_users, key="assign_users_multi")
                assign_date = st.text_input("Start Date", value=datetime.now().strftime("%Y-%m-%d"), key="assign_date")

                bcol1, bcol2 = st.columns(2)
                with bcol1:
                    if st.button("✅ Assign", type="primary"):
                        for u in selected_users:
                            users[u]["program"] = assign_prog
                            users[u]["startDate"] = assign_date
                        save_users(users)
                        st.success(f"Assigned {assign_prog} to {', '.join(selected_users)}")
                        del st.session_state["assign_program"]
                        st.rerun()
                with bcol2:
                    if st.button("Cancel"):
                        del st.session_state["assign_program"]
                        st.rerun()

        # Manage programs section
        st.divider()
        st.subheader("Manage Programs")
        del_prog = st.selectbox("Select program", programs, key="del_prog_sel")
        dcol1, dcol2 = st.columns([1, 3])
        with dcol1:
            if st.button("🗑️ Delete Program", type="secondary"):
                # Check if any users are assigned
                users_check = load_users()
                affected = [n for n, info in users_check.items() if info.get("program") == del_prog]
                if affected:
                    st.warning(f"⚠️ {', '.join(affected)} {'is' if len(affected) == 1 else 'are'} assigned to this program. Unassign them first or they'll have a missing program.")
                    st.session_state[f"confirm_delete_{del_prog}"] = True
                else:
                    delete_program(del_prog)
                    st.success(f"Deleted {del_prog}")
                    st.rerun()
        with dcol2:
            if st.session_state.get(f"confirm_delete_{del_prog}"):
                if st.button(f"⚠️ Yes, delete {del_prog} anyway", type="primary"):
                    delete_program(del_prog)
                    del st.session_state[f"confirm_delete_{del_prog}"]
                    st.success(f"Deleted {del_prog}")
                    st.rerun()

        st.divider()
        with st.expander("⚠️ Danger Zone"):
            st.caption("This will permanently delete ALL programs from the library.")
            if st.button("🗑️ Delete All Programs", type="secondary", key="nuke_all"):
                st.session_state["confirm_nuke"] = True
            if st.session_state.get("confirm_nuke"):
                st.warning("Are you sure? This cannot be undone.")
                c1, c2 = st.columns(2)
                with c1:
                    if st.button("⚠️ Yes, delete everything", type="primary", key="nuke_confirm"):
                        save_program_data(pd.DataFrame(
                            columns=["Program", "Week", "Day", "Order", "Exercise",
                                     "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]
                        ))
                        if "confirm_nuke" in st.session_state:
                            del st.session_state["confirm_nuke"]
                        st.success("All programs deleted.")
                        st.rerun()
                with c2:
                    if st.button("Cancel", key="nuke_cancel"):
                        del st.session_state["confirm_nuke"]
                        st.rerun()


# ==================== PAGE: USERS ====================
elif page == "👥 Users":
    st.title("👥 Users")
    render_deploy_banner()

    users = load_users()
    programs = get_program_names()
    all_metrics = load_metrics()

    if users:
        st.subheader("Current Users")
        for name, info in users.items():
            prog_display = info.get("program") or "No program"
            date_display = info.get("startDate") or "—"
            with st.expander(f"**{name}** → {prog_display} (started {date_display})"):

                # --- Program & Password ---
                st.markdown("**Program & Account**")
                col1, col2 = st.columns(2)

                with col1:
                    prog_options = ["— No program —"] + programs
                    current_prog = info.get("program", "")
                    prog_idx = prog_options.index(current_prog) if current_prog in prog_options else 0
                    new_program = st.selectbox(
                        "Program", prog_options,
                        index=prog_idx,
                        key=f"prog_{name}",
                    )
                    if new_program == "— No program —":
                        new_program = ""
                    new_date = st.text_input("Start Date (YYYY-MM-DD)", info.get("startDate", ""), key=f"date_{name}")

                with col2:
                    current_email = info.get("email", "")
                    new_email = st.text_input("Email", value=current_email, key=f"email_{name}")
                    new_pass = st.text_input("New Password (leave blank to keep)", type="password", key=f"pass_{name}")
                    has_password = "passwordHash" in info
                    st.caption(f"Password set: {'✅ Yes' if has_password else '❌ No'}")

                col_save, col_variant, col_del = st.columns(3)
                with col_save:
                    if st.button(f"Save {name}", key=f"save_{name}"):
                        users[name]["program"] = new_program
                        users[name]["startDate"] = new_date
                        if new_email.strip():
                            users[name]["email"] = new_email.strip().lower()
                        if new_pass:
                            users[name]["passwordHash"] = hash_password(new_pass)
                        save_users(users)
                        st.success(f"Updated {name}")
                        st.rerun()

                with col_variant:
                    if st.button(f"🤖 Create AI Variant", key=f"variant_{name}"):
                        st.info("Switch to Program Builder → User Variant tab.")

                with col_del:
                    if st.button(f"🗑️ Remove {name}", key=f"del_{name}", type="secondary"):
                        del users[name]
                        save_users(users)
                        st.success(f"Removed {name}")
                        st.rerun()

                # --- Body Metrics ---
                st.divider()
                st.markdown("**📊 Body Metrics**")

                user_entries = all_metrics.get(name, {}).get("entries", [])

                # Log new entry
                with st.expander("Log new measurement", expanded=False):
                    m_date = st.date_input("Date", value=datetime.now(), key=f"mdate_{name}")
                    mcols = st.columns(len(METRIC_FIELDS))
                    m_values = {}
                    for i, (field_key, field_label) in enumerate(METRIC_FIELDS):
                        with mcols[i]:
                            val = st.number_input(
                                field_label, min_value=0.0, max_value=500.0, value=0.0,
                                step=0.1, key=f"m_{field_key}_{name}",
                            )
                            if val > 0:
                                m_values[field_key] = val

                    if st.button("📏 Save Measurement", key=f"msave_{name}"):
                        if m_values:
                            entry = {"date": m_date.strftime("%Y-%m-%d"), **m_values}
                            if name not in all_metrics:
                                all_metrics[name] = {"entries": []}
                            all_metrics[name]["entries"].append(entry)
                            # Sort by date
                            all_metrics[name]["entries"].sort(key=lambda x: x["date"])
                            save_metrics(all_metrics)
                            st.success("Measurement saved!")
                            st.rerun()
                        else:
                            st.error("Enter at least one measurement.")

                # Progress chart
                if user_entries:
                    chart_df = pd.DataFrame(user_entries)
                    chart_df["date"] = pd.to_datetime(chart_df["date"])

                    # Find which metrics have data
                    available_metrics = [
                        (k, label) for k, label in METRIC_FIELDS
                        if k in chart_df.columns and chart_df[k].notna().any()
                    ]

                    if available_metrics:
                        metric_labels = [label for _, label in available_metrics]
                        metric_keys = [k for k, _ in available_metrics]
                        selected_metrics = st.multiselect(
                            "Show on chart",
                            metric_labels,
                            default=metric_labels[:2],
                            key=f"mchart_{name}",
                        )

                        if selected_metrics:
                            sel_keys = [metric_keys[metric_labels.index(l)] for l in selected_metrics]
                            chart_data = chart_df[["date"] + sel_keys].set_index("date")
                            chart_data.columns = [dict(METRIC_FIELDS)[k] for k in sel_keys]
                            st.line_chart(chart_data)

                    # Show raw data
                    with st.expander("View all entries"):
                        display_df = chart_df.copy()
                        display_df["date"] = display_df["date"].dt.strftime("%Y-%m-%d")
                        st.dataframe(display_df, use_container_width=True)

                        if st.button(f"🗑️ Clear all metrics for {name}", key=f"mclear_{name}"):
                            all_metrics[name] = {"entries": []}
                            save_metrics(all_metrics)
                            st.rerun()
                else:
                    st.caption("No measurements logged yet.")

    else:
        st.info("No users yet. Add one below.")

    st.divider()

    # Quick assign section
    if programs and users:
        st.subheader("Quick Assign")
        qcol1, qcol2, qcol3 = st.columns(3)
        with qcol1:
            qa_program = st.selectbox("Program", programs, key="qa_prog")
        with qcol2:
            qa_users = st.multiselect("Users", list(users.keys()), key="qa_users")
        with qcol3:
            qa_date = st.text_input("Start Date", value=datetime.now().strftime("%Y-%m-%d"), key="qa_date")

        if st.button("✅ Assign Program", type="primary"):
            if qa_users:
                for u in qa_users:
                    users[u]["program"] = qa_program
                    users[u]["startDate"] = qa_date
                save_users(users)
                st.success(f"Assigned {qa_program} to {', '.join(qa_users)}")
                st.rerun()
            else:
                st.error("Select at least one user.")

        st.divider()

    st.subheader("Add New User")
    col1, col2 = st.columns(2)
    with col1:
        new_name = st.text_input("Name")
        new_email = st.text_input("Email")
    with col2:
        new_password = st.text_input("Password", type="password")
        new_prog_options = ["— No program —"] + programs
        new_program = st.selectbox("Program (optional)", new_prog_options, key="new_user_prog")
        if new_program == "— No program —":
            new_program = ""

    if st.button("➕ Add User", type="primary"):
        if not new_name:
            st.error("Name is required")
        elif not new_email:
            st.error("Email is required")
        elif not new_password:
            st.error("Password is required")
        elif new_name in users:
            st.error(f"{new_name} already exists")
        else:
            user_data = {
                "email": new_email.strip().lower(),
                "passwordHash": hash_password(new_password),
            }
            if new_program:
                user_data["program"] = new_program
                user_data["startDate"] = datetime.now().strftime("%Y-%m-%d")
            else:
                user_data["program"] = ""
                user_data["startDate"] = ""
            users[new_name] = user_data
            save_users(users)
            st.success(f"Added {new_name}" + (f" → {new_program}" if new_program else ""))
            st.rerun()


# ==================== PAGE: EXERCISES ====================
elif page == "🏋️ Exercises":
    st.title("🏋️ Exercise Library")

    exercises_data = load_exercises()
    rows = get_builder_rows()

    if "selected_exercises" not in st.session_state:
        st.session_state.selected_exercises = {}
    if "edit_day" not in st.session_state:
        st.session_state.edit_day = None

    if not exercises_data:
        st.warning("No exercises found. Add some below.")
    else:
        # ==================== WEEK VISUAL (if active program) ====================
        if active_prog:
            st.subheader(f"📅 {active_prog} — Week Planner")

            weeks_in_builder = sorted(set(r["Week"] for r in rows if r.get("Program") == active_prog)) if rows else []
            current_week = st.selectbox(
                "Viewing Week",
                [1] + [w for w in weeks_in_builder if w != 1],
                key="visual_week",
            ) if weeks_in_builder else 1

            prog_rows = [r for r in rows if r.get("Program") == active_prog]
            render_week_visual(prog_rows, current_week)

            # Quick actions
            qcol1, qcol2, qcol3, qcol4 = st.columns(4)
            with qcol1:
                rest_day = st.selectbox("Add rest day to:", [f"Day {d}" for d in range(1, 8)], key="rest_day_sel")
                if st.button("🧘 Add Rest Day"):
                    d = int(rest_day.split(" ")[1])
                    st.session_state.builder_rows = [
                        r for r in rows if not (r.get("Program") == active_prog and r["Week"] == current_week and r["Day"] == d)
                    ]
                    st.session_state.builder_rows.append({
                        "Program": active_prog, "Week": current_week, "Day": d,
                        "Order": "REST", "Exercise": "Rest Day", "Sets": 0, "Reps": 0,
                        "Tempo": "", "Rest": "", "RPE": "",
                        "Instruction": "Active recovery. Light walking or stretching recommended.",
                    })
                    st.rerun()
            with qcol2:
                total_weeks = st.number_input("Total weeks", min_value=1, max_value=52, value=4, key="vis_total_weeks")
                if st.button("🔄 Copy Week 1 → All"):
                    week1 = [r for r in rows if r.get("Program") == active_prog and r["Week"] == 1]
                    st.session_state.builder_rows = [
                        r for r in rows if not (r.get("Program") == active_prog and r["Week"] > 1)
                    ]
                    for w in range(2, total_weeks + 1):
                        for row in week1:
                            new_row = row.copy()
                            new_row["Week"] = w
                            st.session_state.builder_rows.append(new_row)
                    st.success(f"Copied to {total_weeks} weeks")
                    st.rerun()
            with qcol3:
                if st.button("💾 Save Program", type="primary", use_container_width=True):
                    if rows:
                        new_df = pd.DataFrame([r for r in rows if r.get("Program") == active_prog])
                        save_program(active_prog, new_df)
                        st.success(f"Saved {active_prog}!")
            with qcol4:
                if st.button("🗑️ Clear Program"):
                    st.session_state.builder_rows = [r for r in rows if r.get("Program") != active_prog]
                    st.rerun()

            st.divider()

            # ==================== EDIT DAY PANEL ====================
            if st.session_state.edit_day:
                ed = st.session_state.edit_day
                st.subheader(f"✏️ Editing Week {ed['week']}, Day {ed['day']}")

                day_rows = [
                    r for r in rows
                    if r.get("Program") == active_prog and r["Week"] == ed["week"] and r["Day"] == ed["day"]
                ]

                if any(r["Order"] == "REST" for r in day_rows):
                    st.info("This is a rest day. Clear it to add exercises.")
                    if st.button("Clear Rest Day"):
                        st.session_state.builder_rows = [
                            r for r in rows
                            if not (r.get("Program") == active_prog and r["Week"] == ed["week"] and r["Day"] == ed["day"])
                        ]
                        st.session_state.edit_day = None
                        st.rerun()
                else:
                    for idx, r in enumerate(day_rows):
                        global_idx = rows.index(r)
                        ecols = st.columns([0.5, 2, 0.8, 0.8, 1, 0.8, 0.8, 0.5])
                        with ecols[0]:
                            new_order = st.text_input("Ord", value=str(r["Order"]), key=f"eord_{idx}", label_visibility="collapsed")
                        with ecols[1]:
                            st.markdown(f"**{r['Exercise']}**")
                        with ecols[2]:
                            new_sets = st.number_input("Sets", value=int(r["Sets"]), min_value=1, max_value=10, key=f"esets_{idx}", label_visibility="collapsed")
                        with ecols[3]:
                            new_reps = st.text_input("Reps", value=str(r["Reps"]), key=f"ereps_{idx}", label_visibility="collapsed")
                        with ecols[4]:
                            new_tempo = st.text_input("Tempo", value=str(r["Tempo"]), key=f"etempo_{idx}", label_visibility="collapsed")
                        with ecols[5]:
                            new_rest = st.text_input("Rest", value=str(r["Rest"]), key=f"erest_{idx}", label_visibility="collapsed")
                        with ecols[6]:
                            new_rpe = st.text_input("RPE", value=str(r["RPE"]), key=f"erpe_{idx}", label_visibility="collapsed")
                        with ecols[7]:
                            if st.button("✕", key=f"edel_{idx}"):
                                st.session_state.builder_rows.pop(global_idx)
                                st.rerun()

                        st.session_state.builder_rows[global_idx]["Order"] = new_order
                        st.session_state.builder_rows[global_idx]["Sets"] = new_sets
                        st.session_state.builder_rows[global_idx]["Reps"] = new_reps
                        st.session_state.builder_rows[global_idx]["Tempo"] = new_tempo
                        st.session_state.builder_rows[global_idx]["Rest"] = new_rest
                        st.session_state.builder_rows[global_idx]["RPE"] = new_rpe

                if st.button("✅ Done Editing", type="primary"):
                    st.session_state.edit_day = None
                    st.rerun()

                st.divider()
        else:
            st.info("Set an **Active Program** name in the sidebar to start building.")
            st.divider()

        # ==================== SELECTION CONFIG BAR ====================
        selected_count = sum(1 for v in st.session_state.selected_exercises.values() if v)

        if selected_count > 0:
            st.subheader(f"📝 {selected_count} exercise{'s' if selected_count > 1 else ''} selected")

            with st.expander("Configure & Add to Program", expanded=True):
                col1, col2 = st.columns(2)
                with col1:
                    lib_day = st.number_input("Add to Day", min_value=1, max_value=7, value=1, key="lib_day")
                with col2:
                    lib_week = st.number_input("Add to Week", min_value=1, max_value=52, value=1, key="lib_week")

                st.markdown("**Default values for all selected:**")
                dcol1, dcol2, dcol3, dcol4, dcol5 = st.columns(5)
                with dcol1:
                    default_sets = st.number_input("Sets", min_value=1, max_value=10, value=3, key="lib_def_sets")
                with dcol2:
                    default_reps = st.text_input("Reps", value="10", key="lib_def_reps")
                with dcol3:
                    default_tempo = st.text_input("Tempo", value="3-1-2-0", key="lib_def_tempo")
                with dcol4:
                    default_rest = st.text_input("Rest", value="90s", key="lib_def_rest")
                with dcol5:
                    default_rpe = st.text_input("RPE", value="7", key="lib_def_rpe")

                auto_order = st.checkbox("Auto-assign order numbers", value=True, key="lib_auto_order")

                st.divider()

                st.markdown("**Edit individual exercises:**")
                st.caption("Order | Exercise | Sets | Reps | Tempo | Rest | RPE")
                selected_names = [name for name, sel in st.session_state.selected_exercises.items() if sel]

                existing_day_count = len([
                    r for r in rows
                    if r.get("Program") == active_prog and r["Week"] == lib_week and r["Day"] == lib_day and r["Order"] != "REST"
                ])

                override_data = {}
                for i, ex_name in enumerate(selected_names):
                    order_val = str(existing_day_count + i + 1) if auto_order else ""
                    cols = st.columns([0.5, 2.5, 0.8, 0.8, 1, 0.8, 0.8])
                    with cols[0]:
                        ov_order = st.text_input("Ord", value=order_val, key=f"ov_ord_{i}", label_visibility="collapsed")
                    with cols[1]:
                        st.markdown(f"**{ex_name}**")
                    with cols[2]:
                        ov_sets = st.number_input("S", value=default_sets, min_value=1, max_value=10, key=f"ov_sets_{i}", label_visibility="collapsed")
                    with cols[3]:
                        ov_reps = st.text_input("R", value=default_reps, key=f"ov_reps_{i}", label_visibility="collapsed")
                    with cols[4]:
                        ov_tempo = st.text_input("T", value=default_tempo, key=f"ov_tempo_{i}", label_visibility="collapsed")
                    with cols[5]:
                        ov_rest = st.text_input("Rst", value=default_rest, key=f"ov_rest_{i}", label_visibility="collapsed")
                    with cols[6]:
                        ov_rpe = st.text_input("RPE", value=default_rpe, key=f"ov_rpe_{i}", label_visibility="collapsed")

                    override_data[ex_name] = {
                        "order": ov_order, "sets": ov_sets, "reps": ov_reps,
                        "tempo": ov_tempo, "rest": ov_rest, "rpe": ov_rpe,
                    }

                st.markdown("")
                bcol1, bcol2 = st.columns(2)
                with bcol1:
                    if st.button("➕ Add to Program", type="primary", use_container_width=True):
                        if not active_prog:
                            st.error("Set an Active Program name in the sidebar first!")
                        else:
                            for ex_name, ov in override_data.items():
                                st.session_state.builder_rows.append({
                                    "Program": active_prog,
                                    "Week": lib_week,
                                    "Day": lib_day,
                                    "Order": ov["order"],
                                    "Exercise": ex_name,
                                    "Sets": ov["sets"],
                                    "Reps": ov["reps"],
                                    "Tempo": ov["tempo"],
                                    "Rest": ov["rest"],
                                    "RPE": ov["rpe"],
                                    "Instruction": "",
                                })
                            st.session_state.selected_exercises = {}
                            st.success(f"Added {len(override_data)} exercises to Day {lib_day}!")
                            st.rerun()

                with bcol2:
                    if st.button("🗑️ Clear Selection", use_container_width=True):
                        st.session_state.selected_exercises = {}
                        st.rerun()

            st.divider()

        # ==================== EXERCISE BROWSE ====================
        st.subheader("Browse Exercises")

        col1, col2 = st.columns(2)
        with col1:
            body_filter = st.selectbox("Filter by Body Part", ["All"] + list(exercises_data.keys()))
        with col2:
            equip_filter = st.selectbox(
                "Filter by Equipment",
                ["All", "Machine", "Cable", "Barbell", "EZ Bar", "Smith Machine",
                 "Dumbbell", "Bodyweight", "Band"],
            )

        for body_part, categories in exercises_data.items():
            if body_filter != "All" and body_part != body_filter:
                continue

            with st.expander(f"**{body_part}**", expanded=body_filter != "All"):
                for category, ex_list in categories.items():
                    filtered = ex_list
                    if equip_filter != "All":
                        filtered = [e for e in ex_list if e["equipment"] == equip_filter]
                    if not filtered:
                        continue

                    st.markdown(f"*{category}*")
                    for ex in filtered:
                        ex_key = ex["name"]
                        is_selected = st.session_state.selected_exercises.get(ex_key, False)
                        col_check, col_name = st.columns([0.3, 4])
                        with col_check:
                            new_val = st.checkbox(
                                "sel",
                                value=is_selected,
                                key=f"cb_{body_part}_{category}_{ex['name']}",
                                label_visibility="collapsed",
                            )
                            if new_val != is_selected:
                                st.session_state.selected_exercises[ex_key] = new_val
                                st.rerun()
                        with col_name:
                            st.markdown(f"{ex['name']} `{ex['equipment']}`")

        total = sum(
            len(ex_list) for cats in exercises_data.values() for ex_list in cats.values()
        )
        st.divider()
        st.caption(f"Total exercises in library: {total}")

        # Add custom exercise
        st.divider()
        st.subheader("Add Custom Exercise")
        col1, col2, col3 = st.columns(3)
        with col1:
            new_body = st.selectbox("Body Part", list(exercises_data.keys()), key="new_ex_body")
        with col2:
            new_cat = st.selectbox("Category", ["Machine", "Barbell", "Dumbbell", "Bodyweight"], key="new_ex_cat")
        with col3:
            new_equip = st.text_input("Equipment", value=new_cat, key="new_ex_equip")
        new_ex_name = st.text_input("Exercise Name", key="new_ex_name")

        if st.button("➕ Add Exercise to Library", type="primary"):
            if new_ex_name:
                if new_cat not in exercises_data[new_body]:
                    exercises_data[new_body][new_cat] = []
                exercises_data[new_body][new_cat].append({
                    "name": new_ex_name,
                    "equipment": new_equip,
                })
                save_exercises(exercises_data)
                st.success(f"Added {new_ex_name} to {new_body} / {new_cat}")
                st.rerun()


# ==================== PAGE: DEPLOY ====================
elif page == "📥 Import CSV":
    st.title("📥 Import Program CSV")
    st.markdown("Upload a CSV file to import a new workout program. The CSV must have these columns: **Program, Week, Day, Order, Exercise, Sets, Reps, Tempo, Rest, RPE, Instruction**")

    REQUIRED_COLS = ["Program", "Week", "Day", "Order", "Exercise", "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]

    uploaded = st.file_uploader("Choose a CSV file", type=["csv"])

    if uploaded:
        try:
            import_df = pd.read_csv(uploaded)
        except Exception as e:
            st.error(f"Failed to read CSV: {e}")
            import_df = None

        if import_df is not None:
            missing = [c for c in REQUIRED_COLS if c not in import_df.columns]
            if missing:
                st.error(f"Missing required columns: {', '.join(missing)}")
                st.markdown(f"**Found columns:** {', '.join(import_df.columns.tolist())}")
            else:
                programs_in_file = sorted(import_df["Program"].dropna().unique().tolist())
                weeks_count = import_df[["Program", "Week"]].drop_duplicates().shape[0]
                rows_count = len(import_df)

                st.success(f"CSV looks good!")
                col1, col2, col3 = st.columns(3)
                col1.metric("Programs", len(programs_in_file))
                col2.metric("Weeks", weeks_count)
                col3.metric("Rows", rows_count)

                st.markdown("**Programs found:** " + ", ".join(programs_in_file))

                # Preview
                with st.expander("Preview data", expanded=False):
                    st.dataframe(import_df.head(30), use_container_width=True)

                # Import mode
                existing_programs = get_program_names()
                overlap = [p for p in programs_in_file if p in existing_programs]

                if overlap:
                    st.warning(f"These programs already exist and will be **replaced**: {', '.join(overlap)}")

                import_mode = st.radio("Import mode", ["Add / Replace programs", "Replace entire CSV"], horizontal=True)

                if st.button("📥 Import", type="primary", use_container_width=True):
                    existing_df = load_program_data()

                    if import_mode == "Replace entire CSV":
                        save_program_data(import_df)
                        st.success(f"Replaced entire CSV with {rows_count} rows.")
                    else:
                        # Remove existing programs that match, then append
                        if len(existing_df) > 0 and overlap:
                            existing_df = existing_df[~existing_df["Program"].isin(programs_in_file)]
                        combined = pd.concat([existing_df, import_df], ignore_index=True)
                        save_program_data(combined)
                        st.success(f"Imported {rows_count} rows for: {', '.join(programs_in_file)}")

                    # Auto-build
                    with st.spinner("Building program.json..."):
                        result = run_build()
                    if result.returncode == 0:
                        st.success("Build successful! Program is ready.")
                        st.code(result.stdout)
                        st.session_state["needs_deploy"] = True
                        st.info("Don't forget to **Deploy** to push changes to the live app.")
                    else:
                        st.error("Build failed!")
                        st.code(result.stderr)

elif page == "📊 Coach Dashboard":
    st.title("📊 Coach Dashboard")
    st.caption("View workout logs and Whoop data synced from the live app.")

    # Server URL - defaults to numnum.fit, can be overridden
    COACH_SERVER = os.environ.get("NUMNUM_SERVER_URL", "https://numnum.fit")

    def _coach_request(url):
        """Make a request with proper User-Agent to avoid Cloudflare blocks."""
        req = urllib.request.Request(url, headers={"User-Agent": "NumNumAdmin/1.0"})
        r = urllib.request.urlopen(req, timeout=10)
        return json.loads(r.read())

    @st.cache_data(ttl=30)
    def fetch_coach_users(server_url):
        """Fetch user list from the server's coach API."""
        try:
            return _coach_request(f"{server_url}/api/coach/users")
        except Exception as e:
            return {"error": str(e)}

    @st.cache_data(ttl=30)
    def fetch_coach_user_data(server_url, user_key):
        """Fetch a specific user's full data from the server."""
        try:
            encoded = urllib.parse.quote(user_key)
            return _coach_request(f"{server_url}/api/coach/user/{encoded}")
        except Exception as e:
            return {"error": str(e)}

    def calc_day_metrics(day_data):
        """Calculate completion % and tonnage from a single day's workout data."""
        total_sets = 0
        done_sets = 0
        tonnage = 0.0
        data = day_data.get("data", {})
        for ex_key, sets in data.items():
            if not isinstance(sets, dict):
                continue
            for s_key, s_val in sets.items():
                if not s_key.startswith("set") or not isinstance(s_val, dict):
                    continue
                total_sets += 1
                if s_val.get("done"):
                    done_sets += 1
                try:
                    w = float(s_val.get("weight", 0) or 0)
                    r = float(s_val.get("reps", 0) or 0)
                    tonnage += w * r
                except (ValueError, TypeError):
                    pass
        completion = round(done_sets / total_sets * 100) if total_sets > 0 else 0
        return total_sets, done_sets, completion, round(tonnage)

    if st.button("🔄 Refresh Data", type="primary"):
        st.cache_data.clear()

    result = fetch_coach_users(COACH_SERVER)

    if "error" in result:
        st.error(f"Could not connect to server: {result['error']}")
        st.info(f"Make sure the app is running at `{COACH_SERVER}`. Set `NUMNUM_SERVER_URL` env var to override.")
    else:
        users_list = result.get("users", [])
        if not users_list:
            st.info("No user data on server yet. Users need to log in and complete workouts on the app.")
        else:
            st.metric("Active Users", len(users_list))

            # Helper: load prescribed program data
            def get_prescribed_program(user_name):
                users_cfg = load_users()
                prog_name = users_cfg.get(user_name, {}).get("program", "")
                prog_data = {}
                if PROGRAM_JSON.exists():
                    with open(PROGRAM_JSON) as f:
                        prog_data = json.load(f)
                return prog_name, prog_data.get("programs", {}).get(prog_name, {})

            def get_prescribed_day(prescribed, w_num, d_num):
                if not prescribed or not w_num or not d_num:
                    return None
                for w in prescribed.get("weeks", []):
                    if w.get("week") == w_num:
                        for d in w.get("days", []):
                            if d.get("day") == d_num:
                                return d
                return None

            def build_exercise_detail(day_entry, prescribed_day):
                """Build exercise-level rows for a day drill-down."""
                data = day_entry.get("data", {})
                prescribed_exercises = {}
                if prescribed_day:
                    for group in prescribed_day.get("exerciseGroups", []):
                        for ex in group.get("exercises", []):
                            prescribed_exercises[ex["name"].lower()] = ex
                rows = []
                for ex_key, sets_data in data.items():
                    if not isinstance(sets_data, dict):
                        continue
                    rx = prescribed_exercises.get(ex_key.lower(), {})
                    for s_key in sorted(sets_data.keys()):
                        s_val = sets_data[s_key]
                        if not s_key.startswith("set") or not isinstance(s_val, dict):
                            continue
                        w = s_val.get("weight", "")
                        r = s_val.get("reps", "")
                        try:
                            st_ton = round(float(w or 0) * float(r or 0))
                        except (ValueError, TypeError):
                            st_ton = 0
                        rows.append({
                            "Exercise": ex_key,
                            "Set": s_key.replace("set", ""),
                            "Weight (kg)": w, "Reps": r,
                            "Done": "Yes" if s_val.get("done") else "No",
                            "Set Tonnage": st_ton,
                            "Rx Sets": rx.get("sets", "—"),
                            "Rx Reps": rx.get("reps", "—"),
                            "Rx RPE": rx.get("rpe", "—"),
                        })
                    if sets_data.get("notes"):
                        rows.append({"Exercise": ex_key, "Set": "Notes", "Weight (kg)": sets_data["notes"],
                                     "Reps": "", "Done": "", "Set Tonnage": "", "Rx Sets": "", "Rx Reps": "", "Rx RPE": ""})
                return rows

            def build_ai_prompt(user_name, date_from, date_to, filtered_logs, filtered_snaps, coach_notes=""):
                """Build the full AI analysis prompt."""
                prog_name, prescribed = get_prescribed_program(user_name)

                workout_summary = []
                for day_key, entry in sorted(filtered_logs.items(), key=lambda x: x[1].get("meta", {}).get("date", "")):
                    meta = entry.get("meta", {})
                    date = meta.get("date", "?")
                    week = meta.get("week", "?")
                    day = meta.get("day", "?")
                    total_sets, done_sets, completion, tonnage = calc_day_metrics(entry)
                    exercises_detail = []
                    data = entry.get("data", {})
                    for ex_key, sets_data in data.items():
                        if not isinstance(sets_data, dict):
                            continue
                        sets_info = []
                        for s_key in sorted(sets_data.keys()):
                            s_val = sets_data[s_key]
                            if s_key.startswith("set") and isinstance(s_val, dict):
                                w = s_val.get("weight", "0")
                                r = s_val.get("reps", "0")
                                done = "done" if s_val.get("done") else "not done"
                                sets_info.append(f"{w}kg x {r} ({done})")
                        if sets_info:
                            exercises_detail.append(f"  {ex_key}: {', '.join(sets_info)}")
                    workout_summary.append(
                        f"Date: {date} | Week {week} Day {day} | Completion: {completion}% | Tonnage: {tonnage}kg\n" +
                        "\n".join(exercises_detail))

                prescribed_summary = ""
                if prescribed:
                    prescribed_lines = []
                    for w in prescribed.get("weeks", []):
                        for d in w.get("days", []):
                            if d.get("isRest"):
                                prescribed_lines.append(f"Week {w['week']} Day {d['day']}: REST")
                                continue
                            exs = []
                            for g in d.get("exerciseGroups", []):
                                for ex in g.get("exercises", []):
                                    exs.append(f"  {ex['name']}: {ex['sets']} sets x {ex['reps']} reps @ RPE {ex.get('rpe', '?')}")
                            prescribed_lines.append(f"Week {w['week']} Day {d['day']}:\n" + "\n".join(exs))
                    prescribed_summary = "\n\n".join(prescribed_lines)

                whoop_summary = ""
                if filtered_snaps:
                    whoop_lines = []
                    for s in filtered_snaps:
                        d = s.get("date", "?")
                        parts = []
                        if s.get("recovery") is not None: parts.append(f"Recovery {s['recovery']}%")
                        if s.get("strain") is not None: parts.append(f"Strain {s['strain']}")
                        ss = s.get("sleep_score") or s.get("sleep")
                        if ss is not None: parts.append(f"Sleep {ss}%")
                        if s.get("hrv") is not None: parts.append(f"HRV {s['hrv']}ms")
                        if s.get("rhr") is not None: parts.append(f"RHR {s['rhr']}bpm")
                        whoop_lines.append(f"{d}: {', '.join(parts)}")
                    whoop_summary = "\n".join(whoop_lines)

                coach_section = f"\nCOACH NOTES/QUESTIONS:\n{coach_notes}" if coach_notes.strip() else ""

                return f"""Analyse athlete "{user_name}" from {date_from} to {date_to}. Be concise — no day-by-day exercise breakdowns.

PRESCRIBED PROGRAM ({prog_name}):
{prescribed_summary if prescribed_summary else "N/A"}

ACTUAL LOGS:
{chr(10).join(workout_summary)}

{"WHOOP:" + chr(10) + whoop_summary if whoop_summary else ""}
{coach_section}

Provide a SHORT analysis (max 500 words) covering:
1. **Adherence summary** — overall compliance %, key missed sessions or exercises (not day-by-day)
2. **Tonnage trend** — weekly totals, direction (up/plateau/down), notable shifts
3. **Key performance flags** — top 2-3 observations (regressions, PRs, stalls)
4. **Health correlation** — only if Whoop data present, 1-2 sentences
5. **Top 3 recommendations** — specific, actionable

Do NOT list individual exercises per day. Keep it punchy and coach-friendly."""

            # ==================== PER-USER CARDS ====================
            for u_idx, u in enumerate(sorted(users_list, key=lambda x: x.get("latest_log") or "", reverse=True)):
                user_name = u["user"]
                header_col1, header_col2 = st.columns([0.9, 0.1])
                with header_col1:
                    expanded = st.expander(f"**{user_name}** — {u['workout_logs']} logs, {u['whoop_snapshots']} Whoop snapshots")
                with header_col2:
                    ai_clicked = st.button("🤖", key=f"ai_btn_{u_idx}", help=f"AI analysis for {user_name}")

                if ai_clicked:
                    st.session_state[f"show_ai_{user_name}"] = not st.session_state.get(f"show_ai_{user_name}", False)

                with expanded:
                    user_data = fetch_coach_user_data(COACH_SERVER, user_name)
                    if "error" in user_data:
                        st.error(f"Error loading data: {user_data['error']}")
                        continue

                    logs = user_data.get("workout_logs", {})
                    snaps = user_data.get("whoop_snapshots", [])

                    # Index Whoop snapshots by date
                    whoop_by_date = {}
                    for snap in snaps:
                        d = snap.get("date", snap.get("saved_at", "")[:10])
                        whoop_by_date[d] = snap

                    # Build overview table rows
                    table_rows = []
                    day_key_by_date = {}
                    if logs:
                        for day_key, entry in sorted(logs.items(), key=lambda x: x[1].get("meta", {}).get("date") or x[1].get("saved_at", ""), reverse=True):
                            meta = entry.get("meta", {})
                            date = meta.get("date", entry.get("saved_at", "")[:10])
                            week = meta.get("week", "—")
                            day = meta.get("day", "—")
                            total_sets, done_sets, completion, tonnage = calc_day_metrics(entry)
                            whoop = whoop_by_date.get(date, {})
                            day_key_by_date[date] = day_key
                            table_rows.append({
                                "Date": date, "Week": week, "Day": day,
                                "Completion %": completion, "Sets": f"{done_sets}/{total_sets}",
                                "Tonnage (kg)": tonnage,
                                "Recovery %": whoop.get("recovery") if whoop.get("recovery") is not None else "—",
                                "Strain": whoop.get("strain") if whoop.get("strain") is not None else "—",
                                "Sleep %": (whoop.get("sleep_score") or whoop.get("sleep")) if (whoop.get("sleep_score") or whoop.get("sleep")) is not None else "—",
                                "HRV (ms)": whoop.get("hrv") if whoop.get("hrv") is not None else "—",
                                "RHR (bpm)": whoop.get("rhr") if whoop.get("rhr") is not None else "—",
                            })

                    # Add Whoop-only dates
                    logged_dates = {r["Date"] for r in table_rows}
                    for d, snap in sorted(whoop_by_date.items(), reverse=True):
                        if d not in logged_dates:
                            table_rows.append({
                                "Date": d, "Week": "—", "Day": "—",
                                "Completion %": "—", "Sets": "—", "Tonnage (kg)": "—",
                                "Recovery %": snap.get("recovery", "—"),
                                "Strain": snap.get("strain", "—"),
                                "Sleep %": snap.get("sleep_score") or snap.get("sleep", "—"),
                                "HRV (ms)": snap.get("hrv", "—"),
                                "RHR (bpm)": snap.get("rhr", "—"),
                            })

                    table_rows.sort(key=lambda r: r["Date"], reverse=True)

                    if table_rows:
                        df = pd.DataFrame(table_rows)
                        st.caption("Click a row to drill into that day's workout.")
                        selection = st.dataframe(
                            df, use_container_width=True, hide_index=True,
                            on_select="rerun", selection_mode="single-row",
                            key=f"table_{u_idx}",
                        )

                        # Summary metrics
                        workout_rows = [r for r in table_rows if isinstance(r.get("Completion %"), (int, float))]
                        if workout_rows:
                            avg_comp = round(sum(r["Completion %"] for r in workout_rows) / len(workout_rows))
                            tot_ton = sum(r["Tonnage (kg)"] for r in workout_rows if isinstance(r["Tonnage (kg)"], (int, float)))
                            w_rows = [r for r in table_rows if isinstance(r.get("Recovery %"), (int, float))]
                            avg_rec = round(sum(r["Recovery %"] for r in w_rows) / len(w_rows)) if w_rows else None
                            avg_hrv = round(sum(r["HRV (ms)"] for r in w_rows if isinstance(r["HRV (ms)"], (int, float))) / len(w_rows)) if w_rows else None
                            cols = st.columns(4)
                            cols[0].metric("Avg Completion", f"{avg_comp}%")
                            cols[1].metric("Total Tonnage", f"{tot_ton:,} kg")
                            cols[2].metric("Avg Recovery", f"{avg_rec}%" if avg_rec else "—")
                            cols[3].metric("Avg HRV", f"{avg_hrv} ms" if avg_hrv else "—")

                        # ---- Day drill-down: shown only when a row is selected ----
                        selected_rows = selection.selection.rows if selection and selection.selection else []
                        if selected_rows:
                            sel_idx = selected_rows[0]
                            sel_row = table_rows[sel_idx]
                            sel_date = sel_row["Date"]
                            sel_key = day_key_by_date.get(sel_date)

                            if sel_key and sel_key in logs:
                                st.markdown("---")
                                drill_entry = logs[sel_key]
                                drill_meta = drill_entry.get("meta", {})
                                st.markdown(f"**{sel_date} — Week {drill_meta.get('week', '?')} Day {drill_meta.get('day', '?')}**")
                                ts, ds, comp, ton = calc_day_metrics(drill_entry)
                                c1, c2, c3 = st.columns(3)
                                c1.metric("Completion", f"{comp}%")
                                c2.metric("Tonnage", f"{ton:,} kg")
                                c3.metric("Sets", f"{ds}/{ts}")

                                _, prescribed_prog = get_prescribed_program(user_name)
                                rx_day = get_prescribed_day(prescribed_prog, drill_meta.get("week"), drill_meta.get("day"))
                                ex_rows = build_exercise_detail(drill_entry, rx_day)
                                if ex_rows:
                                    st.dataframe(pd.DataFrame(ex_rows), use_container_width=True, hide_index=True)
                                else:
                                    st.info("No exercise data for this day.")
                            elif sel_date not in day_key_by_date:
                                st.markdown("---")
                                st.info(f"**{sel_date}** — Whoop data only (no workout logged).")
                    else:
                        st.info("No workout or Whoop data yet.")

                # ---- AI Analysis Form (shown when 🤖 is clicked) ----
                if st.session_state.get(f"show_ai_{user_name}", False):
                    with st.container():
                        st.markdown(f"#### 🤖 AI Analysis for {user_name}")
                        api_key = load_api_key()
                        if not api_key:
                            st.warning("Add `ANTHROPIC_API_KEY=sk-ant-...` to your `.env` file to enable AI analysis.")
                        else:
                            with st.form(key=f"ai_form_{u_idx}"):
                                col_from, col_to = st.columns(2)
                                with col_from:
                                    ai_date_from = st.date_input("From", value=datetime.now().date().replace(day=1), key=f"ai_from_{u_idx}")
                                with col_to:
                                    ai_date_to = st.date_input("To", value=datetime.now().date(), key=f"ai_to_{u_idx}")

                                coach_notes = st.text_area(
                                    "Coach notes / specific questions",
                                    placeholder="e.g. Is their squat progressing? Are they recovering well enough for the volume? Any concerns about their sleep?",
                                    key=f"ai_notes_{u_idx}")

                                analysis_focus = st.multiselect(
                                    "Focus areas",
                                    ["Adherence vs program", "Tonnage progression", "Performance trends", "Recovery & health correlation", "Recommendations"],
                                    default=["Adherence vs program", "Tonnage progression", "Recommendations"],
                                    key=f"ai_focus_{u_idx}")

                                submitted = st.form_submit_button("Run Analysis", type="primary", use_container_width=True)

                            if submitted:
                                ai_user_data = fetch_coach_user_data(COACH_SERVER, user_name)
                                if "error" in ai_user_data:
                                    st.error(f"Error: {ai_user_data['error']}")
                                else:
                                    ai_logs = ai_user_data.get("workout_logs", {})
                                    ai_snaps = ai_user_data.get("whoop_snapshots", [])

                                    filtered_logs = {k: v for k, v in ai_logs.items()
                                                     if str(ai_date_from) <= (v.get("meta", {}).get("date") or v.get("saved_at", "")[:10]) <= str(ai_date_to)}
                                    filtered_snaps = [s for s in ai_snaps
                                                      if str(ai_date_from) <= s.get("date", s.get("saved_at", "")[:10]) <= str(ai_date_to)]

                                    if not filtered_logs:
                                        st.warning("No workout data in this date range.")
                                    else:
                                        # Tonnage bar chart
                                        tonnage_chart = []
                                        for dk, dv in sorted(filtered_logs.items(), key=lambda x: x[1].get("meta", {}).get("date", "")):
                                            m = dv.get("meta", {})
                                            d_str = m.get("date", dv.get("saved_at", "")[:10])
                                            _, _, _, ton = calc_day_metrics(dv)
                                            tonnage_chart.append({"Date": d_str, "Tonnage (kg)": ton})
                                        if tonnage_chart:
                                            st.bar_chart(pd.DataFrame(tonnage_chart).set_index("Date"))

                                        focus_note = f"\nFocus especially on: {', '.join(analysis_focus)}" if analysis_focus else ""
                                        full_notes = (coach_notes or "") + focus_note
                                        prompt = build_ai_prompt(user_name, ai_date_from, ai_date_to, filtered_logs, filtered_snaps, full_notes)

                                        with st.spinner("Analysing workouts..."):
                                            analysis_system = """You are an expert strength and conditioning coach. Be concise and direct.
No day-by-day exercise lists. Focus on trends, flags, and actionable recommendations. Max 500 words."""
                                            response, usage_info = call_claude(prompt, system_prompt=analysis_system)

                                        if response:
                                            st.caption(usage_info)
                                            st.markdown(response)
                                        else:
                                            st.error(usage_info)

elif page == "🚀 Deploy":
    st.title("🚀 Deploy to GitHub")

    st.markdown(f"**Live app:** [{APP_URL}]({APP_URL})")

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Step 1: Build")
        st.caption("Generates the app data from your programs and user config.")
        if st.button("🔨 Build App Data", type="primary", use_container_width=True):
            result = run_build()
            if result.returncode == 0:
                st.success("Build successful!")
                st.code(result.stdout)
            else:
                st.error("Build failed!")
                st.code(result.stderr)

    with col2:
        st.subheader("Step 2: Push")
        st.caption("Commits and pushes to GitHub. App updates in ~1 minute.")
        commit_msg = st.text_input("Commit message", value="Update program")
        if st.button("🚀 Push to GitHub", type="primary", use_container_width=True):
            output = git_push(commit_msg)
            st.code(output)
            st.success("Pushed! App will update in ~1 minute.")

    st.divider()

    st.subheader("Or do both at once")
    if st.button("⚡ Build & Deploy", use_container_width=True):
        with st.spinner("Building..."):
            result = run_build()
        if result.returncode != 0:
            st.error("Build failed!")
            st.code(result.stderr)
        else:
            st.success("Built!")
            with st.spinner("Pushing to GitHub..."):
                output = git_push("Update workout program")
            st.code(output)
            st.session_state["needs_deploy"] = False
            st.success(f"Done! Live at {APP_URL}")

    st.divider()

    st.subheader("Current Status")
    col1, col2, col3 = st.columns(3)

    users = load_users()
    programs = get_program_names()

    col1.metric("Programs", len(programs))
    col2.metric("Users", len(users))
    col3.metric("Exercises", sum(len(ex) for cats in load_exercises().values() for ex in cats.values()))

    if users:
        st.markdown("**User Assignments:**")
        for name, info in users.items():
            has_pw = "✅" if "passwordHash" in info else "❌"
            email = info.get("email", "—")
            st.markdown(f"- **{name}** ({email}) → {info.get('program', 'N/A')} (start: {info.get('startDate', 'N/A')}) | Password: {has_pw}")

elif page == "⚙️ Settings":
    st.title("⚙️ Settings & Links")

    st.subheader("External Services")
    st.markdown("""
| Service | Link |
|---------|------|
| **Live App** | [numnum.fit](https://numnum.fit/) |
| **Whoop Developer Dashboard** | [developer-dashboard.whoop.com](https://developer-dashboard.whoop.com/apps/37076ba6-13c7-435f-8476-75a5faf039ce) |
| **Railway (Hosting)** | [railway.com](https://railway.com) |
| **GitHub Repository** | [github.com/juanpienaar/workout_app](https://github.com/juanpienaar/workout_app) |
""")

    st.divider()

    st.subheader("Railway Environment Variables")
    st.caption("These should be set in Railway → Variables tab:")
    st.code("""WHOOP_CLIENT_ID=37076ba6-13c7-435f-8476-75a5faf039ce
WHOOP_CLIENT_SECRET=<your secret>
WHOOP_REDIRECT_URI=https://numnum.fit/whoop/callback""", language="bash")

    st.divider()

    st.subheader("Key Paths")
    st.markdown(f"""
- **App directory:** `{APP_DIR}`
- **Program CSV:** `{CSV_FILE}`
- **Users config:** `{USERS_FILE}`
- **Exercises:** `{EXERCISES_FILE}`
""")
