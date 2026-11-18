"""Admin routes: attendance registers (PDF), Excel exports and summary statistics."""
import re
from io import BytesIO

from flask import Blueprint, g, jsonify, request, send_file

from ..attendance_service import all_staff, get_meeting, meeting_attendance, meeting_stats, shape_meeting
from ..audit import log_action
from ..auth import require_auth
from ..firebase import get_db
from ..report_service import build_register_pdf, build_register_xlsx, build_summary_xlsx
from ..settings_service import get_settings
from ..utils import clean, doc_dict

bp = Blueprint("reports", __name__, url_prefix="/api/admin/reports")


def _filename(title, ext):
    safe = re.sub(r"[^A-Za-z0-9]+", "-", title or "meeting").strip("-")[:50] or "meeting"
    return f"attendance-{safe}.{ext}"


def _prepared_by():
    return g.user["name"] or g.user["email"]


@bp.get("/meeting/<meeting_id>.pdf")
@require_auth("reports")
def register_pdf(meeting_id):
    meeting = doc_dict(get_meeting(meeting_id))
    records = meeting_attendance(meeting_id, include_voided=False)
    stats, _ = meeting_stats(meeting, records, all_staff())
    pdf = build_register_pdf(meeting, records, get_settings(), _prepared_by(), stats)
    log_action("report_generated", "meeting", meeting_id, {"type": "pdf_register", "title": meeting.get("title")})
    resp = send_file(BytesIO(pdf), mimetype="application/pdf", as_attachment=request.args.get("download") == "1",
                     download_name=_filename(meeting.get("title"), "pdf"))
    resp.headers["Cache-Control"] = "no-store"
    return resp


@bp.get("/meeting/<meeting_id>.xlsx")
@require_auth("reports")
def register_xlsx(meeting_id):
    meeting = doc_dict(get_meeting(meeting_id))
    records = meeting_attendance(meeting_id, include_voided=False)
    data = build_register_xlsx(meeting, records, get_settings(), _prepared_by())
    log_action("report_generated", "meeting", meeting_id, {"type": "excel_register", "title": meeting.get("title")})
    return send_file(BytesIO(data), as_attachment=True, download_name=_filename(meeting.get("title"), "xlsx"),
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


def _summary_rows():
    date_from, date_to = clean(request.args.get("dateFrom"), 10), clean(request.args.get("dateTo"), 10)
    dept = clean(request.args.get("departmentId"), 60)
    category = clean(request.args.get("category"), 60)

    staff_list = all_staff()
    present_by_meeting = {}
    for s in get_db().collection("attendance").where("status", "==", "Present").select(["meetingId", "staffDocId"]).stream():
        d = s.to_dict()
        present_by_meeting.setdefault(d.get("meetingId"), set()).add(d.get("staffDocId"))

    rows = []
    for snap in get_db().collection("meetings").stream():
        m = shape_meeting(doc_dict(snap))
        if m["phase"] == "cancelled":
            continue
        if date_from and m.get("date", "") < date_from:
            continue
        if date_to and m.get("date", "") > date_to:
            continue
        if dept and not (m.get("audience") == "department" and m.get("departmentId") == dept):
            continue
        if category and m.get("category") != category:
            continue
        records = [{"status": "Present", "staffDocId": sid} for sid in present_by_meeting.get(m["id"], set())]
        stats, _ = meeting_stats(m, records, staff_list)
        rows.append({
            "id": m["id"], "title": m.get("title"), "date": m.get("date"), "category": m.get("category"),
            "audience": m.get("departmentName") or "Hospital-wide", "phase": m["phase"],
            "expected": stats["expected"], "attended": stats["attended"], "percentage": stats["percentage"],
        })
    rows.sort(key=lambda r: r["date"] or "", reverse=True)
    return rows, f"Filters - from: {date_from or 'any'}, to: {date_to or 'any'}"


@bp.get("/summary")
@require_auth("reports")
def summary():
    rows, _ = _summary_rows()
    total_att = sum(r["attended"] for r in rows)
    return jsonify({
        "rows": rows,
        "totals": {"meetings": len(rows), "attendance": total_att,
                   "averageAttendance": round(sum(r["percentage"] for r in rows) / len(rows), 1) if rows else 0},
    })


@bp.get("/summary.xlsx")
@require_auth("reports")
def summary_xlsx():
    rows, filters = _summary_rows()
    data = build_summary_xlsx(rows, get_settings(), _prepared_by(), filters)
    log_action("report_generated", "report", "summary", {"type": "excel_summary", "meetings": len(rows)})
    return send_file(BytesIO(data), as_attachment=True, download_name="attendance-summary.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
