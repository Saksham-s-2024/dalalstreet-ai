import hashlib
import hmac
import re
from datetime import datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# ── Password hashing ─────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ──────────────────────────────────────────────────────
def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


# ── HMAC payload signing ─────────────────────────────────────
def sign_payload(payload: str) -> str:
    """HMAC-SHA256 sign a payload string using the app secret."""
    return hmac.new(
        settings.app_secret_key.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()


def verify_payload_signature(payload: str, signature: str) -> bool:
    expected = sign_payload(payload)
    return hmac.compare_digest(expected, signature)


# ── Input Sanitization ───────────────────────────────────────
MAX_SYMBOL_LEN = 20
MAX_TEXT_LEN = 200
_SYMBOL_RE = re.compile(r"^[A-Z0-9\-\^&\.]{1,20}$")


def sanitize_symbol(symbol: str) -> str:
    """
    Clean and validate a stock/fund symbol.
    Raises ValueError on invalid input.
    """
    cleaned = symbol.strip().upper()[:MAX_SYMBOL_LEN]
    if not _SYMBOL_RE.match(cleaned):
        raise ValueError(f"Invalid symbol format: '{cleaned}'")
    return cleaned


def sanitize_text(text: str, max_len: int = MAX_TEXT_LEN) -> str:
    """
    Strip dangerous characters from free-text user input and truncate.
    """
    # Remove HTML tags and control characters
    cleaned = re.sub(r"[<>\"'%;()&+\x00-\x1f]", "", text)
    return cleaned[:max_len]


def sanitize_ticker_list(raw: list[str], max_items: int = 10) -> list[str]:
    return [sanitize_symbol(s) for s in raw[:max_items]]
