import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).parent.parent  # workout-app/
load_dotenv(APP_DIR / ".env", override=False)

# Server
PORT = int(os.environ.get("PORT", os.environ.get("NUMNUM_PORT", 5050)))
APP_URL = os.environ.get("APP_URL", f"http://localhost:{PORT}")

# Auth
SECRET_KEY = os.environ.get("SECRET_KEY", secrets.token_urlsafe(64))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# CORS
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", f"http://localhost:{PORT},http://127.0.0.1:{PORT},https://numnum.fit")

# SMTP
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")

# Whoop
WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
WHOOP_API_BASE = "https://api.prod.whoop.com/developer"
WHOOP_SCOPES = "read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement"

# Encryption
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")

# Data paths
USERS_FILE = APP_DIR / "users.json"
DATA_DIR = APP_DIR / "user_data"
WHOOP_CONFIG_FILE = APP_DIR / "whoop_config.json"
WHOOP_TOKENS_FILE = APP_DIR / "whoop_tokens.json"
METRICS_FILE = APP_DIR / "user_metrics.json"
