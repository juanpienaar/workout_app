"""Review routes — daily/weekly workout reviews, comparison, storage, and email."""

import asyncio
import json
import logging
import smtplib
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import partial
from typing import Annotated, Optional

logger = logging.getLogger("numnum.reviews")

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import require_coach
from ..data import load_users, load_user_data, save_user_data
from .. import config

router = APIRouter(prefix="/api/admin", tags=["reviews"])


# ── Pydantic models ───────────────────────────────────────────────

class ReviewCreateRequest(BaseModel):
    type: str  # "daily" or "weekly"
    content: str  # The review text (markdown)
    date: str  # YYYY-MM-DD (the date being reviewed)
    metrics: dict = {}  # Structured data: volume, PRs, frequency, etc.
    generated_by: str = "coach"  # "coach", "agent", or "scheduled"


class SendReviewEmailRequest(BaseModel):
    username: str
    review_id: str
    send_to_coach: bool = True
    send_to_athlete: bool = True
    coach_email: Optional[str] = None  # Override; defaults to env var


# ── Helpers ────────────────────────────────────────────────────────

def _get_program_day_exercises(user_data: dict, day_key: str) -> list[dict]:
    """Look up the planned exercises for a given day_key from the assigned program."""
    program = user_data.get("assigned_program", {})
    weeks = program.get("weeks", [])
    if not weeks:
        return []

    # day_key format is typically "day_N" where N is 0-indexed across all weeks
    try:
        day_num = int(day_key.replace("day_", ""))
    except (ValueError, AttributeError):
        return []

    # Walk through weeks to find the right day
    idx = 0
    for week in weeks:
        days = week.get("days", [])
        for day in days:
            if idx == day_num:
                return day.get("exercises", [])
            idx += 1

    return []


def _extract_exercise_data(log_entry: dict) -> list[dict]:
    """Extract exercise performance from a workout log entry.

    The app stores data as:
      { "1_Bench_Press": { "set0": {weight, reps, done}, "set1": {...}, "notes": "..." },
        "2_Squat": { ... } }

    Keys like "set0" are warmup sets, "set1"+ are working sets.
    """
    data = log_entry.get("data", {})
    exercises = []

    if isinstance(data, dict):
        for ex_key, ex_data in data.items():
            if not isinstance(ex_data, dict):
                continue

            # Derive exercise name from key: "1_Bench_Press" → "Bench Press"
            parts = ex_key.split("_", 1)
            name = parts[1].replace("_", " ") if len(parts) > 1 else ex_key

            exercise = {"name": name, "sets": []}

            # Check for "setN" keys (the app's actual format)
            set_keys = sorted(
                [k for k in ex_data if k.startswith("set") and k[3:].isdigit()],
                key=lambda k: int(k[3:]),
            )

            if set_keys:
                for sk in set_keys:
                    s = ex_data[sk]
                    if not isinstance(s, dict):
                        continue
                    if not s.get("done"):
                        continue  # Skip incomplete sets
                    set_num = int(sk[3:])
                    exercise["sets"].append({
                        "reps": float(s.get("reps", 0) or 0),
                        "weight": float(s.get("weight", 0) or 0),
                        "rpe": s.get("rpe"),
                        "warmup": set_num == 0,
                    })
            else:
                # Fallback: try "sets" or "logged_sets" list format
                sets_data = ex_data.get("sets", ex_data.get("logged_sets", []))
                if isinstance(sets_data, list):
                    for s in sets_data:
                        if isinstance(s, dict):
                            exercise["sets"].append({
                                "reps": float(s.get("reps", 0) or 0),
                                "weight": float(s.get("weight", s.get("weight_kg", 0)) or 0),
                                "rpe": s.get("rpe"),
                            })

            if exercise["sets"]:
                exercise["notes"] = ex_data.get("notes", "")
                exercises.append(exercise)

    return exercises


def _compute_exercise_volume(exercise: dict) -> dict:
    """Compute total volume, best set, and average weight for an exercise."""
    total_reps = 0
    total_volume = 0.0
    best_weight = 0.0
    best_set = None

    for s in exercise.get("sets", []):
        reps = float(s.get("reps", 0) or 0)
        weight = float(s.get("weight", 0) or 0)
        total_reps += reps
        total_volume += reps * weight
        if weight > best_weight:
            best_weight = weight
            best_set = {"reps": reps, "weight": weight, "rpe": s.get("rpe")}

    return {
        "name": exercise.get("name", ""),
        "total_sets": len(exercise.get("sets", [])),
        "total_reps": int(total_reps),
        "total_volume_kg": round(total_volume, 1),
        "best_weight_kg": round(best_weight, 1),
        "best_set": best_set,
    }


