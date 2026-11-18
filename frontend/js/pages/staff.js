import { api, qs } from "../api.js";
import { $, esc, icon, modal, toast, confirmBox, badge, emptyRow, debounce, deptOptions } from "../ui.js";

export async function render(view, ctx) {
  const canEdit = ctx.can("staff");
  const { departments } = await api("/departments");
  let staff = [];

  view.innerHTML = `
    <div class="page-head"><h1>Staff</h1>
      <div class="actions">${canEdit ? `<button class="btn" id="add">${icon("plus", 16)} Register staff</button>` : ""}</div></div>
    <div class="card">
      <div class="toolbar">
        <input id="q" type="search" placeholder="Search by name or Staff ID" aria-label="Search staff">
        <select id="dept" aria-label="Filter by department">${deptOptions(departments, "", "All departments")}</select>
        <select id="status" aria-label="Filter by status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <span class="muted small" id="count"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Full name</th><th>Staff ID</th><th>Department</th><th>Phone</th><th>Status</th>${canEdit ? "<th>Actions</th>" : ""}</tr></thead>
        <tbody id="rows"></tbody></table></div>
    </div>`;

  async function load() {
    const res = await api("/staff" + qs({ q: $("#q").value.trim(), departmentId: $("#dept").value, status: $("#status").value }));
    staff = res.staff;
    $("#count").textContent = res.total + " staff member" + (res.total === 1 ? "" : "s");
    $("#rows").innerHTML = staff.length ? staff.map((s) => `
      <tr><td><b>${esc(s.fullName)}</b></td><td>${esc(s.staffId)}</td><td>${esc(s.departmentName)}</td><td>${esc(s.phone) || "-"}</td>
      <td>${badge(s.status === "active" ? "Active" : "Inactive", s.status)}</td>
      ${canEdit ? `<td><button class="btn secondary sm" data-edit="${esc(s.id)}">Edit</button>
        <button class="btn ${s.status === "active" ? "danger" : "secondary"} sm" data-toggle="${esc(s.id)}">${s.status === "active" ? "Deactivate" : "Activate"}</button></td>` : ""}</tr>`).join("")
      : emptyRow(canEdit ? 6 : 5, "No staff found. Adjust the search or register a staff member.");
  }

  function form(s) {
    const active = departments.filter((d) => d.active || (s && d.id === s.departmentId));
    modal({
      title: s ? "Edit staff member" : "Register staff member",
      body: `<div class="field"><label>Full name</label><input name="fullName" maxlength="120" value="${esc(s?.fullName || "")}" required></div>
        <div class="field"><label>Official Staff ID</label><input name="staffId" maxlength="40" value="${esc(s?.staffId || "")}" ${s ? "readonly" : ""} required>
          <div class="muted small">${s ? "The Staff ID cannot be changed. To fix a wrong ID, deactivate this record and register the correct one." : "Enter the ID issued by the hospital. It is never generated automatically."}</div></div>
        <div class="field"><label>Department</label><select name="departmentId" required>${deptOptions(active, s?.departmentId || "")}</select></div>
        <div class="field"><label>Phone number (optional)</label><input name="phone" type="tel" maxlength="20" value="${esc(s?.phone || "")}"></div>`,
      submitLabel: s ? "Save changes" : "Register staff",
      onSubmit: async (data, _f, close) => {
        if (s) await api("/staff/" + s.id, { method: "PUT", body: data });
        else await api("/staff", { method: "POST", body: data });
        close();
        toast(s ? "Staff details updated." : "Staff member registered.");
        await load();
      },
    });
  }

  view.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "add") form(null);
    if (t.dataset.edit) form(staff.find((x) => x.id === t.dataset.edit));
    if (t.dataset.toggle) {
      const s = staff.find((x) => x.id === t.dataset.toggle);
      const deactivating = s.status === "active";
      const ok = await confirmBox(deactivating
        ? `Deactivate ${s.fullName}? Inactive staff cannot record attendance.`
        : `Activate ${s.fullName}?`, { confirmLabel: deactivating ? "Deactivate" : "Activate", danger: deactivating });
      if (!ok) return;
      try {
        await api(`/staff/${s.id}/status`, { method: "POST", body: { active: !deactivating } });
        toast(deactivating ? "Staff member deactivated." : "Staff member activated.");
        await load();
      } catch (err) { toast(err.message, "error"); }
    }
  });
  $("#q").addEventListener("input", debounce(load, 300));
  $("#dept").addEventListener("change", load);
  $("#status").addEventListener("change", load);

  await load();
  if (ctx.params.action === "new" && canEdit) form(null);
}
