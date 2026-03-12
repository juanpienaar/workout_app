# NumNum Workout — Claude Code Context

## Project Overview
NumNum Workout (numnum.fit) is a fitness coaching platform with two surfaces:
- **Athlete app** — mobile-first PWA served as `index.html` (vanilla HTML/CSS/JS, ~3500 lines)
- **Admin dashboard** — coach-facing SPA at `/admin` (React + Vite, built to `admin/dist/`)
- **Backend** — Python FastAPI with JWT auth, served on Railway

Design system: **Obsidian Flow** — purple `#7c6ef0` → lavender `#a78bfa` → teal `#2dd4bf`.

---

## Repository Structure

```
/
├── index.html              # Athlete app (monolithic PWA)
├── run.py                  # Entry point (uvicorn launcher)
├── build.py                # CSV → program.json builder (CLI + called by admin)
├── update.sh               # Git helper: rebuild from CSV and push
├── app/                    # FastAPI backend
│   ├── main.py             # App entry, CORS, rate limiting, static mounts
│   ├── config.py           # All config + env vars + file paths
│   ├── auth.py             # JWT auth, password hashing
│   ├── data.py             # JSON file I/O for user data
│   ├── encryption.py       # Fernet encryption for wearable tokens
│   ├── ai_builder.py       # Claude AI program generation
│   ├── models.py           # Pydantic request models
│   └── routes/
│       ├── auth_routes.py      # Login, refresh, forgot/reset password
│       ├── admin_routes.py     # Coach CRUD: users, programs, exercises, AI, deploy
│       ├── workout_routes.py   # save-day, sync-all, save-whoop
│       ├── metrics_routes.py   # Body metrics
│       ├── whoop_routes.py     # Whoop OAuth + data sync
│       ├── coach_routes.py     # Coach-facing user list
│       └── verify_routes.py    # Email verification
├── admin-react/            # React admin dashboard source
│   ├── src/
│   │   ├── App.jsx         # Routing (HashRouter)
│   │   ├── api.js          # API client with JWT + refresh
│   │   ├── auth.jsx        # Auth context provider
│   │   ├── theme.css       # Obsidian Flow dashboard styles
│   │   ├── pages/          # Dashboard, Users, Programs, Exercises, AIBuilder, Deploy
│   │   └── components/     # Layout, Toast, Icons
│   └── vite.config.js
├── admin/dist/             # Built dashboard (committed, served by FastAPI)
├── user_data/              # Per-athlete JSON files (on Railway volume)
├── tests/                  # pytest tests for FastAPI backend
│   ├── conftest.py         # Fixtures: isolated data dir, test client, seed users
│   ├── test_health.py      # Smoke tests
│   ├── test_auth.py        # Login, refresh, auth guards
│   └── test_workout.py     # save-day, sync-all, data retrieval
├── program.json            # Generated program data (from CSV or AI)
├── program.csv             # Source program spreadsheet
├── exercises.json          # Exercise database
├── requirements.txt        # Python dependencies
├── requirements-dev.txt    # Dev/test dependencies (pytest, httpx)
├── pytest.ini              # pytest config
├── Procfile                # Railway/Heroku: web: python run.py
├── nixpacks.toml           # Railway build config
├── .claudeignore           # Files Claude Code should skip
├── .env.example            # Env var template
└── CLAUDE.md
```

> Do NOT read `node_modules/`, `admin-react/node_modules/`, `admin/dist/`, or `.env`.
> Start in the relevant directory for the surface you're working on.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Athlete app | Vanilla HTML/CSS/JS (single `index.html` PWA) |
| Admin dashboard | React 18 + Vite, built to `admin/dist/` |
| Backend | Python FastAPI, uvicorn |
| Auth | JWT (access + refresh tokens), passlib + bcrypt |
| Data storage | JSON files on disk (`user_data/{username}.json`) |
| Deployment | Railway (auto-deploy on push to `main`) |
| AI | Anthropic Claude API (program generation + modification) |
| Rate limiting | SlowAPI on auth endpoints |
| Design tokens | `--accent: #7c6ef0`, `--nn-warm: #a78bfa`, `--nn-gold: #2dd4bf` |

