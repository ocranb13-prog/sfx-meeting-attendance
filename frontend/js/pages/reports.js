import { api, qs, downloadFile, openPdf } from "../api.js";
import { $, esc, icon, toast, phaseBadge, emptyRow, deptOptions } from "../ui.js";

export async function render(view, ctx) {
  const { departments } = await api("/departments");

  view.innerHTML = `
    <div class="page-head"><h1>Reports</h1>
      <div class="actions"><button class="btn" id="export">${icon("download", 16)} Export summary to Excel</button></div></div>
    <div class="card">
      <div class="toolbar">
        <label class="small" style="margin:0">From <input id="from" type="date"></label>
        <label class="small" style="margin:0">To <input id="to" type="date"></label>
        <select id="dept" aria-label="Department meetings">${deptOptions(departments, "", "All meetings")}</select>
        <select id="cat" aria-label="Category"><option value="">All categories</option>${ctx.settings.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
      </div>
      <div class="grid stats" id="totals"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Meeting</th><th>Date</th><th>Category</th><th>Audience</th><th>Expected (est.)</th><th>Attended</th><th>%</th><th>Status</th><th>Register</th></tr></thead>
        <tbody id="rows"></tbody></table></div>
      <p class="muted small">Expected counts are estimates based on active staff records and each meeting's audience.</p>
    </div>`;

  const filters = () => ({ dateFrom: $("#from").value, dateTo: $("#to").value, departmentId: $("#dept").value, category: $("#cat").value });

  async function load() {
    const { rows, totals } = await api("/reports/summary" + qs(filters()));
    $("#totals").innerHTML = `
      <div class="stat">${icon("calendar", 26)}<div><b>${totals.meetings}</b><span>Meetings</span></div></div>
      <div class="stat">${icon("check", 26)}<div><b>${totals.attendance}</b><span>Total attendance</span></div></div>
      <div class="stat">${icon("chart", 26)}<div><b>${totals.averageAttendance}%</b><span>Average attendance</span></div></div>`;
    $("#rows").innerHTML = rows.length ? rows.map((r) => `<tr>
      <td><a href="#/meetings/${esc(r.id)}">${esc(r.title)}</a></td><td>${esc(r.date)}</td><td>${esc(r.category)}</td><td>${esc(r.audience)}</td>
      <td>${r.expected}</td><td>${r.attended}</td><td>${r.percentage}%</td><td>${phaseBadge(r.phase)}</td>
      <td><button class="btn secondary sm" data-pdf="${esc(r.id)}">PDF</button>
          <button class="btn secondary sm" data-print="${esc(r.id)}">Print</button>
          <button class="btn secondary sm" data-xlsx="${esc(r.id)}">Excel</button></td></tr>`).join("")
      : emptyRow(9, "No meetings match these filters.");
  }

  ["#from", "#to", "#dept", "#cat"].forEach((s) => $(s).addEventListener("change", load));
  $("#export").addEventListener("click", async () => {
    try { await downloadFile("/reports/summary.xlsx" + qs(filters()), "attendance-summary.xlsx"); }
    catch (e) { toast(e.message, "error"); }
  });
  view.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.dataset.pdf) await downloadFile(`/reports/meeting/${b.dataset.pdf}.pdf?download=1`, "attendance-register.pdf");
      if (b.dataset.print) await openPdf(`/reports/meeting/${b.dataset.print}.pdf`);
      if (b.dataset.xlsx) await downloadFile(`/reports/meeting/${b.dataset.xlsx}.xlsx`, "attendance-register.xlsx");
    } catch (err) { toast(err.message, "error"); }
  });
  await load();
}
