"""
Lightweight cron runner for Railway.
Deploy as a separate Railway service with a cron schedule.
Hits the auto-review endpoints on the main app, then exits.

Usage:
  CRON_TYPE=daily SECRET_KEY=xxx APP_URL=https://numnum.fit python cron_runner.py
"""
import os
import sys
import urllib.request
import urllib.error

APP_URL = os.environ.get("APP_URL", "https://numnum.fit").rstrip("/")
SECRET_KEY = os.environ.get("SECRET_KEY", "")
CRON_TYPE = os.environ.get("CRON_TYPE", "daily")  # "daily" or "weekly"

if not SECRET_KEY:
    print("ERROR: SECRET_KEY not set")
    sys.exit(1)

endpoint = f"{APP_URL}/api/admin/cron/{CRON_TYPE}-reviews?key={SECRET_KEY}"
print(f"Running {CRON_TYPE} review cron -> {APP_URL}/api/admin/cron/{CRON_TYPE}-reviews")

try:
    req = urllib.request.Request(endpoint, method="GET")
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read().decode()
        print(f"Status: {resp.status}")
        print(f"Response: {body}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode()}")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

print("Done.")
