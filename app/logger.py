"""Structured logging for AI Builder and other operations."""

import json
from datetime import datetime
from pathlib import Path
from . import config

LOG_FILE = config.AI_LOGS_FILE


def _load_logs() -> list:
    if LOG_FILE.exists():
        try:
            return json.loads(LOG_FILE.read_text())
        except Exception:
            return []
    return []


def _save_logs(logs: list):
    # Keep last 200 entries
    logs = logs[-200:]
    LOG_FILE.write_text(json.dumps(logs, indent=2))


def log_event(event_type: str, status: str, message: str, details: dict = None):
    """Log an event with timestamp, type, status, message, and optional details."""
    logs = _load_logs()
    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "type": event_type,
        "status": status,
        "message": message,
    }
    if details:
        entry["details"] = details
    logs.append(entry)
    _save_logs(logs)
    return entry


def get_logs(limit: int = 50, event_type: str = None) -> list:
    """Get recent logs, optionally filtered by type."""
    logs = _load_logs()
    if event_type:
        logs = [l for l in logs if l.get("type") == event_type]
    return logs[-limit:]
