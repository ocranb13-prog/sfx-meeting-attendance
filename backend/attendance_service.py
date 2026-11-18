"""Core business logic: meeting state, token lookup, staff verification, attendance creation."""
from datetime import timedelta

from firebase_admin import firestore
from google.api_core.exceptions import AlreadyExists

from .firebase import get_db
from .utils import (ApiError, clean, doc_dict, fmt_local, normalize_staff_id, now_utc, parse_local,
                    serialize, staff_doc_id, hash_token, to_local)

GENERIC_VERIFY_ERROR = "We could not verify your details. Please check your Staff ID and department."


# ---------- meeting state ----------
def attendance_state(meeting, now=None):
    """Returns (is_open, message). Manual 'open' overrides times; otherwise the
    opening/closing window decides. Cancelled/closed meetings never accept attendance."""
    now = now or now_utc()
    status = meeting.get("status")
    if status == "cancelled":
        return False, "This meeting has been cancelled."
    if status == "closed":
        return False, "Attendance for this meeting is closed."
    if status == "open":
        return True, ""
    opening = parse_local(meeting.get("openingTime"))
    closing = parse_local(meeting.get("closingTime"))
    if closing and now > closing:
        return False, "Attendance for this meeting has closed."
    if opening and now >= opening:
        return True, ""
    return False, "Attendance for this meeting is not open yet."


def meeting_phase(meeting, now=None):
    now = now or now_utc()
    if meeting.get("status") == "cancelled":
        return "cancelled"
    is_open, _ = attendance_state(meeting, now)
    if is_open:
        return "active"
    if meeting.get("status") == "closed":
        return "completed"
    end = parse_local(f"{meeting.get('date')}T{meeting.get('endTime')}")
    if end and now > end:
        return "completed"
    return "upcoming"


def shape_meeting(meeting_dict, now=None):
    """Adds computed fields and strips internal ones. Input is already serialised."""
    now = now or now_utc()
    is_open, message = attendance_state(meeting_dict, now)
    out = dict(meeting_dict)
    out.pop("qrId", None)
    out["attendanceOpen"] = is_open
    out["attendanceMessage"] = message
    out["phase"] = meeting_phase(meeting_dict, now)
    return out


def get_meeting(meeting_id):
    snap = get_db().collection("meetings").document(meeting_id).get()
    if not snap.exists:
        raise ApiError("Meeting not found.", 404)
    return snap


# ---------- token lookup ----------
def get_meeting_by_token(token):
    token = clean(token, 100)
    if len(token) < 20:
        raise ApiError("This QR code is not valid.", 404)
    qr = get_db().collection("meetingQR").document(hash_token(token)).get()
    if not qr.exists or not (qr.to_dict() or {}).get("active"):
        raise ApiError("This QR code is not valid or is no longer active.", 404)
    snap = get_db().collection("meetings").document(qr.to_dict()["meetingId"]).get()
    if not snap.exists:
        raise ApiError("This QR code is not valid.", 404)
    return snap


# ---------- staff ----------
def find_staff(staff_id):
    snap = get_db().collection("staff").document(staff_doc_id(staff_id)).get()
    return snap if snap.exists else None


def all_staff():
    return [doc_dict(s) for s in get_db().collection("staff").stream()]


def expected_staff(meeting, staff_list):
    """Active staff the meeting is expected to be attended by (an estimate)."""
    active = [s for s in staff_list if s.get("status") == "active"]
    if meeting.get("audience") == "department":
        return [s for s in active if s.get("departmentId") == meeting.get("departmentId")]
    return active


# ---------- verification & submission (public flow) ----------
def verify_public_staff(token, staff_id, department_id):
    meeting_snap = get_meeting_by_token(token)
    meeting = meeting_snap.to_dict()
    is_open, message = attendance_state(meeting)
    if not is_open:
        raise ApiError(message, 403)

    staff_id = normalize_staff_id(staff_id)
    department_id = clean(department_id, 60)
    staff_snap = find_staff(staff_id) if staff_id else None
    if staff_snap is None:
        raise ApiError(GENERIC_VERIFY_ERROR, 404)
    staff = staff_snap.to_dict()
    if staff.get("status") != "active" or staff.get("departmentId") != department_id:
        raise ApiError(GENERIC_VERIFY_ERROR, 404)
    return meeting_snap, staff_snap


