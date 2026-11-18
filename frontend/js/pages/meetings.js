import { api, qs } from "../api.js";
import { $, $$, esc, icon, phaseBadge, emptyRow, debounce } from "../ui.js";
import { openMeetingForm } from "./meeting-form.js";

export { renderDetail } from "./meeting-detail.js";

export async function render(view, ctx) {
  const canCreate = ctx.can("meetings");
  let phase = "";

  view.innerHTML = `
    <div class="page-head"><h1>Meetings</h1>
      <div class="actions">${canCreate ? `<button class="btn" id="add">${icon("plus", 16)} Create meeting</button>` : ""}</div></div>
    <div class="card">
      <div class="tabs" id="tabs">
        ${[["", "All"], ["upcoming", "Upcoming"], ["active", "Active"], ["completed", "Previous"], ["cancelled", "Cancelled"]]
          .map(([k, l]) => `<button type="button" data-phase="${k}" class="${k === "" ? "active" : ""}">${l}</button>`).join("")}
      </div>
      <div class="toolbar"><input id="q" type="search" placeholder="Search by title or venue" aria-label="Search meetings"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Date</th><th>Time</th><th>Venue</th><th>Category</th><th>Audience</th><th>Attended</th><th>Status</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table></div>
    </div>`;

  async function load() {
    const { meetings } = await api("/meetings" + qs({ q: $("#q").value.trim(), phase }));
    $("#rows").innerHTML = meetings.length ? meetings.map((m) => `
      <tr><td><a href="#/meetings/${esc(m.id)}"><b>${esc(m.title)}</b></a></td><td>${esc(m.date)}</td>
      <td>${esc(m.startTime)} - ${esc(m.endTime)}</td><td>${esc(m.venue)}</td><td>${esc(m.category)}</td>
      <td>${esc(m.departmentName || "Hospital-wide")}</td><td>${m.attendedCount}</td><td>${phaseBadge(m.phase)}</td>
      <td><a class="btn secondary sm" href="#/meetings/${esc(m.id)}">Open</a></td></tr>`).join("")
      : emptyRow(9, "No meetings found.");
  }

  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    phase = b.dataset.phase;
    $$("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    load();
  });
  $("#q").addEventListener("input", debounce(load, 300));
  const add = $("#add");
  if (add) add.addEventListener("click", () => openMeetingForm(ctx, null, load));

  await load();
  if (ctx.params.action === "new" && canCreate) openMeetingForm(ctx, null, load);
}
