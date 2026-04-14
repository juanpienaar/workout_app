"""JSON file I/O for user data and configuration.

Data safety guarantees:
- All writes are atomic (temp file + fsync + rename).
- A per-user threading.Lock serialises concurrent writes so request A cannot
  overwrite request B's changes when both have loaded the same snapshot.
- Each write is preceded by a rolling backup of the previous state, kept in
  `<DATA_DIR>/_backups/<username>/<timestamp>.json` (last 20 retained).
- Never silently drops keys: callers must always start with a fresh load_user_data()
  *inside* the lock for any read-modify-write sequence (see with_user_data helper).
"""

import json
import logging
import os
import shutil
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
from . import config

logger = logging.getLogger("numnum.data")

config.DATA_DIR.mkdir(exist_ok=True)

_BACKUP_DIR = config.DATA_DIR / "_backups"
_BACKUP_DIR.mkdir(exist_ok=True)
_MAX_BACKUPS_PER_USER = 20

# Per-user locks — keyed by sanitized user_key. Serialises read-modify-write
# cycles so two concurrent requests cannot clobber each other's in-memory edits.
_user_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _get_user_lock(user_key: str) -> threading.Lock:
    with _locks_guard:
        lock = _user_locks.get(user_key)
        if lock is None:
            lock = threading.Lock()
            _user_locks[user_key] = lock
        return lock


def get_user_file(user_key: str) -> Path:
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in user_key)
    return config.DATA_DIR / f"{safe_name}.json"


def _safe_name(user_key: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in user_key)


def _atomic_write_json(path: Path, data) -> None:
    """Write JSON atomically: write to temp file in same dir, fsync, then rename.

    On POSIX, rename is atomic so readers never see a partially-written file.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=str(path.parent),
    )
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(data, fh, indent=2, default=str)
            fh.flush()
            try:
                os.fsync(fh.fileno())
            except OSError:
                pass
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _backup_user_file(user_key: str, file_path: Path) -> None:
    """Copy current user file into a rolling backup directory before overwriting."""
    if not file_path.exists():
        return
    try:
        user_backup_dir = _BACKUP_DIR / _safe_name(user_key)
        user_backup_dir.mkdir(parents=True, exist_ok=True)
        ts = time.strftime("%Y%m%dT%H%M%S", time.gmtime()) + f"_{int(time.time() * 1000) % 1000:03d}"
        dest = user_backup_dir / f"{ts}.json"
        shutil.copy2(file_path, dest)
        # Prune
        backups = sorted(user_backup_dir.glob("*.json"))
        if len(backups) > _MAX_BACKUPS_PER_USER:
            for old in backups[:-_MAX_BACKUPS_PER_USER]:
                try:
                    old.unlink()
                except OSError:
                    pass
    except Exception as exc:
        logger.warning("[data] failed to backup user %s: %s", user_key, exc)


def load_user_data(user_key: str) -> dict:
    f = get_user_file(user_key)
    if f.exists():
        try:
            with open(f) as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            # If the main file is corrupt, try latest backup before bailing.
            logger.error("[data] failed to load %s: %s — trying latest backup", f, exc)
            user_backup_dir = _BACKUP_DIR / _safe_name(user_key)
            if user_backup_dir.exists():
                backups = sorted(user_backup_dir.glob("*.json"))
                for candidate in reversed(backups):
                    try:
                        with open(candidate) as fh:
                            restored = json.load(fh)
                        logger.warning("[data] restored %s from backup %s", user_key, candidate.name)
                        return restored
                    except (json.JSONDecodeError, OSError):
                        continue
            return {"workout_logs": {}, "whoop_snapshots": [], "notes": {}, "metrics": []}
    return {"workout_logs": {}, "whoop_snapshots": [], "notes": {}, "metrics": []}


def save_user_data(user_key: str, data: dict):
    """Atomically save user data with rolling backups.

    This does NOT take the per-user lock on its own — callers that do a
    read-modify-write sequence should use `with_user_data` to wrap the entire
    sequence in the lock.
    """
    f = get_user_file(user_key)
    _backup_user_file(user_key, f)
    _atomic_write_json(f, data)


def bump_program_version(user_data: dict) -> int:
    """Increment the program_version (ms timestamp) on a user_data dict.

    Call this inside a `with_user_data` block whenever `assigned_program`
    (or any field the athlete app displays from the program) is mutated,
    so the PWA can detect a change via `/api/program-version` and
    invalidate its in-memory cache.
    """
    prev = int(user_data.get("program_version") or 0)
    now_ms = int(time.time() * 1000)
    # Guarantee monotonic increase even if clock regresses.
    new_val = max(prev + 1, now_ms)
    user_data["program_version"] = new_val
    return new_val


@contextmanager
def with_user_data(user_key: str) -> Iterator[dict]:
    """Context manager: atomically load → yield mutable dict → save on exit.

    Use this for all read-modify-write sequences to prevent concurrent writes
    from clobbering each other. Example:

        with with_user_data(username) as ud:
            ud["workout_logs"][day_key] = {...}
            # auto-saved on successful exit; changes discarded on exception
    """
    lock = _get_user_lock(user_key)
    with lock:
        data = load_user_data(user_key)
        try:
            yield data
        except Exception:
            # Don't write on exception — preserve prior state.
            raise
        else:
            save_user_data(user_key, data)


def load_users() -> dict:
    if config.USERS_FILE.exists():
        try:
            with open(config.USERS_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("[data] failed to load users.json: %s", exc)
            return {}
    return {}


_users_lock = threading.Lock()


def save_users(users: dict):
    with _users_lock:
        _atomic_write_json(config.USERS_FILE, users)


def find_user_by_email(email: str) -> tuple[str | None, dict | None]:
    """Find user name and info by email address."""
    users = load_users()
    lower = email.lower().strip()
    for name, info in users.items():
        if info.get("email", "").lower() == lower:
            return name, info
    return None, None


# ── Nutrition Plans (global, like programs) ──

_nutrition_lock = threading.Lock()


def load_nutrition_plans() -> list:
    if config.NUTRITION_PLANS_FILE.exists():
        try:
            with open(config.NUTRITION_PLANS_FILE) as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except (json.JSONDecodeError, OSError):
            return []
    return []


def save_nutrition_plans(plans: list):
    with _nutrition_lock:
        _atomic_write_json(config.NUTRITION_PLANS_FILE, plans)