def _find_same_workout_prior_weeks(
    workout_logs: dict,
    current_day_key: str,
    days_per_week: int = 7,
    num_prior_weeks: int = 4,
) -> list[dict]:
    """Find the same workout slot from prior weeks for comparison.

    If day_key is "day_15" and there are 5 days/week, prior instances would
    be day_10, day_5, day_0 (same position in each week).
    """
    try:
        current_num = int(current_day_key.replace("day_", ""))
    except (ValueError, AttributeError):
        return []

    prior = []
    for i in range(1, num_prior_weeks + 1):
        prior_num = current_num - (days_per_week * i)
        if prior_num < 0:
            break
        prior_key = f"day_{prior_num}"
        if prior_key in workout_logs:
            entry = workout_logs[prior_key]
            prior.append({
                "day_key": prior_key,
                "exercises": _extract_exercise_data(entry),
                "meta": entry.get("meta", {}),
                "saved_at": entry.get("saved_at", ""),
            })

    return prior


def _compute_weekly_stats(workout_logs: dict, week_day_keys: list[str]) -> dict:
    """Compute aggregate stats for a set of day_keys representing a week."""
    total_sessions = 0
    total_sets = 0
    total_reps = 0
    total_volume = 0.0
    muscle_groups = defaultdict(lambda: {"sets": 0, "volume": 0.0})
    prs = []  # Could be populated by comparing to all prior data

    for day_key in week_day_keys:
        if day_key not in workout_logs:
            continue

        entry = workout_logs[day_key]
        exercises = _extract_exercise_data(entry)
        if not exercises:
            continue

        total_sessions += 1
        for ex in exercises:
            stats = _compute_exercise_volume(ex)
            total_sets += stats["total_sets"]
            total_reps += stats["total_reps"]
            total_volume += stats["total_volume_kg"]

    return {
        "total_sessions": total_sessions,
        "total_sets": total_sets,
        "total_reps": total_reps,
        "total_volume_kg": round(total_volume, 1),
        "sessions_target": len(week_day_keys),
        "completion_pct": round(
            (total_sessions / len(week_day_keys) * 100) if week_day_keys else 0, 1
        ),
    }


def _get_days_per_week(user_data: dict) -> int:
    """Determine days per week from the assigned program."""
    program = user_data.get("assigned_program", {})
    weeks = program.get("weeks", [])
    if weeks:
        return len(weeks[0].get("days", []))
    return 7  # fallback


def _get_week_day_keys(week_number: int, days_per_week: int) -> list[str]:
    """Get the day_keys for a given week number (0-indexed)."""
    start = week_number * days_per_week
    return [f"day_{start + i}" for i in range(days_per_week)]


def _determine_current_week(user_data: dict) -> int:
    """Determine the current week number based on the total logged days."""
    logs = user_data.get("workout_logs", {})
    if not logs:
        return 0
    max_day = max(
        (int(k.replace("day_", "")) for k in logs if k.startswith("day_")),
        default=0,
    )
    days_per_week = _get_days_per_week(user_data)
    return max_day // days_per_week


# ══════════════════════════════════════════════════════════════════
# WORKOUT HISTORY WITH COMPARISON
# ══════════════════════════════════════════════════════════════════

