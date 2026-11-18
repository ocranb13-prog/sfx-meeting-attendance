import { api, fetchBlob, downloadFile, openPdf } from "../api.js";
import { $, esc, icon, modal, toast, confirmBox, askReason, badge, phaseBadge, emptyRow } from "../ui.js";
import { openMeetingForm } from "./meeting-form.js";

const POLL_MS = 5000;

export async function renderDetail(view, ctx) {
  const id = ctx.id;
  const canAtt = ctx.can("attendance_view");
  const canManual = ctx.can("attendance_manual");
  const canMeet = ctx.can("meetings");
  const canQr = ctx.can("qr");
  const canRep = ctx.can("reports");
  let data = null;
  let tab = "present";

  async function fetchData() {
    if (canAtt) data = await api(`/meetings/${id}/attendance`);
    else data = { meeting: (await api(`/meetings/${id}`)).meeting, records: [], stats: null, notAttended: [] };
  }
  await fetchData();

  view.innerHTML = `
    <div class="page-head">
      <div><a href="#/meetings" class="small">&larr; All meetings</a><h1 id="title"></h1></div>
      <div class="actions" id="actions"></div>
    </div>
    <div class="card" id="info"></div>
    ${canQr ? `<div class="card"><h2>Meeting QR code</h2>
      <div class="quick" style="margin-bottom:8px">
        <button class="btn secondary" data-act="preview">${icon("qr", 16)} Preview QR code</button>
        <a class="btn secondary" href="/print-qr.html?meeting=${encodeURIComponent(id)}&auto=1" target="_blank" rel="noopener">${icon("print", 16)} Print QR code</a>
        <button class="btn secondary" data-act="png">${icon("download", 16)} Download PNG</button>
        <button class="btn secondary" data-act="pdf">${icon("download", 16)} Download PDF</button>
        <a class="btn secondary" href="/print-qr.html?meeting=${encodeURIComponent(id)}" target="_blank" rel="noopener">${icon("print", 16)} Reprint QR code</a>
        <button class="btn danger" data-act="regen">Regenerate token</button>
      </div>
      <div class="muted small">One QR code belongs to this meeting. It only records attendance while attendance is open.</div>
      <div class="copybox" id="qr-url">Loading link...</div></div>` : ""}
    ${canRep ? `<div class="card"><h2>Reports</h2><div class="quick" style="margin:0">
        <button class="btn secondary" data-act="rep-pdf">${icon("download", 16)} Download PDF register</button>
        <button class="btn secondary" data-act="rep-print">${icon("print", 16)} Print register</button>
        <button class="btn secondary" data-act="rep-xlsx">${icon("download", 16)} Export Excel</button></div></div>` : ""}
    ${canAtt ? `<div id="att">
      <div class="grid stats" id="stats"></div>
      <div class="card">
        <div class="tabs" id="tabs">
          <button type="button" data-tab="present" class="active">Attended</button>
          <button type="button" data-tab="missing">Not yet attended</button></div>
        <div class="toolbar">
          <input id="q" type="search" placeholder="Search by name or Staff ID" aria-label="Search attendance">
          <select id="dept" aria-label="Filter by department"></select>
          <select id="sort" aria-label="Sort"><option value="time">Sort: time</option><option value="name">Sort: name</option><option value="staffId">Sort: Staff ID</option><option value="dept">Sort: department</option></select>
          ${canManual ? `<button class="btn" id="manual">${icon("plus", 16)} Add attendance manually</button>` : ""}
        </div>
        <div class="table-wrap"><table><thead id="thead"></thead><tbody id="rows"></tbody></table></div>
        <p class="muted small" id="note" style="margin-bottom:0"></p>
      </div></div>` : ""}`;

  // ---------- drawing ----------
  function drawHead() {
    const m = data.meeting;
    $("#title").innerHTML = `${esc(m.title)} ${phaseBadge(m.phase)}`;
    const acts = [];
    if (canMeet && m.phase !== "cancelled") {
      acts.push(m.attendanceOpen
        ? `<button class="btn danger" data-act="close">Close attendance</button>`
        : `<button class="btn" data-act="open">Open attendance</button>`);
      acts.push(`<button class="btn secondary" data-act="edit">Edit</button>`);
      acts.push(`<button class="btn danger" data-act="cancel">Cancel meeting</button>`);
    }
    $("#actions").innerHTML = acts.join("");
    $("#info").innerHTML = `
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        <div><span class="muted small">Date and time</span><br><b>${esc(m.date)}</b>, ${esc(m.startTime)} - ${esc(m.endTime)}</div>
        <div><span class="muted small">Venue</span><br><b>${esc(m.venue)}</b></div>
        <div><span class="muted small">Category</span><br><b>${esc(m.category)}</b></div>
        <div><span class="muted small">Audience</span><br><b>${esc(m.departmentName || "Hospital-wide")}</b></div>
        <div><span class="muted small">Attendance window</span><br><b>${esc((m.openingTime || "").replace("T", " "))}</b> to <b>${esc((m.closingTime || "").replace("T", " "))}</b></div>
        <div><span class="muted small">Attendance right now</span><br>${m.attendanceOpen ? badge("Open", "active") : badge("Closed", "closed")}
          ${m.attendanceMessage ? `<span class="muted small"> ${esc(m.attendanceMessage)}</span>` : ""}</div>
      </div>
      ${m.description ? `<p style="margin-bottom:0">${esc(m.description)}</p>` : ""}`;
  }

  function drawStats() {
    if (!canAtt) return;
    const s = data.stats;
    $("#stats").innerHTML = `
      <div class="stat">${icon("users", 26)}<div><b>${s.expected}</b><span>Expected attendees (estimate)</span></div></div>
      <div class="stat">${icon("check", 26)}<div><b>${s.attended}</b><span>Attended</span></div></div>
      <div class="stat">${icon("clock", 26)}<div><b>${s.notYet}</b><span>Not yet attended</span></div></div>
      <div class="stat">${icon("chart", 26)}<div><b>${s.percentage}%</b><span>Attendance</span>
        <div class="progress" style="width:120px"><div style="width:${s.percentage}%"></div></div></div></div>`;
    $("#note").textContent = s.note;
    // department filter options (kept across refreshes)
    const sel = $("#dept");
    const keep = sel.value;
    const names = [...new Set([...data.records.map((r) => r.departmentName), ...data.notAttended.map((r) => r.departmentName)].filter(Boolean))].sort();
    sel.innerHTML = `<option value="">All departments</option>` + names.map((n) => `<option ${n === keep ? "selected" : ""}>${esc(n)}</option>`).join("");
  }

  function drawTable() {
    if (!canAtt) return;
    const q = $("#q").value.trim().toLowerCase();
    const dept = $("#dept").value;
    const sort = $("#sort").value;
    let rows = tab === "present" ? [...data.records] : [...data.notAttended];
    if (q) rows = rows.filter((r) => (r.fullName || "").toLowerCase().includes(q) || (r.staffId || "").toLowerCase().includes(q));
    if (dept) rows = rows.filter((r) => r.departmentName === dept);
    const key = { name: "fullName", staffId: "staffId", dept: "departmentName" }[sort];
    if (key) rows.sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || "")));

    if (tab === "present") {
      $("#thead").innerHTML = `<tr><th>S/N</th><th>Full name</th><th>Staff ID</th><th>Department</th><th>Meeting</th><th>Date</th><th>Time</th><th>Method</th><th>Status</th>${canManual ? "<th></th>" : ""}</tr>`;
      $("#rows").innerHTML = rows.length ? rows.map((r) => `<tr>
        <td>${r.serial}</td><td><b>${esc(r.fullName)}</b></td><td>${esc(r.staffId)}</td><td>${esc(r.departmentName)}</td>
        <td>${esc(r.meetingTitle)}</td><td>${esc(r.date)}</td><td>${esc(r.time)}</td><td>${badge(r.method)}</td><td>${badge(r.status)}</td>
        ${canManual ? `<td><button class="btn secondary sm" data-correct="${esc(r.id)}">Correct</button></td>` : ""}</tr>`).join("")
        : emptyRow(canManual ? 10 : 9, "No attendance recorded yet.");
    } else {
      $("#thead").innerHTML = `<tr><th>S/N</th><th>Full name</th><th>Staff ID</th><th>Department</th>${canManual ? "<th></th>" : ""}</tr>`;
      $("#rows").innerHTML = rows.length ? rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.fullName)}</b></td>
        <td>${esc(r.staffId)}</td><td>${esc(r.departmentName)}</td>
        ${canManual ? `<td><button class="btn secondary sm" data-manual="${esc(r.staffId)}">Mark present</button></td>` : ""}</tr>`).join("")
        : emptyRow(canManual ? 5 : 4, "Everyone expected has attended.");
    }
  }

  const drawAll = () => { drawHead(); drawStats(); drawTable(); };
  async function refresh() { await fetchData(); drawAll(); }

  // ---------- manual attendance & corrections ----------
  function manualForm(prefillId = "") {
    modal({
      title: "Add attendance manually",
      body: `<p class="muted small">Use this when a staff member could not scan the QR code. A reason is required and the entry is audited.</p>
        <div class="field"><label>Official Staff ID</label><input name="staffId" list="missing-ids" value="${esc(prefillId)}" required autocomplete="off">
          <datalist id="missing-ids">${data.notAttended.map((s) => `<option value="${esc(s.staffId)}">${esc(s.fullName)}</option>`).join("")}</datalist></div>
        <div class="field"><label>Reason</label><textarea name="reason" maxlength="300" required></textarea></div>`,
      submitLabel: "Add attendance",
      onSubmit: async (d, _f, close) => {
        await api(`/meetings/${id}/attendance/manual`, { method: "POST", body: d });
        close();
        toast("Attendance added manually.");
        await refresh();
      },
    });
  }

  function correctForm(rec) {
    const local = (rec.attendedAtLocal || "").slice(0, 16).replace(" ", "T");
    modal({
      title: "Correct attendance record",
      body: `<p><b>${esc(rec.fullName)}</b> (${esc(rec.staffId)})</p>
        <p class="muted small">Nothing is deleted. The previous values are kept in the record's history and the change is audited.</p>
        <div class="field"><label>Status</label><select name="status">
          <option value="Present" ${rec.status === "Present" ? "selected" : ""}>Present</option>
          <option value="Voided" ${rec.status === "Voided" ? "selected" : ""}>Voided (not counted)</option></select></div>
        <div class="field"><label>Attendance date and time</label><input type="datetime-local" name="attendedAt" value="${esc(local)}"></div>
        <div class="field"><label>Reason for correction</label><textarea name="reason" maxlength="300" required></textarea></div>`,
      submitLabel: "Save correction",
      onSubmit: async (d, _f, close) => {
        await api("/attendance/" + rec.id, { method: "PUT", body: d });
        close();
        toast("Attendance corrected.");
        await refresh();
      },
    });
  }

  // ---------- actions ----------
  async function act(name) {
    const m = data.meeting;
    if (name === "open") {
      if (await confirmBox("Open attendance now? Staff will be able to scan the QR code and record attendance.", { confirmLabel: "Open attendance" })) {
        await api(`/meetings/${id}/open`, { method: "POST" }); toast("Attendance is now open."); await refresh();
      }
    } else if (name === "close") {
      if (await confirmBox("Close attendance? New QR scans will be rejected.", { confirmLabel: "Close attendance", danger: true })) {
        await api(`/meetings/${id}/close`, { method: "POST" }); toast("Attendance closed."); await refresh();
      }
    } else if (name === "cancel") {
      const reason = await askReason("Cancel meeting", `Cancel "${m.title}"? Attendance will stop being accepted.`);
      if (reason) { await api(`/meetings/${id}/cancel`, { method: "POST", body: { reason } }); toast("Meeting cancelled."); await refresh(); }
    } else if (name === "edit") {
      await openMeetingForm(ctx, m, refresh);
    } else if (name === "preview") {
      const url = URL.createObjectURL(await fetchBlob(`/meetings/${id}/qr.png`));
      modal({ title: "QR code preview", body: `<div class="qr-preview"><img src="${url}" alt="QR code for ${esc(m.title)}"><p class="muted small">${esc(m.title)}</p></div>` });
    } else if (name === "png") {
      await downloadFile(`/meetings/${id}/qr.png?download=1`, `qr-${m.title.replace(/[^A-Za-z0-9]+/g, "-")}.png`);
    } else if (name === "pdf") {
      await downloadFile(`/meetings/${id}/qr.pdf?download=1`, `qr-${m.title.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`);
    } else if (name === "regen") {
      if (await confirmBox("Regenerate the QR token? The old QR code stops working immediately and any printed copies must be replaced.", { confirmLabel: "Regenerate", danger: true })) {
        await api(`/meetings/${id}/qr/regenerate`, { method: "POST" }); toast("New QR code generated. The old one is now invalid."); await loadQrUrl();
      }
    } else if (name === "rep-pdf") {
      await downloadFile(`/reports/meeting/${id}.pdf?download=1`, "attendance-register.pdf");
    } else if (name === "rep-print") {
      await openPdf(`/reports/meeting/${id}.pdf`);
    } else if (name === "rep-xlsx") {
      await downloadFile(`/reports/meeting/${id}.xlsx`, "attendance-register.xlsx");
    }
  }

  async function loadQrUrl() {
    if (!canQr) return;
    try { $("#qr-url").textContent = "Attendance link: " + (await api(`/meetings/${id}/qr`)).url; }
    catch (e) { $("#qr-url").textContent = e.message; }
  }

  view.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    try {
      if (t.dataset.act) await act(t.dataset.act);
      else if (t.dataset.tab) {
        tab = t.dataset.tab;
        view.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b === t));
        drawTable();
      } else if (t.id === "manual") manualForm();
      else if (t.dataset.manual) manualForm(t.dataset.manual);
      else if (t.dataset.correct) correctForm(data.records.find((r) => r.id === t.dataset.correct));
    } catch (err) { toast(err.message, "error"); }
  });
  if (canAtt) ["#q", "#dept", "#sort"].forEach((s) => $(s).addEventListener("input", drawTable));

  drawAll();
  loadQrUrl();

  // Near-real-time monitoring: refresh every few seconds, but not while a dialog is open.
  const timer = canAtt ? setInterval(() => {
    if (document.hidden || document.querySelector(".overlay")) return;
    refresh().catch(() => {});
  }, POLL_MS) : null;
  return () => { if (timer) clearInterval(timer); };
}
