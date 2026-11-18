"""Firebase ID-token verification and role/permission enforcement.

Permissions are enforced here on the server, never only by hiding buttons.
"""
from functools import wraps

from firebase_admin import auth as fb_auth
from flask import g, request

from .firebase import get_db
from .utils import ApiError

PERMISSION_LABELS = {
    "staff": "Manage staff",
    "departments": "Manage departments",
    "meetings": "Manage meetings",
    "qr": "Generate, print and download QR codes",
    "attendance_view": "View attendance",
    "attendance_manual": "Add / correct attendance manually",
    "reports": "Generate and export reports",
}
ALL_PERMS = list(PERMISSION_LABELS.keys())
ROLES = ("super_admin", "admin")


def require_auth(*permissions, super_only=False):
    """Decorator. With no arguments any active administrator passes.
    With permissions, the user needs at least ONE of them (super admins always pass)."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                raise ApiError("Authentication required.", 401)
            try:
                decoded = fb_auth.verify_id_token(header[7:], check_revoked=True)
            except Exception:
                raise ApiError("Your session has expired. Please sign in again.", 401)

            snap = get_db().collection("users").document(decoded["uid"]).get()
            if not snap.exists:
                raise ApiError("This account is not registered as an administrator.", 403)
            profile = snap.to_dict()
            if not profile.get("active", False):
                raise ApiError("This account has been deactivated.", 403)

            role = profile.get("role", "admin")
            perms = ALL_PERMS if role == "super_admin" else [
                p for p in profile.get("permissions", []) if p in ALL_PERMS
            ]
            g.user = {
                "uid": decoded["uid"],
                "email": profile.get("email", decoded.get("email", "")),
                "name": profile.get("name", ""),
                "role": role,
                "permissions": perms,
            }

            if super_only and role != "super_admin":
                raise ApiError("Only a Super Admin can do this.", 403)
            if permissions and role != "super_admin" and not any(p in perms for p in permissions):
                raise ApiError("You do not have permission to do this.", 403)
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def is_super():
    return g.user["role"] == "super_admin"


def has_perm(permission):
    return is_super() or permission in g.user["permissions"]
