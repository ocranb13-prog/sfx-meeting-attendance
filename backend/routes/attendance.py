"""Admin routes: attendance monitoring, manual additions and authorised corrections."""
from firebase_admin import firestore
from flask import Blueprint, g, jsonify, request

from ..attendance_service import (all_staff, find_staff, get_meeting, meeting_attendance, meeting_stats,
                                  record_attendance, shape_attendance, shape_meeting)
from ..audit import log_action
from ..auth import require_auth
from ..firebase import get_db
from ..utils import ApiError, clean, doc_dict, now_utc, parse_local, to_local

bp = Blueprint("attendance", __name__, url_prefix="/api/admin")


def _json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Invalid request.", 400)
    return data


def _reason(data):
    reason = clean(data.get("reason"), 300)
    if len(reason) < 5:
        raise ApiError("A reason of at least 5 characters is required.")
    return reason


@bp.get("/meetings/<meeting_id>/attendance")
@require_auth("attendance_view")
def meeting_attendance_route(meeting_id):
    snap = get_meeting(meeting_id)
    meeting = shape_meeting(doc_dict(snap))
    records = meeting_attendance(meeting_id)
    stats, not_yet = meeting_stats(meeting, records, all_staff())
    return jsonify({"meeting": meeting, "records": records, "stats": stats, "notAttended": not_yet})


@bp.post("/meetings/<meeting_id>/attendance/manual")
@require_auth("attendance_manual")
def manual_attendance(meeting_id):
    data = _json()
    reason = _reason(data)
    meeting_snap = get_meeting(meeting_id)
    if meeting_snap.to_dict().get("status") == "cancelled":
        raise ApiError("This meeting has been cancelled.")
    staff_snap = find_staff(data.get("staffId"))
    if staff_snap is None:
        raise ApiError("No staff member found with that Staff ID.", 404)
    if staff_snap.to_dict().get("status") != "active":
        raise ApiError("This staff member is inactive.")
    record, doc_id = record_attendance(meeting_snap, staff_snap, method="Manual",
                                       created_by=g.user["uid"], reason=reason)
    log_action("attendance_manual_added", "attendance", doc_id,
               {"meeting": record["meetingTitle"], "staffId": record["staffId"], "reason": reason})
    return jsonify({"id": doc_id}), 201


@bp.put("/attendance/<att_id>")
@require_auth("attendance_manual")
def correct_attendance(att_id):
    """Corrections never delete or silently overwrite: the old values are appended to the
    record's history and the change is written to the audit log."""
    data = _json()
    reason = _reason(data)
    ref = get_db().collection("attendance").document(att_id)
    snap = ref.get()
    if not snap.exists:
        raise ApiError("Attendance record not found.", 404)
    old = snap.to_dict()

    status = clean(data.get("status"), 10) or old.get("status")
    if status not in ("Present", "Voided"):
        raise ApiError("Status must be Present or Voided.")
    update = {"status": status}
    new_time = clean(data.get("attendedAt"), 16)
    if new_time:
        dt = parse_local(new_time)
        if not dt:
            raise ApiError("Enter a valid attendance date and time.")
        update["attendedAt"] = dt
        update["date"] = to_local(dt).strftime("%Y-%m-%d")

    entry = {
        "changedAt": now_utc(), "changedBy": g.user["email"], "reason": reason,
        "previousStatus": old.get("status"),
        "previousAttendedAt": old.get("attendedAt"),
    }
    update["history"] = firestore.ArrayUnion([entry])
    update["lastCorrection"] = reason
    ref.update(update)
    log_action("attendance_corrected", "attendance", att_id,
               {"staffId": old.get("staffId"), "meeting": old.get("meetingTitle"),
                "from": old.get("status"), "to": status, "reason": reason})
    return jsonify({"ok": True})


@bp.get("/attendance")
@require_auth("attendance_view")
def attendance_history():
    meeting_id = clean(request.args.get("meetingId"), 60)
    dept = clean(request.args.get("departmentId"), 60)
    date_from, date_to = clean(request.args.get("dateFrom"), 10), clean(request.args.get("dateTo"), 10)
    q = clean(request.args.get("q"), 80).lower()

    query = get_db().collection("attendance")
    if meeting_id:
        query = query.where("meetingId", "==", meeting_id)
    rows = [shape_attendance(s.to_dict(), s.id) for s in query.limit(5000).stream()]
    if dept:
        rows = [r for r in rows if r.get("departmentId") == dept]
    if date_from:
        rows = [r for r in rows if r.get("date", "") >= date_from]
    if date_to:
        rows = [r for r in rows if r.get("date", "") <= date_to]
    if q:
        rows = [r for r in rows if q in (r.get("fullName") or "").lower() or q in (r.get("staffId") or "").lower()]
    rows.sort(key=lambda r: r.get("attendedAt", ""), reverse=True)
    rows = rows[:1000]
    for i, r in enumerate(rows, 1):
        r["serial"] = i
        r.pop("history", None)
    return jsonify({"records": rows})
