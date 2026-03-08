"""Admin CRUD routes — coach-only endpoints for managing users, programs, exercises."""

import json
import subprocess
import sys
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from ..auth import require_coach, hash_password
from ..data import load_users, save_users, load_user_data, save_user_data, get_user_file
from ..ai_builder import generate_program, load_costs as load_ai_costs, MODELS
from .. import config

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Pydantic models ─────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str
    email: str
    password: str
    program: str = ""
    startDate: str = ""
    role: str = "athlete"

class UpdateUserRequest(BaseModel):
    email: Optional[str] = None
    program: Optional[str] = None
    startDate: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

class ExerciseItem(BaseModel):
    name: str
    equipment: str = ""

class ProgramCreateRequest(BaseModel):
    name: str
    weeks: list[Any] = []

class DuplicateRequest(BaseModel):
    new_name: str

class AIGenerateRequest(BaseModel):
    types: list[str]
    typeConfig: dict = {}
    model: str = "sonnet"
    weeks: int = 8
    name: str
    notes: str = ""
    daysPerWeek: int = 5
    sessionTime: int = 60
    experience: str = "intermediate"


# ── Helpers ──────────────────────────────────────────────────────

def _load_program_json() -> dict:
    p = config.PROGRAM_FILE
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return {"programs": {}}

def _save_program_json(data: dict):
    with open(config.PROGRAM_FILE, "w") as f:
        json.dump(data, f, indent=2)

def _load_exercises() -> dict:
    if config.EXERCISES_FILE.exists():
        with open(config.EXERCISES_FILE) as f:
            return json.load(f)
    return {}

