"""PDF attendance registers (ReportLab) and Excel exports (OpenPyXL)."""
from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .settings_service import logo_bytes
from .utils import app_tz

BLUE = colors.HexColor("#0B4EA2")
LIGHT = colors.HexColor("#EEF3FA")


def _make_canvas(footer_text):
    class NumberedCanvas(canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved = []

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._saved)
            for state in self._saved:
                self.__dict__.update(state)
                self.setFont("Helvetica", 8)
                self.setFillColor(colors.grey)
                self.drawString(15 * mm, 9 * mm, footer_text[:110])
                self.drawRightString(A4[0] - 15 * mm, 9 * mm, f"Page {self._pageNumber} of {total}")
                super().showPage()
            super().save()

    return NumberedCanvas


def build_register_pdf(meeting, records, settings, prepared_by, stats=None):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=18 * mm,
                            title=f"Attendance Register - {meeting.get('title', '')}")
    ss = getSampleStyleSheet()
    center = ParagraphStyle("c", parent=ss["Normal"], alignment=1, fontSize=10)
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontSize=17, textColor=BLUE, spaceAfter=2, leading=21)
    h2 = ParagraphStyle("h2", parent=ss["Title"], fontSize=13, spaceAfter=6, leading=16)
    cell = ParagraphStyle("cell", parent=ss["Normal"], fontSize=8.5, leading=10.5)
    cellb = ParagraphStyle("cellb", parent=cell, fontName="Helvetica-Bold", textColor=colors.white)
    meta = ParagraphStyle("meta", parent=ss["Normal"], fontSize=10, leading=14)

    story = []
    logo = logo_bytes(settings)
    if logo:
        try:
            img = Image(BytesIO(logo), width=22 * mm, height=22 * mm, kind="proportional")
            img.hAlign = "CENTER"
            story.append(img)
        except Exception:
            pass
    story.append(Paragraph(escape(settings["hospitalName"].upper()), h1))
    story.append(Paragraph("MEETING ATTENDANCE REGISTER", h2))
    contact = " | ".join(x for x in (settings.get("address"), settings.get("phone"), settings.get("email")) if x)
    if contact:
        story.append(Paragraph(escape(contact), center))
    story.append(Spacer(1, 4 * mm))

    time_text = f"{meeting.get('startTime', '')} - {meeting.get('endTime', '')}"
    info = [
        [Paragraph("<b>Meeting title:</b>", meta), Paragraph(escape(meeting.get("title", "")), meta)],
        [Paragraph("<b>Date:</b>", meta), Paragraph(escape(f"{meeting.get('date', '')}  ({time_text})"), meta)],
        [Paragraph("<b>Venue:</b>", meta), Paragraph(escape(meeting.get("venue", "")), meta)],
        [Paragraph("<b>Category:</b>", meta), Paragraph(escape(meeting.get("category", "")), meta)],
    ]
    t = Table(info, colWidths=[35 * mm, 145 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story += [t, Spacer(1, 4 * mm)]

    header = [Paragraph(x, cellb) for x in ("S/N", "Full Name", "Staff ID", "Department", "Time", "Method")]
    rows = [header]
    present = [r for r in records if r.get("status") == "Present"]
    for i, r in enumerate(present, 1):
        rows.append([
            Paragraph(str(i), cell),
            Paragraph(escape(r.get("fullName") or ""), cell),
            Paragraph(escape(r.get("staffId") or ""), cell),
            Paragraph(escape(r.get("departmentName") or ""), cell),
            Paragraph(escape(r.get("time") or ""), cell),
            Paragraph(escape(r.get("method") or ""), cell),
        ])
    if len(rows) == 1:
        rows.append([Paragraph("", cell), Paragraph("No attendance recorded.", cell)] + [Paragraph("", cell)] * 4)
    table = Table(rows, colWidths=[12 * mm, 52 * mm, 28 * mm, 42 * mm, 24 * mm, 22 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#B8C4D6")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(2, len(rows), 2):
        style.append(("BACKGROUND", (0, i), (-1, i), LIGHT))
    table.setStyle(TableStyle(style))
    story += [table, Spacer(1, 6 * mm)]

    total_line = f"<b>Total attendees:</b> {len(present)}"
    if stats:
        total_line += f" &nbsp; (estimated expected: {stats['expected']}, {stats['percentage']}%)"
    story.append(Paragraph(total_line, meta))
    story.append(Spacer(1, 10 * mm))

    printed = datetime.now(app_tz()).strftime("%Y-%m-%d %H:%M")
    sign = Table(
        [[Paragraph(f"<b>Prepared by:</b> {escape(prepared_by)}", meta),
          Paragraph(f"<b>Date of printing:</b> {printed}", meta)],
         [Spacer(1, 12 * mm), ""],
         [Paragraph(f"<b>{escape(settings['organizerLabel'])}:</b> ________________________", meta), ""]],
        colWidths=[95 * mm, 85 * mm],
    )
    sign.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(sign)

    footer = settings.get("reportFooter") or f"{settings['hospitalName']} - Meeting Attendance Register"
    doc.build(story, canvasmaker=_make_canvas(footer))
    return buf.getvalue()


def _style_header(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0B4EA2")
        cell.alignment = Alignment(horizontal="center", vertical="center")


def _autosize(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def build_register_xlsx(meeting, records, settings, prepared_by):
    wb = Workbook()
    ws = wb.active
    ws.title = "Attendance"
    ws["A1"] = settings["hospitalName"].upper()
    ws["A1"].font = Font(bold=True, size=14, color="0B4EA2")
    ws["A2"] = "MEETING ATTENDANCE REGISTER"
    ws["A2"].font = Font(bold=True, size=12)
    ws["A3"], ws["B3"] = "Meeting", meeting.get("title", "")
    ws["A4"], ws["B4"] = "Date", f"{meeting.get('date', '')} ({meeting.get('startTime', '')} - {meeting.get('endTime', '')})"
    ws["A5"], ws["B5"] = "Venue", meeting.get("venue", "")
    for r in range(3, 6):
        ws.cell(row=r, column=1).font = Font(bold=True)

    head = ["S/N", "Full Name", "Staff ID", "Department", "Meeting Title", "Date", "Time", "Method", "Status"]
    ws.append([])
    ws.append(head)
    _style_header(ws, 7, len(head))
    present = [r for r in records if r.get("status") == "Present"]
    for i, r in enumerate(present, 1):
        ws.append([i, r.get("fullName"), r.get("staffId"), r.get("departmentName"), r.get("meetingTitle"),
                   r.get("date"), r.get("time"), r.get("method"), r.get("status")])
    ws.append([])
    ws.append(["", "Total attendees", len(present)])
    ws.append(["", "Prepared by", prepared_by])
    ws.append(["", "Date of printing", datetime.now(app_tz()).strftime("%Y-%m-%d %H:%M")])
    ws.freeze_panes = "A8"
    _autosize(ws, [8, 32, 16, 26, 32, 12, 12, 10, 10])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_summary_xlsx(rows, settings, prepared_by, filters_text=""):
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = settings["hospitalName"].upper()
    ws["A1"].font = Font(bold=True, size=14, color="0B4EA2")
    ws["A2"] = "MEETING ATTENDANCE SUMMARY REPORT"
    ws["A2"].font = Font(bold=True, size=12)
    ws["A3"] = filters_text
    head = ["S/N", "Meeting", "Date", "Category", "Audience", "Expected (est.)", "Attended", "Attendance %", "Status"]
    ws.append([])
    ws.append(head)
    _style_header(ws, 5, len(head))
    for i, r in enumerate(rows, 1):
        ws.append([i, r["title"], r["date"], r["category"], r["audience"], r["expected"], r["attended"],
                   r["percentage"], r["phase"]])
    ws.append([])
    ws.append(["", "Meetings", len(rows), "", "", "", sum(r["attended"] for r in rows)])
    ws.append(["", "Prepared by", prepared_by])
    ws.freeze_panes = "A6"
    _autosize(ws, [8, 36, 12, 24, 24, 16, 12, 14, 12])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
