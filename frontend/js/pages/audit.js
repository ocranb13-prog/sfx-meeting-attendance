import { api } from "../api.js";
import { $, esc, emptyRow, debounce } from "../ui.js";

export async function render(view) {
  const { logs } = await api("/audit?limit=300");

  view.innerHTML = `
    <div class="page-head"><h1>Audit logs</h1></div>
    <div class="card">
      <div class="toolbar"><input id="q" type="search" placeholder="Filter by user, action or record" aria-label="Filter audit logs">
        <span class="muted small" id="count"></span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date and time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
        <tbody id="rows"></tbody></table></div>
      <p class="muted small">Audit entries are written by the server with trusted timestamps and cannot be edited from the application. Showing the latest 300.</p>
    </div>`;

  function draw() {
    const q = $("#q").value.trim().toLowerCase();
    const rows = logs.filter((l) => !q || [l.userName, l.userEmail, l.action, l.entity, l.entityId].join(" ").toLowerCase().includes(q));
    $("#count").textContent = rows.length + " entries";
    $("#rows").innerHTML = rows.length ? rows.map((l) => `<tr>
      <td class="small" style="white-space:nowrap">${esc(l.timestampLocal)}</td>
      <td>${esc(l.userName || l.userEmail || "-")}<div class="muted small">${esc(l.userEmail)}</div></td>
      <td><b>${esc(l.action)}</b></td><td>${esc(l.entity)}<div class="muted small">${esc(l.entityId)}</div></td>
      <td class="small">${esc(Object.entries(l.details || {}).map(([k, v]) => `${k}: ${v}`).join("; "))}</td></tr>`).join("")
      : emptyRow(5, "No audit entries match.");
  }
  $("#q").addEventListener("input", debounce(draw, 200));
  draw();
}
