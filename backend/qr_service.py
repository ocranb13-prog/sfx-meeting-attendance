"""QR token generation, PNG rendering and the print-ready A4 PDF sheet."""
import secrets
from io import BytesIO

import qrcode
from qrcode.constants import ERROR_CORRECT_H, ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

from .settings_service import logo_bytes

_EC = {"L": ERROR_CORRECT_L, "M": ERROR_CORRECT_M, "Q": ERROR_CORRECT_Q, "H": ERROR_CORRECT_H}


def new_token():
    """Unpredictable 256-bit URL-safe token."""
    return secrets.token_urlsafe(32)


def make_qr_png(url, error_correction="M", box_size=14):
    """High-resolution, high-contrast black-on-white PNG with a 4-module quiet zone."""
    qr = qrcode.QRCode(
        error_correction=_EC.get(error_correction, ERROR_CORRECT_M),
        box_size=box_size,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _centered_wrapped(c, text, font, size, y, width, leading):
    c.setFont(font, size)
    for line in simpleSplit(text, font, size, width):
        c.drawCentredString(A4[0] / 2, y, line)
        y -= leading
    return y


def build_qr_pdf(meeting, png_bytes, settings):
    """A4 sheet: hospital name/logo, heading, meeting details, large QR, instructions."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"QR Code - {meeting.get('title', '')}")
    W, H = A4
    y = H - 20 * mm

    logo = logo_bytes(settings)
    if logo:
        try:
            c.drawImage(ImageReader(BytesIO(logo)), (W - 25 * mm) / 2, y - 25 * mm, width=25 * mm,
                        height=25 * mm, preserveAspectRatio=True, anchor="c", mask="auto")
            y -= 30 * mm
        except Exception:
            pass

    c.setFillColorRGB(0.05, 0.25, 0.6)
    y = _centered_wrapped(c, settings["hospitalName"].upper(), "Helvetica-Bold", 20, y - 4 * mm, W - 30 * mm, 24)
    c.setFillColorRGB(0, 0, 0)
    y = _centered_wrapped(c, "MEETING ATTENDANCE REGISTRATION", "Helvetica-Bold", 22, y - 6 * mm, W - 30 * mm, 26)
    c.setStrokeColorRGB(0.05, 0.25, 0.6)
    c.setLineWidth(1.5)
    c.line(30 * mm, y - 2 * mm, W - 30 * mm, y - 2 * mm)
    y -= 12 * mm

    y = _centered_wrapped(c, meeting.get("title", ""), "Helvetica-Bold", 18, y, W - 40 * mm, 22)
    y -= 3 * mm
    time_text = f"{meeting.get('startTime', '')} - {meeting.get('endTime', '')}"
    for label, value in (("Date", meeting.get("date", "")), ("Time", time_text), ("Venue", meeting.get("venue", ""))):
        y = _centered_wrapped(c, f"{label}: {value}", "Helvetica", 13, y, W - 40 * mm, 17)

    size = 112 * mm
    qr_y = max(y - size - 8 * mm, 45 * mm)
    c.setFillColorRGB(1, 1, 1)
    c.rect((W - size) / 2, qr_y, size, size, stroke=0, fill=1)
    c.drawImage(ImageReader(BytesIO(png_bytes)), (W - size) / 2, qr_y, width=size, height=size)

    c.setFillColorRGB(0, 0, 0)
    _centered_wrapped(c, settings["qrInstruction"], "Helvetica-Bold", 13, qr_y - 10 * mm, W - 40 * mm, 17)

    contact = " | ".join(x for x in (settings.get("address"), settings.get("phone"), settings.get("email")) if x)
    if contact:
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawCentredString(W / 2, 12 * mm, contact[:140])

    c.showPage()
    c.save()
    return buf.getvalue()
