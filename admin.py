"""
Workout App Admin Dashboard
Run with: streamlit run admin.py
"""

import streamlit as st
import pandas as pd
import json
import hashlib
import subprocess
from pathlib import Path

# ==================== CONFIG ====================
APP_DIR = Path(__file__).parent
CSV_FILE = APP_DIR / "program.csv"
USERS_FILE = APP_DIR / "users.json"
EXERCISES_FILE = APP_DIR / "exercises.json"
PROGRAM_JSON = APP_DIR / "program.json"
GITHUB_URL = "https://juanpienaar.github.io/workout_app/"

st.set_page_config(page_title="Workout Admin", page_icon="💪", layout="wide")


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


def load_csv():
    if CSV_FILE.exists():
        return pd.read_csv(CSV_FILE)
    return pd.DataFrame(
        columns=["Program", "Week", "Day", "Order", "Exercise",
                 "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]
    )


def save_csv(df):
    df.to_csv(CSV_FILE, index=False)


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


def get_programs_from_csv(df):
    if "Program" in df.columns and len(df) > 0:
        return sorted(df["Program"].dropna().unique().tolist())
    return []


def get_all_exercise_names(exercises):
    """Flatten exercise library into a simple list of names."""
    names = []
    for body_part, categories in exercises.items():
        for category, ex_list in categories.items():
            for ex in ex_list:
                names.append(f"{ex['name']} ({ex['equipment']})")
    return sorted(set(names))


# ==================== SIDEBAR ====================
st.sidebar.title("💪 Workout Admin")
page = st.sidebar.radio(
    "Navigate",
    ["📋 Programs", "🏗️ Program Builder", "🏋️ Exercise Library", "👥 Users", "🚀 Deploy"],
)
st.sidebar.divider()
st.sidebar.caption(f"App URL: [{GITHUB_URL}]({GITHUB_URL})")


# ==================== PROGRAMS PAGE ====================
if page == "📋 Programs":
    st.title("📋 Program Editor")

    df = load_csv()
    programs = get_programs_from_csv(df)

    # Upload new CSV
    st.subheader("Upload CSV")
    uploaded = st.file_uploader("Upload a new program CSV", type=["csv"])
    if uploaded:
        new_df = pd.read_csv(uploaded)
        required_cols = ["Program", "Week", "Day", "Order", "Exercise",
                         "Sets", "Reps", "Tempo", "Rest", "RPE", "Instruction"]
        missing = [c for c in required_cols if c not in new_df.columns]
        if missing:
            st.error(f"Missing columns: {', '.join(missing)}")
        else:
            save_csv(new_df)
            st.success(f"Uploaded! {len(new_df)} rows, programs: {get_programs_from_csv(new_df)}")
            st.rerun()

    st.divider()

    if len(df) > 0:
        st.subheader("Current Programs")

        if programs:
            selected_program = st.selectbox("Filter by program", ["All"] + programs)
            if selected_program != "All":
                df_view = df[df["Program"] == selected_program].copy()
            else:
                df_view = df.copy()
        else:
            df_view = df.copy()

        col1, col2, col3 = st.columns(3)
        col1.metric("Programs", len(programs))
        col2.metric("Total Rows", len(df_view))
        if "Week" in df_view.columns:
            col3.metric("Weeks", df_view["Week"].nunique())

        if "Week" in df_view.columns and "Day" in df_view.columns:
            for week in sorted(df_view["Week"].unique()):
                week_df = df_view[df_view["Week"] == week]
                with st.expander(f"Week {int(week)}", expanded=bool(week == df_view["Week"].min())):
                    for day in sorted(week_df["Day"].unique()):
                        day_df = week_df[week_df["Day"] == day]
                        is_rest = any(day_df["Order"].astype(str).str.upper() == "REST")
                        if is_rest:
                            st.markdown(f"**Day {int(day)}** — 🧘 Rest Day")
                        else:
                            exercises = day_df["Exercise"].tolist()
                            st.markdown(f"**Day {int(day)}** — {', '.join(exercises)}")

        st.divider()

        st.subheader("Edit Data")
        st.caption("Edit directly in the table below, then click Save.")
        edited_df = st.data_editor(df, num_rows="dynamic", use_container_width=True, key="csv_editor")

        if st.button("💾 Save CSV", type="primary"):
            save_csv(edited_df)
            st.success("CSV saved!")
    else:
        st.info("No program CSV found. Upload one above or use the Program Builder.")


# ==================== PROGRAM BUILDER ====================
elif page == "🏗️ Program Builder":
    st.title("🏗️ Program Builder")
    st.caption("Build a training program day by day using the exercise library.")

    exercises = load_exercises()
    all_exercise_names = get_all_exercise_names(exercises)

    # Session state for builder
    if "builder_rows" not in st.session_state:
        st.session_state.builder_rows = []

    # Program metadata
    col1, col2 = st.columns(2)
    with col1:
        prog_name = st.text_input("Program Name", placeholder="e.g., Hypertrophy A")
    with col2:
        total_weeks = st.number_input("Total Weeks", min_value=1, max_value=52, value=4)

    st.divider()

    # Day builder
    st.subheader("Add Exercises to Day")

    col1, col2, col3 = st.columns(3)
    with col1:
        build_week = st.number_input("Week", min_value=1, max_value=52, value=1)
    with col2:
        build_day = st.number_input("Day", min_value=1, max_value=7, value=1)
    with col3:
        is_rest_day = st.checkbox("Rest Day")

    if is_rest_day:
        rest_note = st.text_input("Rest day note", value="Active recovery. Light walking or stretching recommended.")
        if st.button("➕ Add Rest Day", type="primary"):
            st.session_state.builder_rows.append({
                "Program": prog_name,
                "Week": build_week,
                "Day": build_day,
                "Order": "REST",
                "Exercise": "Rest Day",
                "Sets": 0,
                "Reps": 0,
                "Tempo": "",
                "Rest": "",
                "RPE": "",
                "Instruction": rest_note,
            })
            st.success(f"Added rest day: Week {build_week}, Day {build_day}")
            st.rerun()
    else:
        # Exercise selection with library
        st.markdown("**Select from library or type custom:**")

        col1, col2 = st.columns([1, 2])
        with col1:
            body_part = st.selectbox("Body Part", ["All"] + list(exercises.keys()))
        with col2:
            # Filter exercises by body part
            if body_part != "All" and body_part in exercises:
                filtered = []
                for cat, ex_list in exercises[body_part].items():
                    for ex in ex_list:
                        filtered.append(ex["name"])
                filtered = sorted(set(filtered))
            else:
                filtered = [name.split(" (")[0] for name in all_exercise_names]
                filtered = sorted(set(filtered))

            exercise_name = st.selectbox(
                "Exercise",
                ["-- Type custom --"] + filtered,
                key="exercise_select",
            )

        if exercise_name == "-- Type custom --":
            exercise_name = st.text_input("Custom exercise name")

        # Exercise details
        col1, col2, col3, col4, col5, col6 = st.columns(6)
        with col1:
            ex_order = st.text_input("Order", value="1", help="Use 1a, 1b for supersets")
        with col2:
            ex_sets = st.number_input("Sets", min_value=1, max_value=10, value=3)
        with col3:
            ex_reps = st.text_input("Reps", value="10")
        with col4:
            ex_tempo = st.text_input("Tempo", value="3-1-2-0")
        with col5:
            ex_rest = st.text_input("Rest", value="90s")
        with col6:
            ex_rpe = st.text_input("RPE", value="7")

        ex_instruction = st.text_area("Instructions / Form Cues", height=68)

        if st.button("➕ Add Exercise", type="primary"):
            if exercise_name and exercise_name != "-- Type custom --":
                st.session_state.builder_rows.append({
                    "Program": prog_name,
                    "Week": build_week,
                    "Day": build_day,
                    "Order": ex_order,
                    "Exercise": exercise_name,
                    "Sets": ex_sets,
                    "Reps": ex_reps,
                    "Tempo": ex_tempo,
                    "Rest": ex_rest,
                    "RPE": ex_rpe,
                    "Instruction": ex_instruction,
                })
                st.success(f"Added {exercise_name}")
                st.rerun()
            else:
                st.error("Select or type an exercise name")

    st.divider()

    # Show current builder contents
    if st.session_state.builder_rows:
        st.subheader("Program Preview")
        builder_df = pd.DataFrame(st.session_state.builder_rows)
        st.dataframe(builder_df, use_container_width=True)

        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("🔄 Duplicate to More Weeks"):
                """Duplicate current week 1 content across all weeks."""
                week1 = [r for r in st.session_state.builder_rows if r["Week"] == 1]
                for w in range(2, total_weeks + 1):
                    for row in week1:
                        new_row = row.copy()
                        new_row["Week"] = w
                        st.session_state.builder_rows.append(new_row)
                st.success(f"Duplicated Week 1 to Weeks 2-{total_weeks}")
                st.rerun()

        with col2:
            if st.button("💾 Save to CSV", type="primary"):
                new_df = pd.DataFrame(st.session_state.builder_rows)
                existing_df = load_csv()
                # Append or replace
                if len(existing_df) > 0 and prog_name:
                    existing_df = existing_df[existing_df["Program"] != prog_name]
                    combined = pd.concat([existing_df, new_df], ignore_index=True)
                else:
                    combined = new_df
                save_csv(combined)
                st.success(f"Saved {prog_name} to CSV! ({len(new_df)} rows)")

        with col3:
            if st.button("🗑️ Clear Builder"):
                st.session_state.builder_rows = []
                st.rerun()

        # Delete individual rows
        st.caption("Remove a row:")
        for i, row in enumerate(st.session_state.builder_rows):
            col_info, col_del = st.columns([5, 1])
            with col_info:
                rest_label = "🧘 REST" if row["Order"] == "REST" else f"{row['Order']}. {row['Exercise']} — {row['Sets']}×{row['Reps']}"
                st.text(f"W{row['Week']}D{row['Day']}: {rest_label}")
            with col_del:
                if st.button("✕", key=f"del_row_{i}"):
                    st.session_state.builder_rows.pop(i)
                    st.rerun()
    else:
        st.info("Start adding exercises above. They'll appear here as you build.")


# ==================== EXERCISE LIBRARY ====================
elif page == "🏋️ Exercise Library":
    st.title("🏋️ Exercise Library")

    exercises = load_exercises()

    if not exercises:
        st.warning("No exercises.json found.")
    else:
        # Filter
        col1, col2 = st.columns(2)
        with col1:
            body_filter = st.selectbox("Filter by Body Part", ["All"] + list(exercises.keys()))
        with col2:
            equip_filter = st.selectbox(
                "Filter by Equipment",
                ["All", "Machine", "Cable", "Barbell", "EZ Bar", "Smith Machine",
                 "Dumbbell", "Bodyweight", "Band"],
            )

        # Display
        for body_part, categories in exercises.items():
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
                        st.markdown(f"- {ex['name']} `{ex['equipment']}`")

        # Count
        total = sum(
            len(ex_list) for cats in exercises.values() for ex_list in cats.values()
        )
        st.divider()
        st.caption(f"Total exercises: {total}")

        # Add custom exercise
        st.divider()
        st.subheader("Add Custom Exercise")
        col1, col2, col3 = st.columns(3)
        with col1:
            new_body = st.selectbox("Body Part", list(exercises.keys()), key="new_ex_body")
        with col2:
            new_cat = st.selectbox("Category", ["Machine", "Barbell", "Dumbbell", "Bodyweight"], key="new_ex_cat")
        with col3:
            new_equip = st.text_input("Equipment", value=new_cat, key="new_ex_equip")
        new_ex_name = st.text_input("Exercise Name", key="new_ex_name")

        if st.button("➕ Add Exercise to Library", type="primary"):
            if new_ex_name:
                if new_cat not in exercises[new_body]:
                    exercises[new_body][new_cat] = []
                exercises[new_body][new_cat].append({
                    "name": new_ex_name,
                    "equipment": new_equip,
                })
                save_exercises(exercises)
                st.success(f"Added {new_ex_name} to {new_body} / {new_cat}")
                st.rerun()


# ==================== USERS PAGE ====================
elif page == "👥 Users":
    st.title("👥 User Management")

    users = load_users()
    df = load_csv()
    programs = get_programs_from_csv(df)

    if users:
        st.subheader("Current Users")
        for name, info in users.items():
            with st.expander(f"**{name}** → {info.get('program', 'N/A')} (started {info.get('startDate', 'N/A')})"):
                col1, col2 = st.columns(2)

                with col1:
                    new_program = st.selectbox(
                        "Program", programs if programs else [info.get("program", "")],
                        index=programs.index(info["program"]) if info.get("program") in programs else 0,
                        key=f"prog_{name}",
                    )
                    new_date = st.text_input("Start Date (YYYY-MM-DD)", info.get("startDate", ""), key=f"date_{name}")

                with col2:
                    new_pass = st.text_input("New Password (leave blank to keep current)", type="password", key=f"pass_{name}")
                    has_password = "passwordHash" in info
                    st.caption(f"Password set: {'✅ Yes' if has_password else '❌ No'}")

                col_save, col_del = st.columns(2)
                with col_save:
                    if st.button(f"Save {name}", key=f"save_{name}"):
                        users[name]["program"] = new_program
                        users[name]["startDate"] = new_date
                        if new_pass:
                            users[name]["passwordHash"] = hash_password(new_pass)
                        save_users(users)
                        st.success(f"Updated {name}")
                        st.rerun()

                with col_del:
                    if st.button(f"🗑️ Remove {name}", key=f"del_{name}", type="secondary"):
                        del users[name]
                        save_users(users)
                        st.success(f"Removed {name}")
                        st.rerun()
    else:
        st.info("No users yet. Add one below.")

    st.divider()

    st.subheader("Add New User")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        new_name = st.text_input("Name")
    with col2:
        new_program = st.selectbox("Program", programs if programs else ["No programs found"])
    with col3:
        new_date = st.text_input("Start Date", placeholder="YYYY-MM-DD")
    with col4:
        new_password = st.text_input("Password", type="password")

    if st.button("➕ Add User", type="primary"):
        if not new_name:
            st.error("Name is required")
        elif not new_date:
            st.error("Start date is required")
        elif not new_password:
            st.error("Password is required")
        elif new_name in users:
            st.error(f"{new_name} already exists")
        else:
            users[new_name] = {
                "program": new_program,
                "startDate": new_date,
                "passwordHash": hash_password(new_password),
            }
            save_users(users)
            st.success(f"Added {new_name} → {new_program} starting {new_date}")
            st.rerun()


# ==================== DEPLOY PAGE ====================
elif page == "🚀 Deploy":
    st.title("🚀 Deploy to GitHub")

    st.markdown(f"**Live app:** [{GITHUB_URL}]({GITHUB_URL})")

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Step 1: Build")
        st.caption("Converts your CSV + user config into program.json")
        if st.button("🔨 Build program.json", type="primary", use_container_width=True):
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
            st.success(f"Done! Live at {GITHUB_URL}")

    st.divider()

    st.subheader("Current Status")
    col1, col2, col3 = st.columns(3)

    users = load_users()
    df = load_csv()
    programs = get_programs_from_csv(df)

    col1.metric("Programs", len(programs))
    col2.metric("Users", len(users))
    col3.metric("CSV Rows", len(df))

    if users:
        st.markdown("**User Assignments:**")
        for name, info in users.items():
            has_pw = "✅" if "passwordHash" in info else "❌"
            st.markdown(f"- **{name}** → {info.get('program', 'N/A')} (start: {info.get('startDate', 'N/A')}) | Password: {has_pw}")
