"""Admin routes: current user, dashboard, departments and staff."""
from firebase_admin import firestore
from flask import Blueprint, g, jsonify, request
from google.api_core.exceptions import AlreadyExists

from ..attendance_service import all_staff, shape_attendance, shape_meeting
from ..audit import log_action
from ..auth import ALL_PERMS, PERMISSION_LABELS, require_auth
from ..firebase import get_db
from ..utils import (ApiError, clean, doc_dict, normalize_staff_id, staff_doc_id, valid_phone, valid_staff_id)

bp = Blueprint("core", __name__, url_prefix="/api/admin")


def _count(query):
    return query.count().get()[0][0].value


def _json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Invalid request.", 400)
    return data


@bp.get("/me")
@require_auth()
def me():
    return jsonify({"user": g.user, "permissionLabels": PERMISSION_LABELS})


# ---------------- dashboard ----------------
@bp.get("/dashboard")
@require_auth()
def dashboard():
    db = get_db()
    meetings = [shape_meeting(doc_dict(m)) for m in db.collection("meetings").stream()]
    phases = [m["phase"] for m in meetings]
    stats = {
        "totalStaff": _count(db.collection("staff")),
        "activeStaff": _count(db.collection("staff").where("status", "==", "active")),
        "totalDepartments": _count(db.collection("departments")),
        "totalMeetings": len(meetings),
        "upcomingMeetings": phases.count("upcoming"),
        "completedMeetings": phases.count("completed"),
        "activeMeetings": phases.count("active"),
        "attendanceRecords": _count(db.collection("attendance").where("status", "==", "Present")),
    }
    recent = sorted(meetings, key=lambda m: (m.get("date", ""), m.get("startTime", "")), reverse=True)[:5]
    upcoming = sorted([m for m in meetings if m["phase"] in ("upcoming", "active")],
                      key=lambda m: (m.get("date", ""), m.get("startTime", "")))[:5]
    recent_att = [
        shape_attendance(s.to_dict(), s.id)
        for s in db.collection("attendance").order_by("attendedAt", direction=firestore.Query.DESCENDING).limit(8).stream()
    ]
    return jsonify({"stats": stats, "recentMeetings": recent, "upcomingMeetings": upcoming,
                    "recentAttendance": recent_att})


# ---------------- departments ----------------
def _dept_payload(data, exclude_id=None):
    name = clean(data.get("name"), 100)
    if len(name) < 2:
        raise ApiError("Department name is required.")
    key = name.lower()
    for d in get_db().collection("departments").where("nameKey", "==", key).stream():
        if d.id != exclude_id:
            raise ApiError("A department with this name already exists.", 409)
    return {"name": name, "nameKey": key, "description": clean(data.get("description"), 300)}


@bp.get("/departments")
@require_auth()
def list_departments():
    counts = {}
    for s in get_db().collection("staff").stream():
        d = s.to_dict()
        counts[d.get("departmentId")] = counts.get(d.get("departmentId"), 0) + 1
    rows = []
    for snap in get_db().collection("departments").stream():
        row = doc_dict(snap)
        row["staffCount"] = counts.get(snap.id, 0)
        rows.append(row)
    rows.sort(key=lambda r: r.get("name", "").lower())
    return jsonify({"departments": rows})


@bp.post("/departments")
@require_auth("departments")
def create_department():
    payload = _dept_payload(_json())
    payload.update({"active": True, "createdBy": g.user["uid"], "createdAt": firestore.SERVER_TIMESTAMP,
                    "updatedAt": firestore.SERVER_TIMESTAMP})
    ref = get_db().collection("departments").document()
    ref.set(payload)
    log_action("department_created", "department", ref.id, {"name": payload["name"]})
    return jsonify({"id": ref.id}), 201


@bp.put("/departments/<dept_id>")
@require_auth("departments")
def update_department(dept_id):
    ref = get_db().collection("departments").document(dept_id)
    snap = ref.get()
    if not snap.exists:
        raise ApiError("Department not found.", 404)
    payload = _dept_payload(_json(), exclude_id=dept_id)
    payload["updatedAt"] = firestore.SERVER_TIMESTAMP
    ref.update(payload)
    # keep the denormalised department name on staff records in sync
    if payload["name"] != snap.to_dict().get("name"):
        batch = get_db().batch()
        for s in get_db().collection("staff").where("departmentId", "==", dept_id).stream():
            batch.update(s.reference, {"departmentName": payload["name"]})
        batch.commit()
    log_action("department_updated", "department", dept_id, {"name": payload["name"]})
    return jsonify({"ok": True})


