"""
NumNum Workout – Backend Server
Handles Whoop OAuth2 + API proxy, workout data persistence, and coach API.

Run locally:  python server.py
Deploy:       Railway / Render (set env vars)
"""

import os
import json
import time
import base64
import secrets
import http.server
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from datetime import datetime

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import random
import hashlib

APP_DIR = Path(__file__).parent
CONFIG_FILE = APP_DIR / "whoop_config.json"
TOKENS_FILE = APP_DIR / "whoop_tokens.json"
DATA_DIR = APP_DIR / "user_data"
DATA_DIR.mkdir(exist_ok=True)

# In-memory verification code store: {email: {"code": "123456", "expires": timestamp, "user": "name"}}
VERIFICATION_CODES = {}

PORT = int(os.environ.get("PORT", os.environ.get("NUMNUM_PORT", 5050)))

# ==================== WHOOP CONFIG ====================
WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
WHOOP_API_BASE = "https://api.prod.whoop.com/developer"
WHOOP_SCOPES = "read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement"


def load_whoop_config():
    config = {}
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            config = json.load(f)
    return {
        "client_id": os.environ.get("WHOOP_CLIENT_ID", config.get("client_id", "")),
        "client_secret": os.environ.get("WHOOP_CLIENT_SECRET", config.get("client_secret", "")),
        "redirect_uri": os.environ.get("WHOOP_REDIRECT_URI", config.get("redirect_uri", f"http://localhost:{PORT}/whoop/callback")),
    }


def load_tokens():
    if TOKENS_FILE.exists():
        with open(TOKENS_FILE) as f:
            return json.load(f)
    return {}


def save_tokens(tokens):
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


# ==================== DATA PERSISTENCE ====================

def get_user_file(user_key):
    """Get the data file path for a user."""
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in user_key)
    return DATA_DIR / f"{safe_name}.json"


def load_user_data(user_key):
    """Load all persisted data for a user."""
    f = get_user_file(user_key)
    if f.exists():
        with open(f) as fh:
            return json.load(fh)
    return {"workout_logs": {}, "whoop_snapshots": [], "notes": {}}


def save_user_data(user_key, data):
    """Save user data to disk."""
    f = get_user_file(user_key)
    with open(f, "w") as fh:
        json.dump(data, fh, indent=2)


# ==================== TOKEN MANAGEMENT ====================

def refresh_access_token(user_key):
    tokens = load_tokens()
    user_tokens = tokens.get(user_key)
    if not user_tokens or not user_tokens.get("refresh_token"):
        return None

    config = load_whoop_config()
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": user_tokens["refresh_token"],
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
    }).encode()

    req = urllib.request.Request(
        WHOOP_TOKEN_URL, data=data, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "NumNumWorkout/1.0"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            token_data = json.loads(resp.read())
        tokens[user_key] = {
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token", user_tokens["refresh_token"]),
            "expires_at": time.time() + token_data.get("expires_in", 3600),
        }
        save_tokens(tokens)
        return tokens[user_key]["access_token"]
    except Exception as e:
        print(f"[whoop] Token refresh failed: {e}")
        return None


def get_valid_token(user_key):
    tokens = load_tokens()
    user_tokens = tokens.get(user_key)
    if not user_tokens:
        return None
    if time.time() >= user_tokens.get("expires_at", 0) - 60:
        return refresh_access_token(user_key)
    return user_tokens.get("access_token")


def whoop_api_get(user_key, endpoint):
    token = get_valid_token(user_key)
    if not token:
        return None, "not_connected"

    url = f"{WHOOP_API_BASE}{endpoint}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}", "User-Agent": "NumNumWorkout/1.0",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()), None
    except urllib.error.HTTPError as e:
        if e.code == 401:
            new_token = refresh_access_token(user_key)
            if new_token:
                req = urllib.request.Request(url, headers={
                    "Authorization": f"Bearer {new_token}", "User-Agent": "NumNumWorkout/1.0",
                })
                try:
                    with urllib.request.urlopen(req) as resp:
                        return json.loads(resp.read()), None
                except Exception:
                    pass
            return None, "auth_expired"
        return None, f"api_error_{e.code}"
    except Exception as e:
        return None, str(e)


# ==================== PENDING AUTH STATES ====================
pending_auth = {}


# ==================== HTTP HANDLER ====================

