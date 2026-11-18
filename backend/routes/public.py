"""Public endpoints used by the staff phone page. Rate limited; they expose no admin data."""
from flask import Blueprint, current_app, jsonify, request

from ..attendance_service import (attendance_state, find_staff, get_meeting_by_token, record_attendance,
                                  attendance_doc_id, verify_public_staff)
from ..extensions import limiter
from ..firebase import get_db
from ..settings_service import get_settings, public_settings
from ..utils import ApiError, clean, fmt_local, now_utc

bp = Blueprint("public", __name__, url_prefix="/api/public")


def _limit():
    return current_app.config["PUBLIC_RATE_LIMIT"]


def _json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Invalid request.", 400)
    return data


@bp.get("/settings")
@limiter.limit(_limit)
def settings():
    return jsonify(public_settings())


@bp.get("/meeting/<token>")
@limiter.limit(_limit)
def meeting_info(token):
    snap = get_meeting_by_token(token)
    m = snap.to_dict()
    is_open, message = attendance_state(m)
    departments = [
        {"id": d.id, "name": d.to_dict().get("name")}
        for d in get_db().collection("departments").stream()
        if d.to_dict().get("active", True)
    ]
    departments.sort(key=lambda d: (d["name"] or "").lower())
    return jsonify({
        "hospital": public_settings(),
        "meeting": {"title": m.get("title"), "date": m.get("date"), "startTime": m.get("startTime"),
                    "endTime": m.get("endTime"), "venue": m.get("venue")},
        "attendanceOpen": is_open,
        "message": message,
        "departments": departments,
    })


@bp.post("/verify")
@limiter.limit(_limit)
def verify():
    data = _json_body()
    meeting_snap, staff_snap = verify_public_staff(data.get("token"), data.get("staffId"), data.get("departmentId"))
    staff = staff_snap.to_dict()
    already = get_db().collection("attendance").document(
        attendance_doc_id(meeting_snap.id, staff["staffId"])).get().exists
    if already:
        raise ApiError("Your attendance has already been recorded for this meeting.", 409)
    return jsonify({"fullName": staff["fullName"], "staffId": staff["staffId"],
                    "departmentName": staff["departmentName"]})


@bp.post("/submit")
@limiter.limit(_limit)
def submit():
    data = _json_body()
    if data.get("confirm") is not True:
        raise ApiError("Please confirm your details before submitting.", 400)
    # Everything is re-validated on the server; browser-supplied names/times are never trusted.
    meeting_snap, staff_snap = verify_public_staff(data.get("token"), data.get("staffId"), data.get("departmentId"))
    record, _ = record_attendance(meeting_snap, staff_snap, method="QR")
    m = meeting_snap.to_dict()
    return jsonify({
        "message": "ATTENDANCE RECORDED SUCCESSFULLY",
        "fullName": record["fullName"],
        "staffId": record["staffId"],
        "departmentName": record["departmentName"],
        "meetingTitle": m.get("title"),
        "meetingDate": m.get("date"),
        "attendedAt": fmt_local(record["attendedAt"]),
    })