---

## Environment Variables

Never hardcode secrets. Reference `.env.example` for required variables.

Key variables (names only):
- `SECRET_KEY` — JWT signing key
- `ENCRYPTION_KEY` — Whoop token encryption
- `ANTHROPIC_API_KEY` — Claude AI for program generation
- `SMTP_USER` / `SMTP_PASS` — Gmail for password reset emails
- `RAILWAY_VOLUME_MOUNT_PATH` — Persistent storage path on Railway

---

## Setup Commands

### Local development
```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 5050
```

### Admin dashboard
```bash
cd admin-react
npm install
npm run dev          # Vite dev server (proxied)
npm run build        # Build to ../admin/dist/
```

### Run tests
```bash
pip install -r requirements-dev.txt
pytest -v
```

### Deploy
```bash
git add -A && git commit -m "message" && git push
# Railway auto-deploys from main branch
```

---

## Data Flow

```
Athlete app (index.html)
    ↓ POST /api/save-day (JWT auth)
    ↓ POST /api/sync-all (bulk on login)
user_data/{username}.json on server
    ↓ GET /api/admin/users/{username}/data (coach auth)
Admin Dashboard (React)
```

### Athlete data format
```json
{
  "workout_logs": {
    "day_0": {
      "data": {
        "1_Bench_Press": {
          "set1": {"weight": "80", "reps": "10", "done": true},
          "set2": {"weight": "85", "reps": "8", "done": true}
        }
      },
      "meta": {"week": 1, "day": 1, "date": "2026-03-01", "label": "Push"},
      "saved_at": "2026-03-01T10:00:00Z"
    }
  },
  "whoop_snapshots": [],
  "metrics": []
}
```

Exercise keys follow the pattern: `{order}_{Exercise_Name}` (spaces → underscores).
Sets are objects keyed `set1`, `set2`, etc. — NOT arrays.

---

## Key Domain Concepts

- **Athlete** — end user of the mobile app
- **Coach** — admin dashboard user (role: "coach")
- **Program** — structured training plan with weeks → days → exercise groups
- **Exercise group** — single, superset, or circuit
- **Day key** — `day_{index}` where index is 0-based across all program days
- **Tonnage** — weight × reps summed across sets (excludes cardio)
- **Cardio types** — detected by name keywords: running, cycling, swimming

---

## Code Conventions

- **Athlete app** — all in `index.html`; functions are global; data in localStorage + server sync
- **Admin dashboard** — functional React components, hooks, JSX
- **Backend** — FastAPI routers with Pydantic models; `require_coach` dependency for admin routes
- **Design system** — use Obsidian Flow CSS variables; do not introduce arbitrary colours
- **Equipment icons** — auto-detected from exercise name via `getEquipmentIcon(name)`
- **Cardio detection** — `getCardioType(name)` returns 'running', 'cycling', 'swimming', or null

---

## Important Gotchas

- `bcrypt` must be pinned to `4.0.1` (passlib 1.7.4 incompatibility with 4.1+)
- Admin dashboard must be built (`npm run build` in `admin-react/`) and the `admin/dist/` output committed
- Railway volume must be attached for persistent data; without it, `user_data/` is ephemeral
- The athlete app uses `authFetch()` which handles token refresh automatically
- Program JSON is served as a static file at `/program.json`
- `SECRET_KEY` on Railway should be a fixed value (not auto-generated per deploy)

---

## What NOT to do

- Do not modify the Obsidian Flow colour tokens without explicit instruction
- Do not install new npm packages without listing them and getting confirmation
- Do not delete files — rename or archive instead
- Do not commit `.env` or secrets
- Do not push to `main` without building admin dashboard first
- Do not use `bcrypt >= 4.1` — it breaks passlib

---

## PR / Branch Conventions

- Branch format: `feature/short-description` or `fix/short-description`
- Keep PRs focused — one concern per PR
- Include a brief summary of what changed and why in the PR description

---

## Asking for Clarification

If a task is ambiguous about which surface (athlete app vs dashboard vs backend) is in scope, ask before proceeding.
If a task requires a new external dependency, list the options and ask before installing.