def _save_exercises(data: dict):
    with open(config.EXERCISES_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ══════════════════════════════════════════════════════════════════
# USERS
# ══════════════════════════════════════════════════════════════════

@router.get("/users")
async def list_users(coach: Annotated[dict, Depends(require_coach)]):
    users = load_users()
    result = []
    for name, info in users.items():
        result.append({
            "username": name,
            "email": info.get("email", ""),
            "program": info.get("program", ""),
            "startDate": info.get("startDate", ""),
            "role": info.get("role", "athlete"),
            "email_verified": info.get("email_verified", False),
        })
    return {"users": result}


@router.post("/users")
async def create_user(req: CreateUserRequest, coach: Annotated[dict, Depends(require_coach)]):
    users = load_users()
    if req.username in users:
        raise HTTPException(400, "User already exists")
    users[req.username] = {
        "email": req.email,
        "passwordHash": hash_password(req.password),
        "program": req.program,
        "startDate": req.startDate,
        "role": req.role,
    }
    save_users(users)
    return {"ok": True, "username": req.username}


@router.put("/users/{username}")
async def update_user(username: str, req: UpdateUserRequest, coach: Annotated[dict, Depends(require_coach)]):
    users = load_users()
    if username not in users:
        raise HTTPException(404, "User not found")
    if req.email is not None:
        users[username]["email"] = req.email
    if req.program is not None:
        users[username]["program"] = req.program
    if req.startDate is not None:
        users[username]["startDate"] = req.startDate
    if req.role is not None:
        users[username]["role"] = req.role
    if req.password is not None:
        users[username]["passwordHash"] = hash_password(req.password)
    save_users(users)
    return {"ok": True}


@router.delete("/users/{username}")
async def delete_user(username: str, coach: Annotated[dict, Depends(require_coach)]):
    users = load_users()
    if username not in users:
        raise HTTPException(404, "User not found")
    del users[username]
    save_users(users)
    # Also remove user data file
    f = get_user_file(username)
    if f.exists():
        f.unlink()
    return {"ok": True}


@router.get("/users/{username}/metrics")
async def get_user_metrics(username: str, coach: Annotated[dict, Depends(require_coach)]):
    data = load_user_data(username)
    return {"metrics": data.get("metrics", [])}


@router.get("/users/{username}/data")
async def get_user_full_data(username: str, coach: Annotated[dict, Depends(require_coach)]):
    """Full user data for coach dashboard — workout logs, whoop, metrics."""
    data = load_user_data(username)
    return data


# ══════════════════════════════════════════════════════════════════
# PROGRAMS
# ══════════════════════════════════════════════════════════════════

@router.get("/programs")
async def list_programs(coach: Annotated[dict, Depends(require_coach)]):
    pdata = _load_program_json()
    programs = pdata.get("programs", {})
    result = []
    for name, prog in programs.items():
        weeks = prog.get("weeks", [])
        result.append({
            "name": name,
            "weeks": len(weeks),
            "days_per_week": len(weeks[0]["days"]) if weeks else 0,
        })
    return {"programs": result}


@router.get("/programs/{name}")
async def get_program(name: str, coach: Annotated[dict, Depends(require_coach)]):
    pdata = _load_program_json()
    programs = pdata.get("programs", {})
    if name not in programs:
        raise HTTPException(404, "Program not found")
    return programs[name]


@router.put("/programs/{name}")
async def update_program(name: str, body: dict, coach: Annotated[dict, Depends(require_coach)]):
    pdata = _load_program_json()
    if name not in pdata.get("programs", {}):
        raise HTTPException(404, "Program not found")
    # Allow updating the full program structure
    pdata["programs"][name] = body
    pdata["programs"][name]["name"] = name  # ensure name stays consistent
    _save_program_json(pdata)
    return {"ok": True}


@router.post("/programs")
async def create_program(req: ProgramCreateRequest, coach: Annotated[dict, Depends(require_coach)]):
    pdata = _load_program_json()
    if req.name in pdata.get("programs", {}):
        raise HTTPException(400, "Program already exists")
    pdata.setdefault("programs", {})[req.name] = {
        "name": req.name,
        "weeks": req.weeks,
    }
    _save_program_json(pdata)
    return {"ok": True, "name": req.name}


@router.delete("/programs/{name}")
async def delete_program(name: str, coach: Annotated[dict, Depends(require_coach)]):
    pdata = _load_program_json()
    if name not in pdata.get("programs", {}):
        raise HTTPException(404, "Program not found")
    del pdata["programs"][name]
    _save_program_json(pdata)
    return {"ok": True}


@router.post("/programs/{name}/duplicate")
async def duplicate_program(name: str, req: DuplicateRequest, coach: Annotated[dict, Depends(require_coach)]):
    pdata = _load_program_json()
    if name not in pdata.get("programs", {}):
        raise HTTPException(404, "Source program not found")
    if req.new_name in pdata["programs"]:
        raise HTTPException(400, "Target name already exists")
    import copy
    clone = copy.deepcopy(pdata["programs"][name])
    clone["name"] = req.new_name
    pdata["programs"][req.new_name] = clone
    _save_program_json(pdata)
    return {"ok": True, "name": req.new_name}


# ══════════════════════════════════════════════════════════════════
# EXERCISES
# ══════════════════════════════════════════════════════════════════

@router.get("/exercises")
async def get_exercises(coach: Annotated[dict, Depends(require_coach)]):
    return _load_exercises()


@router.put("/exercises")
async def update_exercises(body: dict, coach: Annotated[dict, Depends(require_coach)]):
    _save_exercises(body)
    return {"ok": True}


@router.post("/exercises/{group}")
async def add_exercise(group: str, item: ExerciseItem, coach: Annotated[dict, Depends(require_coach)]):
    exercises = _load_exercises()
    if group not in exercises:
        exercises[group] = {}
    # Find the right sub-category or default
    equip = item.equipment or "Other"
    if equip not in exercises[group]:
        exercises[group][equip] = []
    exercises[group][equip].append({"name": item.name, "equipment": equip})
    _save_exercises(exercises)
    return {"ok": True}


@router.delete("/exercises/{group}/{name}")
async def delete_exercise(group: str, name: str, coach: Annotated[dict, Depends(require_coach)]):
    exercises = _load_exercises()
    if group not in exercises:
        raise HTTPException(404, "Muscle group not found")
    found = False
    for equip_type, exlist in exercises[group].items():
        exercises[group][equip_type] = [e for e in exlist if e["name"] != name]
        if len(exercises[group][equip_type]) < len(exlist):
            found = True
    if not found:
        raise HTTPException(404, "Exercise not found")
    _save_exercises(exercises)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════
# BUILD
# ══════════════════════════════════════════════════════════════════

@router.post("/build")
async def run_build(coach: Annotated[dict, Depends(require_coach)]):
    """Run build.py to regenerate program.json from program.csv."""
    csv_file = config.PROGRAM_CSV
    build_script = config.APP_DIR / "build.py"
    if not csv_file.exists():
        raise HTTPException(400, "program.csv not found")
    if not build_script.exists():
        raise HTTPException(400, "build.py not found")
    try:
        result = subprocess.run(
            [sys.executable, str(build_script), str(csv_file)],
            capture_output=True, text=True, timeout=30,
            cwd=str(config.DATA_ROOT),
        )
        if result.returncode != 0:
            raise HTTPException(500, f"Build failed: {result.stderr}")
        return {"ok": True, "output": result.stdout}
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Build timed out")


# ══════════════════════════════════════════════════════════════════
# CSV IMPORT
# ══════════════════════════════════════════════════════════════════

@router.post("/import-csv")
async def import_csv(file: UploadFile = File(...), coach: Annotated[dict, Depends(require_coach)] = None):
    """Upload a program CSV, save it, and run build to regenerate program.json."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(400, "File must be a .csv")
    content = await file.read()
    csv_path = config.PROGRAM_CSV
    with open(csv_path, "wb") as f:
        f.write(content)
    # Run build
    build_script = config.APP_DIR / "build.py"
    try:
        result = subprocess.run(
            [sys.executable, str(build_script), str(csv_path)],
            capture_output=True, text=True, timeout=30,
            cwd=str(config.DATA_ROOT),
        )
        if result.returncode != 0:
            raise HTTPException(500, f"Build failed: {result.stderr}")
        return {"ok": True, "output": result.stdout}
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "CSV build timed out")


# ══════════════════════════════════════════════════════════════════
# AI PROGRAM GENERATION
# ══════════════════════════════════════════════════════════════════

@router.post("/ai/generate")
async def ai_generate(req: AIGenerateRequest, coach: Annotated[dict, Depends(require_coach)]):
    """Generate a program via Claude AI and save it to program.json."""
    try:
        program, cost_info = generate_program(
            types=req.types,
            type_config=req.typeConfig,
            model=req.model,
            weeks=req.weeks,
            name=req.name,
            notes=req.notes,
            days_per_week=req.daysPerWeek,
            session_time=req.sessionTime,
            experience=req.experience,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"AI generation failed: {str(e)}")

    # Save the generated program to program.json
    pdata = _load_program_json()
    pdata.setdefault("programs", {})[req.name] = program
    _save_program_json(pdata)

    return {"ok": True, "program": program, "cost": cost_info}


@router.get("/ai/costs")
async def ai_costs(coach: Annotated[dict, Depends(require_coach)]):
    """Return aggregated AI API costs."""
    costs = load_ai_costs()
    return costs


@router.get("/ai/models")
async def ai_models(coach: Annotated[dict, Depends(require_coach)]):
    """Return available AI models and pricing."""
    return {"models": MODELS}


# ══════════════════════════════════════════════════════════════════
# DEPLOY
# ══════════════════════════════════════════════════════════════════

@router.get("/deploy/status")
async def deploy_status(coach: Annotated[dict, Depends(require_coach)]):
    """Return git status for the app directory."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, timeout=10,
            cwd=str(config.APP_DIR),
        )
        files = []
        for line in result.stdout.strip().split("\n"):
            if line.strip():
                status = line[:2].strip()
                path = line[3:].strip()
                files.append({"status": status, "path": path})

        # Recent commits
        log_result = subprocess.run(
            ["git", "log", "--oneline", "-10"],
            capture_output=True, text=True, timeout=10,
            cwd=str(config.APP_DIR),
        )
        commits = []
        for line in log_result.stdout.strip().split("\n"):
            if line.strip():
                parts = line.split(" ", 1)
                commits.append({"hash": parts[0], "message": parts[1] if len(parts) > 1 else ""})

        return {"files": files, "commits": commits}
    except Exception as e:
        raise HTTPException(500, f"Git status failed: {str(e)}")


