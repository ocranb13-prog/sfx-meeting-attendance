"""Admin routes: meeting management and per-meeting QR codes."""
from datetime import datetime
from io import BytesIO

from firebase_admin import firestore
from flask import Blueprint, current_app, g, jsonify, request, send_file

from ..attendance_service import default_window, get_meeting, shape_meeting
from ..audit import log_action
from ..auth import require_auth
from ..firebase import get_db
from ..qr_service import build_qr_pdf, make_qr_png, new_token
from ..settings_service import get_settings
from ..utils import (ApiError, clean, clean_text, doc_dict, hash_token, parse_local, valid_date, valid_time)

bp = Blueprint("meetings", __name__, url_prefix="/api/admin")
READ_PERMS = ("meetings", "qr", "attendance_view", "attendance_manual", "reports")


def _json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Invalid request.", 400)
    return data


def _payload(data, settings):
    title = clean(data.get("title"), 150)
    venue = clean(data.get("venue"), 150)
    date = clean(data.get("date"), 10)
    start, end = clean(data.get("startTime"), 5), clean(data.get("endTime"), 5)
    if len(title) < 3:
        raise ApiError("Meeting title is required.")
    if not venue:
        raise ApiError("Venue is required.")
    if not valid_date(date) or not valid_time(start) or not valid_time(end):
        raise ApiError("Enter a valid date, start time and end time.")
    if end <= start:
        raise ApiError("End time must be after the start time.")
    category = clean(data.get("category"), 60) or settings["defaultCategory"]
    if category not in settings["categories"]:
        raise ApiError("Choose a meeting category from the list.")

    audience = clean(data.get("audience"), 12) or "hospital"
    if audience not in ("hospital", "department"):
        raise ApiError("Choose a valid target audience.")
    dept_id, dept_name = "", ""
    if audience == "department":
        snap = get_db().collection("departments").document(clean(data.get("departmentId"), 60) or "-").get()
        if not snap.exists:
            raise ApiError("Choose the department this meeting is for.")
        dept_id, dept_name = snap.id, snap.to_dict().get("name")

    opening, closing = default_window(date, start, end, settings)
    opening = clean(data.get("openingTime"), 16) or opening
    closing = clean(data.get("closingTime"), 16) or closing
    o, c = parse_local(opening), parse_local(closing)
    if not o or not c:
        raise ApiError("Enter valid attendance opening and closing times.")
    if c <= o:
        raise ApiError("Attendance closing time must be after the opening time.")

    return {
        "title": title, "description": clean_text(data.get("description"), 1000), "date": date,
        "startTime": start, "endTime": end, "venue": venue, "category": category, "audience": audience,
        "departmentId": dept_id, "departmentName": dept_name, "openingTime": opening, "closingTime": closing,
    }


def _qr_url(token):
    return f"{current_app.config['PUBLIC_BASE_URL']}/attend/{token}"


def _active_qr(meeting_snap):
    qr_id = (meeting_snap.to_dict() or {}).get("qrId")
    snap = get_db().collection("meetingQR").document(qr_id or "-").get()
    if not snap.exists or not snap.to_dict().get("active"):
        raise ApiError("This meeting has no active QR code.", 404)
    return snap


@bp.get("/meetings")
@require_auth(*READ_PERMS)
def list_meetings():
    q = clean(request.args.get("q"), 80).lower()
    phase = clean(request.args.get("phase"), 12)
    counts = {}
    for s in get_db().collection("attendance").where("status", "==", "Present").select(["meetingId"]).stream():
        mid = s.to_dict().get("meetingId")
        counts[mid] = counts.get(mid, 0) + 1
    rows = [shape_meeting(doc_dict(m)) for m in get_db().collection("meetings").stream()]
    for r in rows:
        r["attendedCount"] = counts.get(r["id"], 0)
    if q:
        rows = [r for r in rows if q in r.get("title", "").lower() or q in r.get("venue", "").lower()]
    if phase:
        rows = [r for r in rows if r["phase"] == phase]
    rows.sort(key=lambda r: (r.get("date", ""), r.get("startTime", "")), reverse=True)
    return jsonify({"meetings": rows})


@bp.post("/meetings")
@require_auth("meetings")
def create_meeting():
    settings = get_settings()
    payload = _payload(_json(), settings)
    token = new_token()
    qr_id = hash_token(token)
    db = get_db()
    mref = db.collection("meetings").document()
    payload.update({"status": "scheduled", "qrId": qr_id, "createdBy": g.user["uid"],
                    "createdAt": firestore.SERVER_TIMESTAMP, "updatedAt": firestore.SERVER_TIMESTAMP})
    batch = db.batch()
    batch.set(mref, payload)
    batch.set(db.collection("meetingQR").document(qr_id), {
        "meetingId": mref.id, "token": token, "active": True,
        "createdBy": g.user["uid"], "createdAt": firestore.SERVER_TIMESTAMP,
    })
    batch.commit()
    log_action("meeting_created", "meeting", mref.id, {"title": payload["title"], "date": payload["date"]})
    log_action("qr_generated", "meeting", mref.id, {"title": payload["title"]})
    return jsonify({"id": mref.id}), 201


