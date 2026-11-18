"""Super-admin routes: administrator accounts, audit logs and system settings."""
import re

from firebase_admin import auth as fb_auth
from firebase_admin import firestore
from flask import Blueprint, g, jsonify, request

from ..audit import log_action
from ..auth import ALL_PERMS, ROLES, require_auth
from ..firebase import get_db
from ..settings_service import get_settings, update_settings
from ..utils import ApiError, clean, doc_dict, fmt_local

bp = Blueprint("users", __name__, url_prefix="/api/admin")


def _json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Invalid request.", 400)
    return data


def _perms(data):
    return [p for p in (data.get("permissions") or []) if p in ALL_PERMS]


# ---------------- administrator accounts ----------------
@bp.get("/users")
@require_auth(super_only=True)
def list_users():
    rows = [doc_dict(s) for s in get_db().collection("users").stream()]
    rows.sort(key=lambda r: (r.get("name") or "").lower())
    return jsonify({"users": rows})


@bp.post("/users")
@require_auth(super_only=True)
def create_user():
    data = _json()
    email = clean(data.get("email"), 120).lower()
    name = clean(data.get("name"), 100)
    role = clean(data.get("role"), 12)
    password = str(data.get("password") or "")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ApiError("Enter a valid email address.")
    if len(name) < 2:
        raise ApiError("Name is required.")
    if role not in ROLES:
        raise ApiError("Choose a valid role.")
    if len(password) < 8:
        raise ApiError("Temporary password must be at least 8 characters.")
    try:
        record = fb_auth.create_user(email=email, password=password, display_name=name)
    except fb_auth.EmailAlreadyExistsError:
        raise ApiError("An account with this email already exists.", 409)
    get_db().collection("users").document(record.uid).set({
        "email": email, "name": name, "role": role, "permissions": _perms(data), "active": True,
        "createdBy": g.user["uid"], "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    log_action("admin_created", "user", record.uid, {"email": email, "role": role})
    return jsonify({"id": record.uid}), 201


@bp.put("/users/<uid>")
@require_auth(super_only=True)
def update_user(uid):
    data = _json()
    ref = get_db().collection("users").document(uid)
    snap = ref.get()
    if not snap.exists:
        raise ApiError("Account not found.", 404)
    name = clean(data.get("name"), 100)
    role = clean(data.get("role"), 12)
    if len(name) < 2 or role not in ROLES:
        raise ApiError("Name and a valid role are required.")
    if uid == g.user["uid"] and role != "super_admin":
        raise ApiError("You cannot remove your own Super Admin role.")
    ref.update({"name": name, "role": role, "permissions": _perms(data), "updatedAt": firestore.SERVER_TIMESTAMP})
    fb_auth.update_user(uid, display_name=name)
    fb_auth.revoke_refresh_tokens(uid)  # force re-authentication with the new permissions
    log_action("admin_updated", "user", uid, {"email": snap.to_dict().get("email"), "role": role})
    return jsonify({"ok": True})


@bp.post("/users/<uid>/status")
@require_auth(super_only=True)
def user_status(uid):
    active = bool(_json().get("active"))
    if uid == g.user["uid"] and not active:
        raise ApiError("You cannot deactivate your own account.")
    ref = get_db().collection("users").document(uid)
    snap = ref.get()
    if not snap.exists:
        raise ApiError("Account not found.", 404)
    ref.update({"active": active, "updatedAt": firestore.SERVER_TIMESTAMP})
    fb_auth.update_user(uid, disabled=not active)
    if not active:
        fb_auth.revoke_refresh_tokens(uid)
    log_action("admin_activated" if active else "admin_deactivated", "user", uid,
               {"email": snap.to_dict().get("email")})
    return jsonify({"ok": True})


@bp.get("/users/<uid>/activity")
@require_auth(super_only=True)
def user_activity(uid):
    rows = []
    for s in get_db().collection("auditLogs").where("userId", "==", uid).limit(300).stream():
        d = s.to_dict()
        d["timestampLocal"] = fmt_local(d.get("timestamp"))
        d.pop("timestamp", None)
        d["id"] = s.id
        rows.append(d)
    rows.sort(key=lambda r: r["timestampLocal"], reverse=True)
    return jsonify({"activity": rows[:100]})


# ---------------- audit logs ----------------
@bp.get("/audit")
@require_auth(super_only=True)
def audit_logs():
    try:
        limit = max(1, min(500, int(request.args.get("limit", 200))))
    except ValueError:
        limit = 200
    rows = []
    query = get_db().collection("auditLogs").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(limit)
    for s in query.stream():
        d = s.to_dict()
        d["timestampLocal"] = fmt_local(d.get("timestamp"))
        d.pop("timestamp", None)
        d["id"] = s.id
        rows.append(d)
    return jsonify({"logs": rows})


# ---------------- settings ----------------
@bp.get("/settings")
@require_auth()
def read_settings():
    return jsonify({"settings": get_settings(), "permissionList": ALL_PERMS})


@bp.put("/settings")
@require_auth(super_only=True)
def write_settings():
    data = _json()
    update_settings(data, g.user["uid"])
    log_action("settings_updated", "settings", "main", {"hospitalName": clean(data.get("hospitalName"), 120)})
    return jsonify({"ok": True})
