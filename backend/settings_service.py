"""System settings stored in Firestore (systemSettings/main) merged with safe defaults."""
import base64
import re

from firebase_admin import firestore

from .firebase import get_db
from .utils import ApiError, clean, clean_text

DEFAULT_CATEGORIES = [
    "General Staff Meeting",
    "Management Meeting",
    "Departmental Meeting",
    "Nursing Meeting",
    "Training Session",
    "Emergency Meeting",
    "Other",
]

DEFAULTS = {
    "hospitalName": "St. Francis Xavier Hospital",
    "logo": "",
    "address": "",
    "phone": "",
    "email": "",
    "defaultOpenMinutesBefore": 30,
    "defaultCloseMinutesAfter": 60,
    "defaultCategory": "General Staff Meeting",
    "categories": DEFAULT_CATEGORIES,
    "qrErrorCorrection": "M",
    "qrInstruction": "Scan this QR code using your smartphone camera to record your attendance.",
    "reportFooter": "",
    "organizerLabel": "Meeting Organizer's Signature",
}

_DOC = ("systemSettings", "main")


def get_settings():
    snap = get_db().collection(_DOC[0]).document(_DOC[1]).get()
    data = dict(DEFAULTS)
    if snap.exists:
        stored = snap.to_dict() or {}
        data.update({k: v for k, v in stored.items() if k in DEFAULTS and v not in (None,)})
    if not data.get("categories"):
        data["categories"] = DEFAULT_CATEGORIES
    return data


def public_settings(settings=None):
    s = settings or get_settings()
    return {"hospitalName": s["hospitalName"], "logo": s["logo"]}


def update_settings(data, uid):
    s = {}
    s["hospitalName"] = clean(data.get("hospitalName"), 120) or DEFAULTS["hospitalName"]
    s["address"] = clean(data.get("address"), 200)
    s["phone"] = clean(data.get("phone"), 40)
    s["email"] = clean(data.get("email"), 120)
    try:
        s["defaultOpenMinutesBefore"] = max(0, min(1440, int(data.get("defaultOpenMinutesBefore", 30))))
        s["defaultCloseMinutesAfter"] = max(0, min(1440, int(data.get("defaultCloseMinutesAfter", 60))))
    except (TypeError, ValueError):
        raise ApiError("Default attendance minutes must be whole numbers.")

    cats = data.get("categories") or []
    if isinstance(cats, str):
        cats = cats.splitlines()
    cats = [clean(c, 60) for c in cats if clean(c, 60)]
    s["categories"] = list(dict.fromkeys(cats)) or DEFAULT_CATEGORIES
    default_cat = clean(data.get("defaultCategory"), 60)
    s["defaultCategory"] = default_cat if default_cat in s["categories"] else s["categories"][0]

    ec = clean(data.get("qrErrorCorrection"), 1).upper()
    s["qrErrorCorrection"] = ec if ec in ("L", "M", "Q", "H") else "M"
    s["qrInstruction"] = clean(data.get("qrInstruction"), 200) or DEFAULTS["qrInstruction"]
    s["reportFooter"] = clean(data.get("reportFooter"), 200)
    s["organizerLabel"] = clean(data.get("organizerLabel"), 80) or DEFAULTS["organizerLabel"]

    if "logo" in data:
        logo = clean_text(data.get("logo"), 600000)
        if logo and not re.fullmatch(r"data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+", logo):
            raise ApiError("Logo must be a PNG or JPEG image.")
        if len(logo) > 400000:
            raise ApiError("Logo is too large. Use an image under 250 KB.")
        s["logo"] = logo
    else:
        s["logo"] = get_settings().get("logo", "")

    s["updatedBy"] = uid
    s["updatedAt"] = firestore.SERVER_TIMESTAMP
    get_db().collection(_DOC[0]).document(_DOC[1]).set(s)
    return s


def logo_bytes(settings):
    logo = settings.get("logo") or ""
    if "," not in logo:
        return None
    try:
        return base64.b64decode(logo.split(",", 1)[1])
    except Exception:
        return None
