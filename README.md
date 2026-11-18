# St. Francis Xavier Hospital - QR Meeting Attendance System

Flask backend + Firebase Firestore + Firebase Authentication (admins only) + vanilla HTML/CSS/JS frontend.
Staff scan a per-meeting QR code, enter Staff ID and department, confirm their details, and attendance is saved with server time.

## Structure
```
app.py                  entry point (gunicorn app:app)
config.py               environment-based configuration
backend/
  firebase.py           Admin SDK init
  auth.py               token verification + permissions
  audit.py              audit log writer
  attendance_service.py meeting state, staff verification, atomic attendance creation
  qr_service.py         tokens, QR PNG, print-ready PDF
  report_service.py     PDF register + Excel exports
  settings_service.py   system settings
  routes/               public, core (staff/departments/dashboard), meetings, attendance, reports, users
frontend/               login.html, admin.html, attend.html, print-qr.html, css/, js/ (+ js/pages/)
scripts/create_super_admin.py
firestore.rules
```

## 1. Firebase setup
1. Firebase console -> project `attandance-b` -> **Build -> Authentication -> Sign-in method**: enable **Email/Password**.
2. **Authentication -> Settings -> Authorized domains**: add your hosting domain.
3. **Build -> Firestore Database**: create the database (production mode).
4. Publish the rules: paste `firestore.rules` in the Rules tab (or `firebase deploy --only firestore:rules`).
   All client access is denied; only the Flask backend (Admin SDK) reads/writes.
5. **Project settings -> Service accounts -> Generate new private key**. Save as `serviceAccountKey.json`
   (never commit it; it is in `.gitignore`).
6. The web config is already in `frontend/js/firebase-config.js`.

## 2. Local development
```bash
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # edit values
python scripts/create_super_admin.py
python app.py                 # http://localhost:5000
```
For phone testing set `PUBLIC_BASE_URL` to your computer's LAN address (e.g. `http://192.168.1.10:5000`).
The first admin can then sign in at `/login.html`; create other admins under **Administrators**.

## 3. Environment variables
| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Flask secret |
| `PUBLIC_BASE_URL` | Public address used inside QR codes (no trailing slash) |
| `APP_TIMEZONE` | Default `Africa/Accra` |
| `FIREBASE_CREDENTIALS_FILE` / `FIREBASE_CREDENTIALS_JSON` | Service account (file path or one-line JSON secret) |
| `PUBLIC_RATE_LIMIT` | Public endpoint limit, default `20 per minute` |
| `RATELIMIT_STORAGE_URI` | `memory://` or a Redis URL for multiple workers |
| `TRUST_PROXY` | `1` behind a proxy/load balancer |

## 4. Firestore collections
`users` (admin profiles: role, permissions, active), `staff` (doc id = hash of Staff ID, guaranteeing uniqueness),
`departments`, `meetings`, `meetingQR` (doc id = hash of token; one active per meeting), `attendance`
(doc id = `meetingId_staffHash`, created with `create()` so duplicates and simultaneous scans fail atomically),
`auditLogs` (server timestamps), `systemSettings/main`.
No composite indexes are required.

## 5. Deployment (Render / Railway / any VPS)
- Build: `pip install -r requirements.txt`  Start: `gunicorn app:app --workers 2 --bind 0.0.0.0:$PORT`
- Set the environment variables above as secrets (use `FIREBASE_CREDENTIALS_JSON`), `TRUST_PROXY=1`, HTTPS enabled.
- Set `PUBLIC_BASE_URL` to the final HTTPS URL **before** printing QR codes. If the URL changes later, reprint (the token stays valid; only the domain changes).
- With more than one worker use Redis for `RATELIMIT_STORAGE_URI`.

## 6. Notes
- Permissions: staff, departments, meetings, qr, attendance_view, attendance_manual, reports. Super Admin has all plus users, audit logs, settings.
- Attendance opens automatically within the meeting's opening/closing window, or manually via Open/Close attendance (manual open stays open until closed).
- Monitoring refreshes every 5 seconds (polling), because direct Firestore access from browsers is blocked by design.
- Corrections never delete: old values are kept in the record's `history` and in audit logs.
- Expected attendee counts are estimates from active staff and meeting audience.

## 7. Test checklist
Sign in as Super Admin -> create admin -> add departments/staff (duplicate ID rejected) -> create meeting -> preview/print/download QR ->
scan printed QR with a phone -> verify + confirm -> duplicate scan rejected -> close attendance and scan again (rejected) ->
manual add and correction with reason -> download PDF/Excel -> check audit logs -> try admin actions without permission (403).
