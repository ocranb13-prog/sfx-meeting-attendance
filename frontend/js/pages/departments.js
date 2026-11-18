import { api } from "../api.js";
import { $, $$, esc, icon, modal, toast, confirmBox, badge, emptyRow } from "../ui.js";

export async function render(view, ctx) {
  const canEdit = ctx.can("departments");
  let departments = [];

  view.innerHTML = `
    <div class="page-head"><h1>Departments</h1>
      <div class="actions">${canEdit ? `<button class="btn" id="add">${icon("plus", 16)} Add department</button>` : ""}</div></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Description</th><th>Registered staff</th><th>Status</th>${canEdit ? "<th>Actions</th>" : ""}</tr></thead>
      <tbody id="rows"></tbody></table></div></div>`;

  async function load() {
    departments = (await api("/departments")).departments;
    $("#rows").innerHTML = departments.length ? departments.map((d) => `
      <tr><td><b>${esc(d.name)}</b></td><td>${esc(d.description)}</td><td>${d.staffCount}</td>
      <td>${badge(d.active ? "Active" : "Inactive", d.active ? "active" : "inactive")}</td>
      ${canEdit ? `<td><button class="btn secondary sm" data-edit="${esc(d.id)}">Edit</button>
        <button class="btn ${d.active ? "danger" : "secondary"} sm" data-toggle="${esc(d.id)}">${d.active ? "Deactivate" : "Activate"}</button></td>` : ""}</tr>`).join("")
      : emptyRow(canEdit ? 5 : 4, "No departments yet. Add the first one to start registering staff.");
  }

  function form(dept) {
    modal({
      title: dept ? "Edit department" : "Add department",
      body: `<div class="field"><label>Department name</label><input name="name" maxlength="100" value="${esc(dept?.name || "")}" required></div>
             <div class="field"><label>Description (optional)</label><textarea name="description" maxlength="300">${esc(dept?.description || "")}</textarea></div>`,
      onSubmit: async (data, _f, close) => {
        if (dept) await api("/departments/" + dept.id, { method: "PUT", body: data });
        else await api("/departments", { method: "POST", body: data });
        close();
        toast(dept ? "Department updated." : "Department added.");
        await load();
      },
    });
  }

  view.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "add") form(null);
    if (t.dataset.edit) form(departments.find((d) => d.id === t.dataset.edit));
    if (t.dataset.toggle) {
      const d = departments.find((x) => x.id === t.dataset.toggle);
      const ok = await confirmBox(d.active
        ? `Deactivate ${d.name}? It will no longer appear in new registration forms.`
        : `Activate ${d.name}?`, { confirmLabel: d.active ? "Deactivate" : "Activate", danger: d.active });
      if (!ok) return;
      try {
        await api(`/departments/${d.id}/status`, { method: "POST", body: { active: !d.active } });
        toast(d.active ? "Department deactivated." : "Department activated.");
        await load();
      } catch (err) { toast(err.message, "error"); }
    }
  });

  await load();
  if (ctx.params.action === "new" && canEdit) form(null);
}