@router.get("/users/{username}/workout-history")
async def get_workout_history(
    username: str,
    coach: Annotated[dict, Depends(require_coach)],
    day_key: Optional[str] = Query(None, description="Specific day_key like 'day_15'"),
    week: Optional[int] = Query(None, description="Week number (0-indexed)"),
    prior_weeks: int = Query(4, description="How many prior weeks to include for comparison"),
):
    """Return workout data with comparison to prior weeks of the same workout.

    Use `day_key` for a single day comparison, or `week` for a full week.
    """
    users = load_users()
    if username not in users:
        raise HTTPException(404, "User not found")

    user_data = load_user_data(username)
    logs = user_data.get("workout_logs", {})
    days_per_week = _get_days_per_week(user_data)

    if day_key:
        # Single day comparison
        if day_key not in logs:
            raise HTTPException(404, f"No workout log for {day_key}")

        current_exercises = _extract_exercise_data(logs[day_key])
        current_stats = [_compute_exercise_volume(ex) for ex in current_exercises]
        planned = _get_program_day_exercises(user_data, day_key)

        prior = _find_same_workout_prior_weeks(
            logs, day_key, days_per_week, prior_weeks
        )
        prior_with_stats = []
        for p in prior:
            p_stats = [_compute_exercise_volume(ex) for ex in p["exercises"]]
            prior_with_stats.append({**p, "stats": p_stats})

        return {
            "day_key": day_key,
            "current": {
                "exercises": current_exercises,
                "stats": current_stats,
                "meta": logs[day_key].get("meta", {}),
                "saved_at": logs[day_key].get("saved_at", ""),
            },
            "planned": planned,
            "prior_weeks": prior_with_stats,
            "days_per_week": days_per_week,
        }

    elif week is not None:
        # Full week view
        week_keys = _get_week_day_keys(week, days_per_week)
        days = []
        for dk in week_keys:
            if dk in logs:
                exercises = _extract_exercise_data(logs[dk])
                days.append({
                    "day_key": dk,
                    "exercises": exercises,
                    "stats": [_compute_exercise_volume(ex) for ex in exercises],
                    "meta": logs[dk].get("meta", {}),
                })
            else:
                days.append({"day_key": dk, "exercises": [], "stats": [], "skipped": True})

        # Compare to prior week
        prior_week_stats = None
        if week > 0:
            prev_keys = _get_week_day_keys(week - 1, days_per_week)
            prior_week_stats = _compute_weekly_stats(logs, prev_keys)

        return {
            "week": week,
            "days": days,
            "week_stats": _compute_weekly_stats(logs, week_keys),
            "prior_week_stats": prior_week_stats,
            "days_per_week": days_per_week,
        }

    else:
        # Default: return the most recent week
        current_week = _determine_current_week(user_data)
        week_keys = _get_week_day_keys(current_week, days_per_week)

        days = []
        for dk in week_keys:
            if dk in logs:
                exercises = _extract_exercise_data(logs[dk])
                days.append({
                    "day_key": dk,
                    "exercises": exercises,
                    "stats": [_compute_exercise_volume(ex) for ex in exercises],
                })
            else:
                days.append({"day_key": dk, "exercises": [], "stats": [], "skipped": True})

        return {
            "week": current_week,
            "days": days,
            "week_stats": _compute_weekly_stats(logs, week_keys),
            "days_per_week": days_per_week,
        }


# ══════════════════════════════════════════════════════════════════
# WEEKLY STATS
# ══════════════════════════════════════════════════════════════════

@router.get("/users/{username}/weekly-stats")
async def get_weekly_stats(
    username: str,
    coach: Annotated[dict, Depends(require_coach)],
    week: Optional[int] = Query(None, description="Week number (0-indexed). Defaults to current."),
    compare_weeks: int = Query(4, description="How many prior weeks to include"),
):
    """Aggregate weekly stats with trend comparison across multiple weeks."""
    users = load_users()
    if username not in users:
        raise HTTPException(404, "User not found")

    user_data = load_user_data(username)
    logs = user_data.get("workout_logs", {})
    days_per_week = _get_days_per_week(user_data)

    if week is None:
        week = _determine_current_week(user_data)

    weeks_data = []
    for w in range(max(0, week - compare_weeks + 1), week + 1):
        week_keys = _get_week_day_keys(w, days_per_week)
        stats = _compute_weekly_stats(logs, week_keys)
        stats["week"] = w
        weeks_data.append(stats)

    # Compute momentum: is volume/frequency trending up or down?
    momentum = {"direction": "stable", "volume_trend": 0.0, "frequency_trend": 0.0}
    if len(weeks_data) >= 2:
        recent = weeks_data[-1]
        prev = weeks_data[-2]

        vol_change = recent["total_volume_kg"] - prev["total_volume_kg"]
        freq_change = recent["total_sessions"] - prev["total_sessions"]

        momentum["volume_trend"] = round(vol_change, 1)
        momentum["frequency_trend"] = freq_change

        if vol_change > 0 and freq_change >= 0:
            momentum["direction"] = "increasing"
        elif vol_change < 0 and freq_change <= 0:
            momentum["direction"] = "decreasing"
        elif vol_change > 0 or freq_change > 0:
            momentum["direction"] = "mixed"

    # Longer-term trend (4-week rolling average vs prior 4 weeks)
    if len(weeks_data) >= 4:
        recent_avg = sum(w["total_volume_kg"] for w in weeks_data[-2:]) / 2
        older_avg = sum(w["total_volume_kg"] for w in weeks_data[:-2]) / max(
            len(weeks_data) - 2, 1
        )
        if older_avg > 0:
            momentum["volume_change_pct"] = round(
                ((recent_avg - older_avg) / older_avg) * 100, 1
            )

    return {
        "username": username,
        "current_week": week,
        "weeks": weeks_data,
        "momentum": momentum,
        "days_per_week": days_per_week,
    }


# ══════════════════════════════════════════════════════════════════
# REVIEW STORAGE (CRUD)
# ══════════════════════════════════════════════════════════════════

