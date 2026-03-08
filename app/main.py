"""FastAPI application — replaces server.py."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .encryption import migrate_tokens_file
from .routes import auth_routes, workout_routes, metrics_routes, coach_routes, verify_routes, whoop_routes

app = FastAPI(title="NumNum Workout", version="1.0.0")

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


# ---- Health check ----
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# ---- Startup ----
@app.on_event("startup")
async def startup():
    migrate_tokens_file()
    print(f"\n  NumNum Workout (FastAPI)")
    print(f"  http://localhost:{config.PORT}")
    print(f"  CORS origins: {origins}")
    print()


# ---- Static files (serves index.html, program.json, exercises.json, etc.) ----
# Must be LAST so API routes take priority
app.mount("/", StaticFiles(directory=str(config.APP_DIR), html=True), name="static")