def attendance_doc_id(meeting_id, staff_id):
    return f"{meeting_id}_{staff_doc_id(staff_id)}"


def record_attendance(meeting_snap, staff_snap, method="QR", created_by=None, reason=""):
    """Creates the attendance record atomically. The deterministic document id
    (meetingId + staff) together with create() guarantees exactly one record per staff
    member per meeting, even for simultaneous submissions."""
    meeting = meeting_snap.to_dict()
    staff = staff_snap.to_dict()
    now = now_utc()
    local = to_local(now)
    record = {
        "meetingId": meeting_snap.id,
        "meetingTitle": meeting.get("title", ""),
        "staffDocId": staff_snap.id,
        "staffId": staff.get("staffId"),
        "fullName": staff.get("fullName"),
        "departmentId": staff.get("departmentId"),
        "departmentName": staff.get("departmentName"),
        "method": method,
        "status": "Present",
        "attendedAt": now,  # trusted server time
        "date": local.strftime("%Y-%m-%d"),
        "createdBy": created_by,
        "reason": reason,
        "history": [],
    }
    ref = get_db().collection("attendance").document(attendance_doc_id(meeting_snap.id, staff.get("staffId")))
    try:
        ref.create(record)
    except AlreadyExists:
        raise ApiError("Attendance has already been recorded for this staff member in this meeting.", 409)
    return record, ref.id


def shape_attendance(data, doc_id=None):
    """Prepare an attendance dict (raw Firestore values) for JSON output."""
    d = dict(data)
    if doc_id:
        d["id"] = doc_id
    at = d.get("attendedAt")
    d["attendedAtLocal"] = fmt_local(at) if at else ""
    d["time"] = d["attendedAtLocal"][11:] if at else ""
    return serialize(d)


def meeting_attendance(meeting_id, include_voided=True):
    snaps = get_db().collection("attendance").where("meetingId", "==", meeting_id).stream()
    rows = [shape_attendance(s.to_dict(), s.id) for s in snaps]
    if not include_voided:
        rows = [r for r in rows if r.get("status") == "Present"]
    rows.sort(key=lambda r: r.get("attendedAt", ""))
    for i, r in enumerate(rows, 1):
        r["serial"] = i
    return rows


def meeting_stats(meeting, records, staff_list):
    expected = expected_staff(meeting, staff_list)
    present = [r for r in records if r.get("status") == "Present"]
    present_ids = {r.get("staffDocId") for r in present}
    not_yet = [s for s in expected if s["id"] not in present_ids]
    n_expected = len(expected)
    pct = round(min(len(present) / n_expected, 1) * 100, 1) if n_expected else 0
    return {
        "expected": n_expected,
        "attended": len(present),
        "notYet": len(not_yet),
        "percentage": pct,
        "note": "Expected count is an estimate based on active staff records and the meeting audience.",
    }, [
        {"id": s["id"], "fullName": s.get("fullName"), "staffId": s.get("staffId"),
         "departmentName": s.get("departmentName")}
        for s in sorted(not_yet, key=lambda s: (s.get("fullName") or "").lower())
    ]


def default_window(date, start_time, end_time, settings):
    start = parse_local(f"{date}T{start_time}")
    end = parse_local(f"{date}T{end_time}")
    opening = start - timedelta(minutes=int(settings["defaultOpenMinutesBefore"]))
    closing = end + timedelta(minutes=int(settings["defaultCloseMinutesAfter"]))
    return opening.strftime("%Y-%m-%dT%H:%M"), closing.strftime("%Y-%m-%dT%H:%M")