@bp.get("/meetings/<meeting_id>")
@require_auth(*READ_PERMS)
def get_meeting_route(meeting_id):
    return jsonify({"meeting": shape_meeting(doc_dict(get_meeting(meeting_id)))})


@bp.put("/meetings/<meeting_id>")
@require_auth("meetings")
def update_meeting(meeting_id):
    snap = get_meeting(meeting_id)
    if snap.to_dict().get("status") == "cancelled":
        raise ApiError("A cancelled meeting cannot be edited.")
    payload = _payload(_json(), get_settings())
    payload["updatedAt"] = firestore.SERVER_TIMESTAMP
    snap.reference.update(payload)
    log_action("meeting_updated", "meeting", meeting_id, {"title": payload["title"]})
    return jsonify({"ok": True})


def _set_status(meeting_id, status, action, extra=None):
    snap = get_meeting(meeting_id)
    current = snap.to_dict().get("status")
    if current == "cancelled":
        raise ApiError("This meeting has been cancelled.")
    update = {"status": status, "updatedAt": firestore.SERVER_TIMESTAMP}
    update.update(extra or {})
    snap.reference.update(update)
    log_action(action, "meeting", meeting_id, {"title": snap.to_dict().get("title"), "from": current, "to": status})


@bp.post("/meetings/<meeting_id>/open")
@require_auth("meetings")
def open_attendance(meeting_id):
    _set_status(meeting_id, "open", "attendance_opened")
    return jsonify({"ok": True})


@bp.post("/meetings/<meeting_id>/close")
@require_auth("meetings")
def close_attendance(meeting_id):
    _set_status(meeting_id, "closed", "attendance_closed")
    return jsonify({"ok": True})


@bp.post("/meetings/<meeting_id>/cancel")
@require_auth("meetings")
def cancel_meeting(meeting_id):
    reason = clean((request.get_json(silent=True) or {}).get("reason"), 300)
    _set_status(meeting_id, "cancelled", "meeting_cancelled", {"cancelReason": reason})
    return jsonify({"ok": True})


# ---------------- QR ----------------
@bp.get("/meetings/<meeting_id>/qr")
@require_auth("qr")
def qr_info(meeting_id):
    qr = _active_qr(get_meeting(meeting_id)).to_dict()
    return jsonify({"url": _qr_url(qr["token"]),
                    "createdAt": qr["createdAt"].isoformat() if qr.get("createdAt") else ""})


@bp.get("/meetings/<meeting_id>/qr.png")
@require_auth("qr")
def qr_png(meeting_id):
    snap = get_meeting(meeting_id)
    qr = _active_qr(snap).to_dict()
    png = make_qr_png(_qr_url(qr["token"]), get_settings()["qrErrorCorrection"])
    resp = send_file(BytesIO(png), mimetype="image/png", as_attachment=request.args.get("download") == "1",
                     download_name=f"qr-{meeting_id}.png")
    resp.headers["Cache-Control"] = "no-store"
    return resp


@bp.get("/meetings/<meeting_id>/qr.pdf")
@require_auth("qr")
def qr_pdf(meeting_id):
    snap = get_meeting(meeting_id)
    qr = _active_qr(snap).to_dict()
    settings = get_settings()
    png = make_qr_png(_qr_url(qr["token"]), settings["qrErrorCorrection"])
    pdf = build_qr_pdf(snap.to_dict(), png, settings)
    resp = send_file(BytesIO(pdf), mimetype="application/pdf", as_attachment=request.args.get("download") == "1",
                     download_name=f"qr-{meeting_id}.pdf")
    resp.headers["Cache-Control"] = "no-store"
    return resp


@bp.post("/meetings/<meeting_id>/qr/regenerate")
@require_auth("qr")
def qr_regenerate(meeting_id):
    snap = get_meeting(meeting_id)
    db = get_db()
    old_id = snap.to_dict().get("qrId")
    token = new_token()
    new_id = hash_token(token)
    batch = db.batch()
    if old_id:
        batch.update(db.collection("meetingQR").document(old_id),
                     {"active": False, "deactivatedAt": firestore.SERVER_TIMESTAMP, "deactivatedBy": g.user["uid"]})
    batch.set(db.collection("meetingQR").document(new_id), {
        "meetingId": meeting_id, "token": token, "active": True,
        "createdBy": g.user["uid"], "createdAt": firestore.SERVER_TIMESTAMP,
    })
    batch.update(snap.reference, {"qrId": new_id, "updatedAt": firestore.SERVER_TIMESTAMP})
    batch.commit()
    log_action("qr_token_regenerated", "meeting", meeting_id, {"title": snap.to_dict().get("title")})
    return jsonify({"ok": True})
