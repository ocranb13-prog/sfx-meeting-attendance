import { api, qs } from "../api.js";
import { $, esc, badge, emptyRow, debounce, deptOptions } from "../ui.js";

export async function render(view) {
  const [{ meetings }, { departments }] = await Promise.all([api("/meetings"), api("/departments")]);

  view.innerHTML = `
    <div class="page-head"><h1>Attendance history</h1></div>
    <div class="card">
      <div class="toolbar">
        <select id="meeting" aria-label="Meeting"><option value="">All meetings</option>
          ${meetings.map((m) => `<option value="${esc(m.id)}">${esc(m.date)} - ${esc(m.title)}</option>`).join("")}</select>
        <select id="dept" aria-label="Department">${deptOptions(departments, "", "All departments")}</select>
        <input id="from" type="date" aria-label="From date" title="From date">
        <input id="to" type="date" aria-label="To date" title="To date">
        <input id="q" type="search" placeholder="Search by name or Staff ID" aria-label="Search">
        <span class="muted small" id="count"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>S/N</th><th>Full name</th><th>Staff ID</th><th>Department</th><th>Meeting</th><th>Date</th><th>Time</th><th>Method</th><th>Status</th></tr></thead>
        <tbody id="rows"></tbody></table></div>
    </div>`;

  async function load() {
    const { records } = await api("/attendance" + qs({
      meetingId: $("#meeting").value, departmentId: $("#dept").value,
      dateFrom: $("#from").value, dateTo: $("#to").value, q: $("#q").value.trim(),
    }));
    $("#count").textContent = records.length + " record" + (records.length === 1 ? "" : "s");
    $("#rows").innerHTML = records.length ? records.map((r) => `<tr>
      <td>${r.serial}</td><td><b>${esc(r.fullName)}</b></td><td>${esc(r.staffId)}</td><td>${esc(r.departmentName)}</td>
      <td>${esc(r.meetingTitle)}</td><td>${esc(r.date)}</td><td>${esc(r.time)}</td><td>${badge(r.method)}</td><td>${badge(r.status)}</td></tr>`).join("")
      : emptyRow(9, "No attendance records match these filters.");
  }

  ["#meeting", "#dept", "#from", "#to"].forEach((s) => $(s).addEventListener("change", load));
  $("#q").addEventListener("input", debounce(load, 300));
  await load();
}
