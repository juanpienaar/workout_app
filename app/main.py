"""FastAPI application entry point."""

import json
import shutil
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from fastapi.exceptions import RequestValidationError

import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

from . import config
from .encryption import migrate_tokens_file
from .logger import log_event
from .routes import auth_routes, workout_routes, metrics_routes, coach_routes, verify_routes, whoop_routes, admin_routes, review_routes

app = FastAPI(title="NumNum Workout", version="1.0.0")

# ---- HTTPS enforcement (production only) ----
class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        proto = request.headers.get("x-forwarded-proto", "https")
        if proto == "http" and os.environ.get("RAILWAY_ENVIRONMENT"):
            url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(url), status_code=301)
        return await call_next(request)

app.add_middleware(HTTPSRedirectMiddleware)

# ---- Rate limiting ----
app.state.limiter = auth_routes.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---- Validation error logging ----
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    body = None
    try:
        body = await request.body()
        body = body.decode("utf-8")[:500]
    except Exception:
        pass
    log_event("validation_error", "error", f"Request validation failed: {request.url.path}", {
        "path": str(request.url.path),
        "method": request.method,
        "errors": [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()],
        "body_preview": body,
    })
    return JSONResponse(status_code=422, content={
        "detail": [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()],
    })

# ---- CORS ----
origins = [o.strip() for o in config.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Routers ----
app.include_router(auth_routes.router)
app.include_router(workout_routes.router)
app.include_router(metrics_routes.router)
app.include_router(coach_routes.router)
app.include_router(verify_routes.router)
app.include_router(whoop_routes.router)
app.include_router(admin_routes.router)
app.include_router(review_routes.router)


# ---- Health check ----
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# ---- Serve data files from volume (overrides static mount) ----
@app.get("/program.json")
async def serve_program():
    # Load programs
    pdata = {"programs": {}}
    if config.PROGRAM_FILE.exists():
        with open(config.PROGRAM_FILE) as f:
            pdata = json.load(f)
    # Merge current users (the athlete app expects users inside program.json)
    if config.USERS_FILE.exists():
        with open(config.USERS_FILE) as f:
            users = json.load(f)
        # Only include non-sensitive fields (no passwordHash)
        pdata["users"] = {}
        for name, info in users.items():
            pdata["users"][name] = {
                "program": info.get("program", ""),
                "startDate": info.get("startDate", ""),
                "email": info.get("email", ""),
                "email_verified": info.get("email_verified", False),
            }
    return JSONResponse(pdata)

@app.get("/exercises.json")
async def serve_exercises():
    if config.EXERCISES_FILE.exists():
        with open(config.EXERCISES_FILE) as f:
            return JSONResponse(json.load(f))
    return JSONResponse({})


# ---- Seed volume on first deploy ----
def seed_volume():
    """Copy data files from app dir to persistent volume if they don't exist yet."""
    if config.DATA_ROOT == config.APP_DIR:
        return  # Local dev — no volume, nothing to seed

    config.DATA_ROOT.mkdir(parents=True, exist_ok=True)
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Files to seed from the git repo into the volume
    seed_files = [
        "users.json", "program.json", "exercises.json", "program.csv",
        "whoop_config.json", "whoop_tokens.json", "user_metrics.json",
    ]
    for fname in seed_files:
        src = config.APP_DIR / fname
        dst = config.DATA_ROOT / fname
        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)
            print(f"  Seeded {fname} → volume")

    # Seed user_data directory
    src_ud = config.APP_DIR / "user_data"
    if src_ud.exists() and not config.DATA_DIR.exists():
        shutil.copytree(src_ud, config.DATA_DIR)
        print(f"  Seeded user_data/ → volume")


# ---- Startup ----
@app.on_event("startup")
async def startup():
    seed_volume()
    migrate_tokens_file()
    print(f"\n  NumNum Workout (FastAPI)")
    print(f"  http://localhost:{config.PORT}")
    print(f"  Data root: {config.DATA_ROOT}")
    print(f"  CORS origins: {origins}")
    print()


# ---- Static files ----
# Admin dashboard at /admin (React build output)
admin_dist = config.APP_DIR / "admin" / "dist"
if admin_dist.exists():
    app.mount("/admin", StaticFiles(directory=str(admin_dist), html=True), name="admin-static")

# Root serves index.html, program.json, exercises.json, etc. (LAST so API routes take priority)
app.mount("/", StaticFiles(directory=str(config.APP_DIR), html=True), name="static")