@router.post("/deploy")
async def deploy(body: dict, coach: Annotated[dict, Depends(require_coach)]):
    """Run build, git add, commit, and push."""
    message = body.get("message", "Update from admin dashboard")

    try:
        steps = []

        # 1. Run build.py if program.csv exists
        csv_file = config.PROGRAM_CSV
        build_script = config.APP_DIR / "build.py"
        if csv_file.exists() and build_script.exists():
            result = subprocess.run(
                [sys.executable, str(build_script), str(csv_file)],
                capture_output=True, text=True, timeout=30,
                cwd=str(config.DATA_ROOT),
            )
            steps.append({"step": "build", "ok": result.returncode == 0, "output": result.stdout or result.stderr})

        # 2. Git add
        result = subprocess.run(
            ["git", "add", "-A"],
            capture_output=True, text=True, timeout=10,
            cwd=str(config.APP_DIR),
        )
        steps.append({"step": "git add", "ok": result.returncode == 0})

        # 3. Git commit
        result = subprocess.run(
            ["git", "commit", "-m", message],
            capture_output=True, text=True, timeout=10,
            cwd=str(config.APP_DIR),
        )
        steps.append({"step": "git commit", "ok": result.returncode == 0, "output": result.stdout or result.stderr})

        # 4. Git push
        result = subprocess.run(
            ["git", "push"],
            capture_output=True, text=True, timeout=30,
            cwd=str(config.APP_DIR),
        )
        steps.append({"step": "git push", "ok": result.returncode == 0, "output": result.stdout or result.stderr})

        all_ok = all(s["ok"] for s in steps)
        return {"ok": all_ok, "steps": steps}
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Deploy timed out")
    except Exception as e:
        raise HTTPException(500, f"Deploy failed: {str(e)}")
