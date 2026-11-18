"""Small shared helpers: errors, input cleaning, time handling and serialisation."""
import hashlib
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from flask import current_app


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------- input cleaning ----------
def clean(value, max_len=200):
    """Single-line text: trims and collapses whitespace."""
    return " ".join(str(value if value is not None else "").split())[:max_len]


def clean_text(value, max_len=1000):
    """Multi-line text: trims only."""
    return str(value if value is not None else "").strip()[:max_len]


def normalize_staff_id(value):
    return re.sub(r"\s+", "", str(value or "")).upper()


def valid_staff_id(value):
    return bool(value) and len(value) <= 40 and re.fullmatch(r"[A-Z0-9/\-_.]+", value) is not None


def staff_doc_id(staff_id):
    """Deterministic Firestore document id for a Staff ID. Guarantees uniqueness."""
    return hashlib.sha256(normalize_staff_id(staff_id).encode()).hexdigest()[:40]


def hash_token(token):
    return hashlib.sha256(str(token).encode()).hexdigest()


def valid_phone(value):
    return value == "" or re.fullmatch(r"\+?[0-9 ]{7,15}", value) is not None


def valid_date(value):
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except (TypeError, ValueError):
        return False


def valid_time(value):
    try:
        datetime.strptime(value, "%H:%M")
        return True
    except (TypeError, ValueError):
        return False


# ---------- time ----------
def app_tz():
    return ZoneInfo(current_app.config["TIMEZONE"])


def now_utc():
    return datetime.now(timezone.utc)


def to_local(dt):
    return dt.astimezone(app_tz())


def fmt_local(dt):
    return to_local(dt).strftime("%Y-%m-%d %H:%M:%S") if dt else ""


def parse_local(value):
    """Parse a 'YYYY-MM-DDTHH:MM' string as a time in the hospital's time zone."""
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=app_tz())
        except ValueError:
            continue
    return None


# ---------- serialisation ----------
def serialize(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [serialize(v) for v in obj]
    return obj


def doc_dict(snap):
    data = snap.to_dict() or {}
    data["id"] = snap.id
    return serialize(data)