class NumNumHandler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except:
            return {}

    # ==================== GET ROUTES ====================
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = dict(urllib.parse.parse_qsl(parsed.query))

        # --- Whoop OAuth: Start ---
        if path == "/whoop/auth":
            user_key = params.get("user")
            if not user_key:
                return self._json_response({"error": "Missing user param"}, 400)
            config = load_whoop_config()
            if not config["client_id"]:
                return self._json_response({"error": "Whoop not configured"}, 500)

            state = secrets.token_urlsafe(32)
            pending_auth[state] = {"user_key": user_key, "created_at": time.time()}

            auth_url = (
                f"{WHOOP_AUTH_URL}?"
                f"client_id={urllib.parse.quote(config['client_id'])}&"
                f"redirect_uri={urllib.parse.quote(config['redirect_uri'])}&"
                f"response_type=code&"
                f"scope={urllib.parse.quote(WHOOP_SCOPES)}&"
                f"state={state}"
            )
            return self._json_response({"auth_url": auth_url})

        # --- Whoop OAuth: Callback ---
        if path == "/whoop/callback":
            code = params.get("code")
            state = params.get("state")
            error = params.get("error")

            if error:
                return self._html_response(f"<h2>Authorization Failed</h2><p>{error}</p><script>setTimeout(()=>window.close(),3000)</script>")
            if not code or not state or state not in pending_auth:
                return self._html_response("<h2>Invalid callback</h2><p>Missing code or invalid state.</p>")

            auth_info = pending_auth.pop(state)
            user_key = auth_info["user_key"]
            config = load_whoop_config()

            data = urllib.parse.urlencode({
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": config["redirect_uri"],
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
            }).encode()

            req = urllib.request.Request(
                WHOOP_TOKEN_URL, data=data, method="POST",
                headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "NumNumWorkout/1.0"},
            )
            try:
                with urllib.request.urlopen(req) as resp:
                    token_data = json.loads(resp.read())
                tokens = load_tokens()
                tokens[user_key] = {
                    "access_token": token_data["access_token"],
                    "refresh_token": token_data.get("refresh_token", ""),
                    "expires_at": time.time() + token_data.get("expires_in", 3600),
                }
                save_tokens(tokens)
                app_url = os.environ.get("APP_URL", f"http://localhost:{PORT}/")
                return self._html_response(
                    "<div style='text-align:center;padding:60px 20px;font-family:system-ui;'>"
                    "<h2 style='color:#00C853;'>Whoop Connected!</h2>"
                    "<p>Redirecting back to the app...</p>"
                    "<script>"
                    "setTimeout(()=>{"
                    "if(window.opener){window.opener.postMessage('whoop_connected','*');window.close();}"
                    f"else{{window.location.href='{app_url}';}}"
                    "},1500);"
                    "</script>"
                    "</div>"
                )
            except urllib.error.HTTPError as e:
                body = e.read().decode('utf-8', errors='replace')
                return self._html_response(f"<h2>Token Exchange Failed</h2><pre>{e.code}: {body}</pre>")
            except Exception as e:
                return self._html_response(f"<h2>Token Exchange Failed</h2><pre>{e}</pre>")

        # --- Whoop Status ---
        if path == "/whoop/status":
            user_key = params.get("user")
            if not user_key:
                return self._json_response({"connected": False})
            tokens = load_tokens()
            connected = user_key in tokens and bool(tokens[user_key].get("access_token"))
            return self._json_response({"connected": connected})

        # --- Whoop Disconnect ---
        if path == "/whoop/disconnect":
            user_key = params.get("user")
            if user_key:
                tokens = load_tokens()
                tokens.pop(user_key, None)
                save_tokens(tokens)
            return self._json_response({"ok": True})

        # --- Whoop Data Endpoints ---
        if path == "/whoop/recovery":
            return self._whoop_proxy(params.get("user"), "/v2/recovery?limit=1")
        if path == "/whoop/sleep":
            return self._whoop_proxy(params.get("user"), "/v2/activity/sleep?limit=1")
        if path == "/whoop/strain":
            return self._whoop_proxy(params.get("user"), "/v2/cycle?limit=1")
        if path == "/whoop/workout":
            return self._whoop_proxy(params.get("user"), "/v2/activity/workout?limit=1")

        # --- Whoop Summary (all in one) ---
        if path == "/whoop/summary":
            user_key = params.get("user")
            if not user_key:
                return self._json_response({"error": "Missing user"}, 400)
            result = {}
            data, err = whoop_api_get(user_key, "/v2/recovery?limit=1")
            if err:
                return self._json_response({"error": err}, 401 if "auth" in str(err) else 502)
            result["recovery"] = data
            data, err = whoop_api_get(user_key, "/v2/cycle?limit=1")
            if not err:
                result["strain"] = data
            data, err = whoop_api_get(user_key, "/v2/activity/sleep?limit=1")
            if not err:
                result["sleep"] = data
            return self._json_response(result)

        # --- User Data: Load workout logs ---
        if path == "/api/data":
            user_key = params.get("user")
            if not user_key:
                return self._json_response({"error": "Missing user"}, 400)
            user_data = load_user_data(user_key)
            return self._json_response(user_data)

        # --- Coach: List all users with data ---
        if path == "/api/coach/users":
            users = []
            for f in DATA_DIR.glob("*.json"):
                user_key = f.stem
                data = load_user_data(user_key)
                log_count = len(data.get("workout_logs", {}))
                whoop_count = len(data.get("whoop_snapshots", []))
                latest_log = None
                if data.get("workout_logs"):
                    latest_log = max(data["workout_logs"].keys())
                users.append({
                    "user": user_key,
                    "workout_logs": log_count,
                    "whoop_snapshots": whoop_count,
                    "latest_log": latest_log,
                })
            return self._json_response({"users": users})

        # --- Coach: Get specific user's full data ---
        if path.startswith("/api/coach/user/"):
            user_key = path.split("/api/coach/user/")[1]
            user_key = urllib.parse.unquote(user_key)
            if not user_key:
                return self._json_response({"error": "Missing user"}, 400)
            user_data = load_user_data(user_key)
            return self._json_response(user_data)

        # --- Body Metrics: Get entries ---
        if path == "/api/metrics":
            user_key = params.get("user")
            if not user_key:
                return self._json_response({"error": "Missing user"}, 400)
            user_data = load_user_data(user_key)
            entries = user_data.get("metrics", [])
            return self._json_response({"entries": entries})

        # --- Fallback: serve static files ---
        super().do_GET()

    # ==================== POST ROUTES ====================
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self._read_body()

        # --- Save workout day data ---
        if path == "/api/save-day":
            user_key = body.get("user")
            day_key = body.get("day_key")  # e.g. "day_5"
            day_data = body.get("data", {})
            day_meta = body.get("meta", {})  # week, day label, date, etc.

            if not user_key or not day_key:
                return self._json_response({"error": "Missing user or day_key"}, 400)

            user_data = load_user_data(user_key)
            user_data["workout_logs"][day_key] = {
                "data": day_data,
                "meta": day_meta,
                "saved_at": datetime.utcnow().isoformat() + "Z",
            }
            save_user_data(user_key, user_data)
            return self._json_response({"ok": True})

        # --- Save Whoop snapshot ---
        if path == "/api/save-whoop":
            user_key = body.get("user")
            snapshot = body.get("snapshot", {})

            if not user_key:
                return self._json_response({"error": "Missing user"}, 400)

            user_data = load_user_data(user_key)
            snapshot["saved_at"] = datetime.utcnow().isoformat() + "Z"
            # Keep last 90 days of snapshots
            user_data["whoop_snapshots"].append(snapshot)
            user_data["whoop_snapshots"] = user_data["whoop_snapshots"][-90:]
            save_user_data(user_key, user_data)
            return self._json_response({"ok": True})

        # --- Bulk sync all day data (for initial migration from localStorage) ---
        if path == "/api/sync-all":
            user_key = body.get("user")
            all_days = body.get("days", {})

            if not user_key:
                return self._json_response({"error": "Missing user"}, 400)

            user_data = load_user_data(user_key)
            for day_key, day_info in all_days.items():
                # Only save if there's actual data and it's not already saved
                if day_info.get("data") and day_key not in user_data["workout_logs"]:
                    user_data["workout_logs"][day_key] = {
                        "data": day_info["data"],
                        "meta": day_info.get("meta", {}),
                        "saved_at": datetime.utcnow().isoformat() + "Z",
                    }
            save_user_data(user_key, user_data)
            return self._json_response({"ok": True, "synced": len(all_days)})

        # --- Save body metrics entry ---
        if path == "/api/save-metrics":
            user_key = body.get("user")
            entry = body.get("entry", {})

            if not user_key or not entry:
                return self._json_response({"error": "Missing user or entry"}, 400)

            user_data = load_user_data(user_key)
            if "metrics" not in user_data:
                user_data["metrics"] = []
            entry["saved_at"] = datetime.utcnow().isoformat() + "Z"
            user_data["metrics"].append(entry)
            save_user_data(user_key, user_data)
            return self._json_response({"ok": True})

        # --- Send email verification code ---
        if path == "/api/send-verification":
            email = body.get("email", "").strip().lower()
            user_name = body.get("user", "")
            if not email:
                return self._json_response({"error": "Missing email"}, 400)

            code = str(random.randint(100000, 999999))
            VERIFICATION_CODES[email] = {
                "code": code,
                "expires": time.time() + 600,  # 10 minutes
                "user": user_name,
            }

            # Send via SMTP
            smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
            smtp_port = int(os.environ.get("SMTP_PORT", "587"))
            smtp_user = os.environ.get("SMTP_USER", "")
            smtp_pass = os.environ.get("SMTP_PASS", "")

            if not smtp_user or not smtp_pass:
                # No SMTP configured — auto-verify for development
                return self._json_response({"ok": True, "dev_code": code, "message": "SMTP not configured — code returned for dev"})

            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = "NumNum Workout — Verify Your Email"
                msg["From"] = smtp_user
                msg["To"] = email

                html_body = f"""
                <div style="font-family:system-ui;max-width:400px;margin:0 auto;padding:20px;">
                    <h2 style="color:#E8475F;">NumNum Workout</h2>
                    <p>Hi {user_name},</p>
                    <p>Your verification code is:</p>
                    <div style="background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;margin:16px 0;">
                        <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#E8475F;">{code}</span>
                    </div>
                    <p style="color:#666;font-size:13px;">This code expires in 10 minutes.</p>
                </div>"""
                msg.attach(MIMEText(html_body, "html"))

                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)

                return self._json_response({"ok": True, "message": "Verification email sent"})
            except Exception as e:
                return self._json_response({"error": f"Failed to send email: {str(e)}"}, 500)

        # --- Verify email code ---
        if path == "/api/verify-email":
            email = body.get("email", "").strip().lower()
            code = body.get("code", "").strip()
            user_name = body.get("user", "")

            if not email or not code:
                return self._json_response({"error": "Missing email or code"}, 400)

            stored = VERIFICATION_CODES.get(email)
            if not stored:
                return self._json_response({"error": "No verification code found. Request a new one."}, 400)

            if time.time() > stored["expires"]:
                del VERIFICATION_CODES[email]
                return self._json_response({"error": "Code expired. Request a new one."}, 400)

            if stored["code"] != code:
                return self._json_response({"error": "Incorrect code."}, 400)

            # Mark as verified in users.json
            del VERIFICATION_CODES[email]
            users_file = APP_DIR / "users.json"
            if users_file.exists():
                with open(users_file) as f:
                    all_users = json.load(f)
                for uname, uinfo in all_users.items():
                    if uinfo.get("email", "").lower() == email:
                        uinfo["email_verified"] = True
                with open(users_file, "w") as f:
                    json.dump(all_users, f, indent=2)

            return self._json_response({"ok": True, "verified": True})

        return self._json_response({"error": "Not found"}, 404)

    # ==================== OPTIONS (CORS preflight) ====================
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ==================== HELPERS ====================
    def _whoop_proxy(self, user_key, endpoint):
        if not user_key:
            return self._json_response({"error": "Missing user"}, 400)
        data, err = whoop_api_get(user_key, endpoint)
        if err:
            return self._json_response({"error": err}, 401 if "auth" in str(err) else 502)
        return self._json_response(data)

    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _html_response(self, html, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode())

    def log_message(self, format, *args):
        msg = str(args[0]) if args else ""
        if "/api/" in msg or "/whoop" in msg:
            print(f"[server] {msg}")


# ==================== MAIN ====================

if __name__ == "__main__":
    config = load_whoop_config()
    print(f"\n  NumNum Workout Server")
    print(f"  http://localhost:{PORT}")
    if config["client_id"]:
        print(f"  Whoop OAuth: enabled")
        print(f"  Redirect URI: {config['redirect_uri']}")
    else:
        print(f"  Whoop: not configured (set env vars or whoop_config.json)")
    print(f"  User data: {DATA_DIR}")
    print()

    server = http.server.HTTPServer(("", PORT), NumNumHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()