@bp.post("/departments/<dept_id>/status")
@require_auth("departments")
def department_status(dept_id):
    active = bool(_json().get("active"))
    ref = get_db().collection("departments").document(dept_id)
    if not ref.get().exists:
        raise ApiError("Department not found.", 404)
    ref.update({"active": active, "updatedAt": firestore.SERVER_TIMESTAMP})
    log_action("department_activated" if active else "department_deactivated", "department", dept_id)
    return jsonify({"ok": True})


# ---------------- staff ----------------
def _get_active_department(dept_id):
    snap = get_db().collection("departments").document(clean(dept_id, 60) or "-").get()
    if not snap.exists or not snap.to_dict().get("active", True):
        raise ApiError("Please choose an active department.")
    return snap


def _staff_fields(data):
    full_name = clean(data.get("fullName"), 120)
    if len(full_name) < 2:
        raise ApiError("Full name is required.")
    phone = clean(data.get("phone"), 20)
    if not valid_phone(phone):
        raise ApiError("Enter a valid phone number (7-15 digits) or leave it blank.")
    return full_name, phone


@bp.get("/staff")
@require_auth("staff", "attendance_manual")
def list_staff():
    q = clean(request.args.get("q"), 80).lower()
    dept = clean(request.args.get("departmentId"), 60)
    status = clean(request.args.get("status"), 10)
    rows = all_staff()
    if q:
        rows = [r for r in rows if q in (r.get("fullName") or "").lower() or q in (r.get("staffId") or "").lower()]
    if dept:
        rows = [r for r in rows if r.get("departmentId") == dept]
    if status in ("active", "inactive"):
        rows = [r for r in rows if r.get("status") == status]
    rows.sort(key=lambda r: (r.get("fullName") or "").lower())
    return jsonify({"staff": rows, "total": len(rows)})


@bp.post("/staff")
@require_auth("staff")
def create_staff():
    data = _json()
    full_name, phone = _staff_fields(data)
    staff_id = normalize_staff_id(data.get("staffId"))
    if not valid_staff_id(staff_id):
        raise ApiError("Enter the official Staff ID issued by the hospital (letters, numbers, / - _ . only).")
    dept = _get_active_department(data.get("departmentId"))
    doc = {
        "fullName": full_name, "staffId": staff_id, "departmentId": dept.id,
        "departmentName": dept.to_dict().get("name"), "phone": phone, "status": "active",
        "createdBy": g.user["uid"], "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    try:
        get_db().collection("staff").document(staff_doc_id(staff_id)).create(doc)
    except AlreadyExists:
        raise ApiError("A staff member with this Staff ID already exists.", 409)
    log_action("staff_created", "staff", staff_id, {"fullName": full_name, "department": doc["departmentName"]})
    return jsonify({"id": staff_doc_id(staff_id)}), 201


@bp.put("/staff/<doc_id>")
@require_auth("staff")
def update_staff(doc_id):
    ref = get_db().collection("staff").document(doc_id)
    snap = ref.get()
    if not snap.exists:
        raise ApiError("Staff member not found.", 404)
    data = _json()
    full_name, phone = _staff_fields(data)
    dept = _get_active_department(data.get("departmentId")) if data.get("departmentId") != snap.to_dict().get("departmentId") \
        else get_db().collection("departments").document(snap.to_dict()["departmentId"]).get()
    update = {"fullName": full_name, "phone": phone, "departmentId": dept.id,
              "departmentName": dept.to_dict().get("name"), "updatedAt": firestore.SERVER_TIMESTAMP}
    ref.update(update)
    log_action("staff_updated", "staff", snap.to_dict().get("staffId"),
               {"fullName": full_name, "department": update["departmentName"]})
    return jsonify({"ok": True})


@bp.post("/staff/<doc_id>/status")
@require_auth("staff")
def staff_status(doc_id):
    active = bool(_json().get("active"))
    ref = get_db().collection("staff").document(doc_id)
    snap = ref.get()
    if not snap.exists:
        raise ApiError("Staff member not found.", 404)
    ref.update({"status": "active" if active else "inactive", "updatedAt": firestore.SERVER_TIMESTAMP})
    log_action("staff_activated" if active else "staff_deactivated", "staff", snap.to_dict().get("staffId"))
    return jsonify({"ok": True})
