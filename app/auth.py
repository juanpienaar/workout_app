"""JWT authentication, password hashing, and FastAPI dependencies."""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from . import config
from .data import load_users, save_users, find_user_by_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ---- Password helpers ----

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, stored_hash: str) -> bool:
    """Verify password against stored hash. Supports bcrypt AND legacy SHA256."""
    if stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$"):
        return pwd_context.verify(plain, stored_hash)
    # Legacy SHA256 check
    sha_hash = hashlib.sha256(plain.encode()).hexdigest()
    return sha_hash == stored_hash


def needs_rehash(stored_hash: str) -> bool:
    """True if the hash is legacy SHA256 and should be upgraded to bcrypt."""
    return not (stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$"))


def upgrade_password(user_name: str, plain_password: str):
    """Re-hash a legacy SHA256 password to bcrypt and save."""
    users = load_users()
    if user_name in users:
        users[user_name]["passwordHash"] = hash_password(plain_password)
        save_users(users)


# ---- JWT helpers ----

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)


def create_refresh_token(data: dict, remember: bool = False) -> str:
    to_encode = data.copy()
    days = config.REFRESH_TOKEN_REMEMBER_DAYS if remember else config.REFRESH_TOKEN_EXPIRE_DAYS
    expire = datetime.now(timezone.utc) + timedelta(days=days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> dict:
    """Decode and validate a JWT token. Returns payload or raises."""
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        if payload.get("type") != expected_type:
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---- FastAPI dependencies ----

async def get_current_user(token: Annotated[str | None, Depends(oauth2_scheme)] = None) -> dict:
    """Dependency: extracts and validates JWT, returns user info dict."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token, "access")
    user_name = payload.get("sub")
    if not user_name:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    users = load_users()
    if user_name not in users:
        raise HTTPException(status_code=401, detail="User not found")
    user_info = users[user_name]
    return {"name": user_name, "role": user_info.get("role", "athlete"), **user_info}


async def require_coach(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Dependency: requires the user to have coach role."""
    if current_user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Coach access required")
    return current_user


async def get_optional_user(token: Annotated[str | None, Depends(oauth2_scheme)] = None) -> dict | None:
    """Dependency: returns user if token present, None otherwise. For optional auth."""
    if not token:
        return None
    try:
        return await get_current_user(token)
    except HTTPException:
        return None