@router.post("/users/{username}/reviews")
async def create_review(
    username: str,
    req: ReviewCreateRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Store a generated review (daily or weekly) in the user's data."""
    users = load_users()
    if username not in users:
        raise HTTPException(404, "User not found")

    if req.type not in ("daily", "weekly"):
        raise HTTPException(400, "Review type must be 'daily' or 'weekly'")

    user_data = load_user_data(username)
    reviews = user_data.setdefault("reviews", [])

    review = {
        "id": f"rev_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "type": req.type,
        "content": req.content,
        "date": req.date,
        "metrics": req.metrics,
        "generated_by": req.generated_by,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "emailed": False,
    }

    reviews.append(review)

    # Keep last 200 reviews
    if len(reviews) > 200:
        user_data["reviews"] = reviews[-200:]

    save_user_data(username, user_data)
    return {"ok": True, "review": review}


@router.get("/users/{username}/reviews")
async def get_reviews(
    username: str,
    coach: Annotated[dict, Depends(require_coach)],
    type: Optional[str] = Query(None, description="Filter by 'daily' or 'weekly'"),
    limit: int = Query(20, description="Max reviews to return"),
):
    """Retrieve stored reviews for an athlete."""
    users = load_users()
    if username not in users:
        raise HTTPException(404, "User not found")

    user_data = load_user_data(username)
    reviews = user_data.get("reviews", [])

    if type:
        reviews = [r for r in reviews if r.get("type") == type]

    # Return most recent first
    reviews = sorted(reviews, key=lambda r: r.get("created_at", ""), reverse=True)
    return {"reviews": reviews[:limit]}


@router.get("/users/{username}/reviews/{review_id}")
async def get_review(
    username: str,
    review_id: str,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Get a single review by ID."""
    user_data = load_user_data(username)
    reviews = user_data.get("reviews", [])

    for r in reviews:
        if r.get("id") == review_id:
            return r

    raise HTTPException(404, "Review not found")


@router.delete("/users/{username}/reviews/{review_id}")
async def delete_review(
    username: str,
    review_id: str,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Delete a review."""
    user_data = load_user_data(username)
    reviews = user_data.get("reviews", [])
    user_data["reviews"] = [r for r in reviews if r.get("id") != review_id]
    save_user_data(username, user_data)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════
# EMAIL
# ══════════════════════════════════════════════════════════════════

@router.post("/send-review-email")
async def send_review_email(
    req: SendReviewEmailRequest,
    coach: Annotated[dict, Depends(require_coach)],
):
    """Send a review via email to coach and/or athlete.

    Requires these environment variables:
        SMTP_HOST      - e.g. smtp.gmail.com
        SMTP_PORT      - e.g. 587
        SMTP_USER      - your email address
        SMTP_PASSWORD  - app password (not your regular password)
        COACH_EMAIL    - default coach email (can be overridden per request)
    """
    import os

    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASSWORD", "")
    default_coach_email = os.environ.get("COACH_EMAIL", "")

    if not smtp_user or not smtp_pass:
        raise HTTPException(
            500,
            "Email not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, "
            "SMTP_PASSWORD environment variables.",
        )

    # Load the review
    user_data = load_user_data(req.username)
    reviews = user_data.get("reviews", [])
    review = None
    for r in reviews:
        if r.get("id") == req.review_id:
            review = r
            break

    if not review:
        raise HTTPException(404, "Review not found")

    # Get email addresses
    users = load_users()
    athlete_email = users.get(req.username, {}).get("email", "")
    coach_email = req.coach_email or default_coach_email

    recipients = []
    if req.send_to_coach and coach_email:
        recipients.append(coach_email)
    if req.send_to_athlete and athlete_email:
        recipients.append(athlete_email)

    if not recipients:
        raise HTTPException(400, "No email recipients found")

    # Build the email
    review_type = review.get("type", "daily").title()
    review_date = review.get("date", "")
    subject = f"NumNum {review_type} Review — {req.username} — {review_date}"

    # Build HTML email
    html_body = f"""
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                 max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 20px; border-radius: 12px 12px 0 0; color: white;">
            <h1 style="margin: 0; font-size: 22px;">NumNum {review_type} Review</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">{req.username} — {review_date}</p>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 12px 12px;
                    border: 1px solid #e9ecef; border-top: none;">
            <div style="white-space: pre-wrap; line-height: 1.6;">
{review.get("content", "")}
            </div>
        </div>
        <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
            Sent by NumNum Workout — numnum.fit
        </p>
    </body>
    </html>
    """

    plain_body = f"{review_type} Review for {req.username} — {review_date}\n\n"
    plain_body += review.get("content", "")

    # Send emails
    errors = []
    for recipient in recipients:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = smtp_user
            msg["To"] = recipient

            msg.attach(MIMEText(plain_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, recipient, msg.as_string())

        except Exception as e:
            errors.append({"recipient": recipient, "error": str(e)})

    # Mark review as emailed
    review["emailed"] = True
    review["emailed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    review["emailed_to"] = recipients
    save_user_data(req.username, user_data)

    if errors:
        return {"ok": False, "sent": len(recipients) - len(errors), "errors": errors}

    return {"ok": True, "sent_to": recipients}


# ══════════════════════════════════════════════════════════════════
# BULK: ALL ATHLETES PENDING REVIEWS
# ══════════════════════════════════════════════════════════════════

@router.get("/reviews/pending-daily")
async def get_pending_daily_reviews(
    coach: Annotated[dict, Depends(require_coach)],
):
    """List all athletes who had a workout yesterday but no daily review yet.

    Useful for the scheduled daily review task to know who needs a review.
    """
    users = load_users()
    pending = []

    for username, info in users.items():
        if info.get("role") == "coach":
            continue

        user_data = load_user_data(username)
        days_per_week = _get_days_per_week(user_data)
        current_week = _determine_current_week(user_data)
        logs = user_data.get("workout_logs", {})

        # Find the most recent logged day
        day_nums = sorted(
            (int(k.replace("day_", "")) for k in logs if k.startswith("day_")),
            reverse=True,
        )
        if not day_nums:
            continue

        latest_day_key = f"day_{day_nums[0]}"
        latest_log = logs[latest_day_key]

        # Check if a daily review already exists for this day
        reviews = user_data.get("reviews", [])
        already_reviewed = any(
            r.get("type") == "daily"
            and r.get("metrics", {}).get("day_key") == latest_day_key
            for r in reviews
        )

        if not already_reviewed:
            pending.append({
                "username": username,
                "email": info.get("email", ""),
                "program": info.get("program", ""),
                "latest_day_key": latest_day_key,
                "saved_at": latest_log.get("saved_at", ""),
            })

    return {"pending": pending}


@router.get("/reviews/pending-weekly")
async def get_pending_weekly_reviews(
    coach: Annotated[dict, Depends(require_coach)],
):
    """List athletes who haven't had a weekly review for their most recent full week."""
    users = load_users()
    pending = []

    for username, info in users.items():
        if info.get("role") == "coach":
            continue

        user_data = load_user_data(username)
        days_per_week = _get_days_per_week(user_data)
        current_week = _determine_current_week(user_data)

        # Check the previous week (current week may be in progress)
        review_week = max(0, current_week - 1)

        reviews = user_data.get("reviews", [])
        already_reviewed = any(
            r.get("type") == "weekly"
            and r.get("metrics", {}).get("week") == review_week
            for r in reviews
        )

        if not already_reviewed and current_week > 0:
            week_keys = _get_week_day_keys(review_week, days_per_week)
            logs = user_data.get("workout_logs", {})
            sessions = sum(1 for dk in week_keys if dk in logs)

            if sessions > 0:
                pending.append({
                    "username": username,
                    "email": info.get("email", ""),
                    "program": info.get("program", ""),
                    "week": review_week,
                    "sessions_completed": sessions,
                    "sessions_planned": days_per_week,
                })

    return {"pending": pending}


# ══════════════════════════════════════════════════════════════════
# AUTO-REVIEW GENERATION (server-side, no LLM needed)
# ══════════════════════════════════════════════════════════════════

def _generate_daily_review_text(username: str, exercises: list, prior_weeks: list) -> str:
    """Generate a data-driven daily review from workout data."""
    if not exercises:
        return f"No exercise data found for {username}'s latest session."

    lines = [f"Daily Review for {username}\n"]

    total_vol = 0
    best_lift = ""
    best_weight = 0.0
    for ex in exercises:
        vol = _compute_exercise_volume(ex)
        total_vol += vol["total_volume_kg"]
        if vol["best_weight_kg"] > best_weight:
            best_weight = vol["best_weight_kg"]
            best_lift = vol["name"]

    num_exercises = len(exercises)
    total_sets = sum(len(ex.get("sets", [])) for ex in exercises)
    lines.append(f"You completed {num_exercises} exercises across {total_sets} sets for a total volume of {round(total_vol)}kg.")

    if best_lift:
        lines.append(f"Heaviest lift: {best_lift} at {best_weight}kg.")

    if prior_weeks:
        prior_vols = []
        for pw in prior_weeks:
            pv = sum(_compute_exercise_volume(ex)["total_volume_kg"] for ex in pw.get("exercises", []))
            prior_vols.append(pv)
        if prior_vols:
            avg_prior = sum(prior_vols) / len(prior_vols)
            if avg_prior > 0:
                change_pct = round(((total_vol - avg_prior) / avg_prior) * 100, 1)
                if change_pct > 5:
                    lines.append(f"Volume is up {change_pct}% compared to your average of {round(avg_prior)}kg over the last {len(prior_vols)} session(s) — great progress!")
                elif change_pct < -5:
                    lines.append(f"Volume is down {abs(change_pct)}% compared to your recent average of {round(avg_prior)}kg. Could be recovery — if not, push a bit harder next time.")
                else:
                    lines.append(f"Volume is consistent with your recent sessions (avg {round(avg_prior)}kg) — solid consistency.")

        improvements = []
        for ex in exercises:
            ev = _compute_exercise_volume(ex)
            for pw in prior_weeks:
                for pex in pw.get("exercises", []):
                    if pex.get("name") == ex.get("name"):
                        pev = _compute_exercise_volume(pex)
                        if ev["best_weight_kg"] > pev["best_weight_kg"] and pev["best_weight_kg"] > 0:
                            improvements.append(f"{ev['name']} (+{round(ev['best_weight_kg'] - pev['best_weight_kg'], 1)}kg)")
                        break
                if improvements:
                    break
        if improvements:
            lines.append(f"Weight increases: {', '.join(improvements[:3])}. Keep it up!")

    lines.append("\nKeep pushing — consistency builds results!")
    return "\n".join(lines)


def _generate_weekly_review_text(username: str, week_stats: dict, prior_stats: list, momentum: dict) -> str:
    """Generate a data-driven weekly review."""
    lines = [f"Weekly Review for {username}\n"]

    sessions = week_stats.get("total_sessions", 0)
    target = week_stats.get("sessions_target", 0)
    volume = round(week_stats.get("total_volume_kg", 0))
    completion = week_stats.get("completion_pct", 0)

    lines.append(f"Sessions: {sessions}/{target} completed ({completion}% completion).")
    lines.append(f"Total volume: {volume}kg across {week_stats.get('total_sets', 0)} sets.")

    direction = momentum.get("direction", "stable")
    vol_trend = momentum.get("volume_trend", 0)
    vol_pct = momentum.get("volume_change_pct")

    if direction == "increasing":
        lines.append(f"Momentum: Trending UP — volume increased by {round(vol_trend)}kg from last week.")
    elif direction == "decreasing":
        lines.append(f"Momentum: Volume dropped by {abs(round(vol_trend))}kg from last week. If planned recovery, great. Otherwise, aim to push back up.")
    elif direction == "mixed":
        lines.append(f"Momentum: Mixed — some metrics up, some down. Volume change: {round(vol_trend)}kg.")
    else:
        lines.append("Momentum: Stable and consistent — great discipline!")

    if vol_pct is not None:
        if vol_pct > 0:
            lines.append(f"Longer-term trend: volume up {vol_pct}% over the recent training block.")
        elif vol_pct < 0:
            lines.append(f"Longer-term trend: volume down {abs(vol_pct)}% — worth monitoring.")

    if prior_stats and len(prior_stats) >= 2:
        traj = " → ".join(f"{round(w.get('total_volume_kg', 0))}kg" for w in prior_stats[-4:])
        lines.append(f"Volume trajectory: {traj}")

    if completion >= 90:
        lines.append("\nExcellent consistency — keep it going!")
    elif completion >= 70:
        lines.append("\nGood week. Try to hit all sessions next week!")
    elif sessions > 0:
        lines.append("\nYou showed up — that matters. Let's aim higher next week.")

    return "\n".join(lines)


def _send_review_email(recipient: str, subject: str, content: str) -> Optional[str]:
    """Send an email, return error string or None on success."""
    import os
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASSWORD", os.environ.get("SMTP_PASS", ""))

    if not smtp_user or not smtp_pass:
        return "SMTP not configured"

    try:
        html_body = f"""<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px 12px 0 0; color: white;">
                <h1 style="margin: 0; font-size: 22px;">NumNum Workout Review</h1>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef; border-top: none;">
                <div style="white-space: pre-wrap; line-height: 1.6;">{content}</div>
            </div>
            <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">Sent by NumNum Workout — numnum.fit</p>
        </body></html>"""

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = recipient
        msg.attach(MIMEText(content, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, recipient, msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, recipient, msg.as_string())
        return None
    except Exception as e:
        return str(e)


@router.get("/cron/test-email")
async def cron_test_email(key: str = Query(..., description="SECRET_KEY for auth")):
    """Send a test email to the coach to verify SMTP works."""
    import os
    if key != os.environ.get("SECRET_KEY", ""):
        raise HTTPException(403, "Invalid key")

    coach_email = os.environ.get("COACH_EMAIL", "")
    if not coach_email:
        return {"ok": False, "error": "COACH_EMAIL not set"}

    loop = asyncio.get_event_loop()
    logger.info(f"Sending test email to {coach_email}...")
    try:
        err = await loop.run_in_executor(
            None,
            partial(_send_review_email, coach_email, "NumNum SMTP Test", "If you see this, SMTP is working!"),
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}

    if err:
        return {"ok": False, "error": err}
    return {"ok": True, "sent_to": coach_email}


@router.get("/cron/test")
async def cron_test(key: str = Query(..., description="SECRET_KEY for auth")):
    """Quick test endpoint to verify cron connectivity and SMTP config."""
    import os
    if key != os.environ.get("SECRET_KEY", ""):
        raise HTTPException(403, "Invalid key")

    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASSWORD", os.environ.get("SMTP_PASS", ""))
    coach_email = os.environ.get("COACH_EMAIL", "")
    users = load_users()
    athlete_count = sum(1 for u, i in users.items() if i.get("role") != "coach")

    return {
        "ok": True,
        "smtp_configured": bool(smtp_user and smtp_pass),
        "smtp_user": smtp_user[:3] + "***" if smtp_user else "",
        "coach_email": coach_email[:3] + "***" if coach_email else "",
        "athlete_count": athlete_count,
    }


@router.get("/cron/daily-reviews")
async def cron_daily_reviews(key: str = Query(..., description="SECRET_KEY for auth"),
                             dry_run: bool = Query(False, description="Skip email sending")):
    """Server-side cron: generate + email daily reviews for all pending athletes.

    Call: GET /api/admin/cron/daily-reviews?key=YOUR_SECRET_KEY
    Add &dry_run=true to skip emails and just test review generation.
    """
    import os
    if key != os.environ.get("SECRET_KEY", ""):
        raise HTTPException(403, "Invalid key")

    logger.info(f"Daily review cron started (dry_run={dry_run})")
    coach_email = os.environ.get("COACH_EMAIL", "")
    users = load_users()
    results = []
    loop = asyncio.get_event_loop()

    for username, info in users.items():
        if info.get("role") == "coach":
            continue

        logger.info(f"Checking daily review for {username}")
        user_data = load_user_data(username)
        logs = user_data.get("workout_logs", {})
        days_per_week = _get_days_per_week(user_data)

        day_nums = sorted(
            (int(k.replace("day_", "")) for k in logs if k.startswith("day_")),
            reverse=True,
        )
        if not day_nums:
            logger.info(f"  {username}: no workout logs, skipping")
            continue

        latest_day_key = f"day_{day_nums[0]}"
        reviews = user_data.get("reviews", [])
        already = any(
            r.get("type") == "daily" and r.get("metrics", {}).get("day_key") == latest_day_key
            for r in reviews
        )
        if already:
            logger.info(f"  {username}: already reviewed {latest_day_key}, skipping")
            continue

        current_exercises = _extract_exercise_data(logs[latest_day_key])
        if not current_exercises:
            logger.info(f"  {username}: no exercises in {latest_day_key}, skipping")
            continue

        prior = _find_same_workout_prior_weeks(logs, latest_day_key, days_per_week, 4)
        review_text = _generate_daily_review_text(username, current_exercises, prior)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        review = {
            "id": f"rev_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            "type": "daily", "content": review_text, "date": today,
            "metrics": {"day_key": latest_day_key},
            "generated_by": "cron",
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "emailed": False,
        }
        reviews.append(review)
        if len(reviews) > 200:
            user_data["reviews"] = reviews[-200:]

        athlete_email = info.get("email", "")
        recipients, errors = [], []
        if not dry_run:
            for addr in [coach_email, athlete_email]:
                if addr:
                    logger.info(f"  Emailing {addr}...")
                    try:
                        err = await loop.run_in_executor(
                            None,
                            partial(_send_review_email, addr, f"NumNum Daily Review — {username} — {today}", review_text),
                        )
                        if err:
                            logger.warning(f"  Email error for {addr}: {err}")
                            errors.append(err)
                        else:
                            logger.info(f"  Email sent to {addr}")
                            recipients.append(addr)
                    except Exception as e:
                        logger.error(f"  Email exception for {addr}: {e}")
                        errors.append(str(e))
        else:
            logger.info(f"  Dry run — skipping email for {username}")

        review["emailed"] = len(recipients) > 0
        review["emailed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        review["emailed_to"] = recipients
        save_user_data(username, user_data)

        results.append({"username": username, "day_key": latest_day_key, "emailed_to": recipients, "errors": errors,
                        "review_preview": review_text[:200] if dry_run else None})

    logger.info(f"Daily review cron done: {len(results)} reviews generated")
    return {"ok": True, "reviewed": len(results), "dry_run": dry_run, "results": results}


@router.get("/cron/weekly-reviews")
async def cron_weekly_reviews(key: str = Query(..., description="SECRET_KEY for auth")):
    """Server-side cron: generate + email weekly reviews.

    Call: GET /api/admin/cron/weekly-reviews?key=YOUR_SECRET_KEY
    """
    import os
    if key != os.environ.get("SECRET_KEY", ""):
        raise HTTPException(403, "Invalid key")

    logger.info("Weekly review cron started")
    coach_email = os.environ.get("COACH_EMAIL", "")
    users = load_users()
    results = []
    loop = asyncio.get_event_loop()

    for username, info in users.items():
        if info.get("role") == "coach":
            continue

        logger.info(f"Checking weekly review for {username}")
        user_data = load_user_data(username)
        logs = user_data.get("workout_logs", {})
        days_per_week = _get_days_per_week(user_data)
        current_week = _determine_current_week(user_data)
        review_week = max(0, current_week - 1)

        if current_week == 0:
            continue

        reviews = user_data.get("reviews", [])
        already = any(
            r.get("type") == "weekly" and r.get("metrics", {}).get("week") == review_week
            for r in reviews
        )
        if already:
            logger.info(f"  {username}: already reviewed week {review_week}, skipping")
            continue

        week_keys = _get_week_day_keys(review_week, days_per_week)
        week_stats = _compute_weekly_stats(logs, week_keys)
        if week_stats["total_sessions"] == 0:
            logger.info(f"  {username}: no sessions in week {review_week}, skipping")
            continue

        all_weeks_stats = []
        for w in range(max(0, review_week - 3), review_week + 1):
            wk = _get_week_day_keys(w, days_per_week)
            ws = _compute_weekly_stats(logs, wk)
            ws["week"] = w
            all_weeks_stats.append(ws)

        momentum = {"direction": "stable", "volume_trend": 0.0, "frequency_trend": 0.0}
        if len(all_weeks_stats) >= 2:
            recent, prev = all_weeks_stats[-1], all_weeks_stats[-2]
            vol_change = recent["total_volume_kg"] - prev["total_volume_kg"]
            freq_change = recent["total_sessions"] - prev["total_sessions"]
            momentum["volume_trend"] = round(vol_change, 1)
            momentum["frequency_trend"] = freq_change
            if vol_change > 0 and freq_change >= 0:
                momentum["direction"] = "increasing"
            elif vol_change < 0 and freq_change <= 0:
                momentum["direction"] = "decreasing"
            elif vol_change > 0 or freq_change > 0:
                momentum["direction"] = "mixed"
        if len(all_weeks_stats) >= 4:
            recent_avg = sum(w["total_volume_kg"] for w in all_weeks_stats[-2:]) / 2
            older_avg = sum(w["total_volume_kg"] for w in all_weeks_stats[:-2]) / max(len(all_weeks_stats) - 2, 1)
            if older_avg > 0:
                momentum["volume_change_pct"] = round(((recent_avg - older_avg) / older_avg) * 100, 1)

        review_text = _generate_weekly_review_text(username, week_stats, all_weeks_stats, momentum)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        review = {
            "id": f"rev_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            "type": "weekly", "content": review_text, "date": today,
            "metrics": {"week": review_week, "total_sessions": week_stats["total_sessions"],
                        "total_volume_kg": week_stats["total_volume_kg"],
                        "completion_pct": week_stats["completion_pct"],
                        "momentum_direction": momentum["direction"]},
            "generated_by": "cron",
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "emailed": False,
        }
        reviews.append(review)
        if len(reviews) > 200:
            user_data["reviews"] = reviews[-200:]

        athlete_email = info.get("email", "")
        recipients, errors = [], []
        for addr in [coach_email, athlete_email]:
            if addr:
                logger.info(f"  Emailing {addr}...")
                err = await loop.run_in_executor(
                    None,
                    partial(_send_review_email, addr, f"NumNum Weekly Review — {username} — Week {review_week}", review_text),
                )
                if err:
                    logger.warning(f"  Email error for {addr}: {err}")
                    errors.append(err)
                else:
                    logger.info(f"  Email sent to {addr}")
                    recipients.append(addr)

        review["emailed"] = len(recipients) > 0
        review["emailed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        review["emailed_to"] = recipients
        save_user_data(username, user_data)

        results.append({"username": username, "week": review_week, "emailed_to": recipients, "errors": errors})

    logger.info(f"Weekly review cron done: {len(results)} reviews generated")
    return {"ok": True, "reviewed": len(results), "results": results}
