import { api } from "../api.js";
import { sendReset } from "../auth.js";
import { esc, icon, modal, toast, confirmBox, badge, emptyRow, $ } from "../ui.js";

export async function render(view, ctx) {
  const labels = ctx.me ? (await api("/me")).permissionLabels : {};
  let users = [];

  view.innerHTML = `
    <div class="page-head"><h1>Administrators</h1>
      <div class="actions"><button class="btn" id="add">${icon("plus", 16)} Create administrator</button></div></div>
    <div class="card"><p class="muted small">There is no public registration. Only a Super Admin can create administrator accounts. Passwords are managed by Firebase Authentication and are never stored by this application.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="rows"></tbody></table></div></div>`;

  async function load() {
    users = (await api("/users")).users;
    $("#rows").innerHTML = users.length ? users.map((u) => `<tr>
      <td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td>
      <td>${u.role === "super_admin" ? badge("Super Admin", "active") : badge("Admin", "upcoming")}</td>
      <td class="small">${u.role === "super_admin" ? "All" : (u.permissions || []).map((p) => esc(labels[p] || p)).join(", ") || "None"}</td>
      <td>${badge(u.active ? "Active" : "Inactive", u.active ? "active" : "inactive")}</td>
      <td><button class="btn secondary sm" data-edit="${esc(u.id)}">Edit</button>
        <button class="btn secondary sm" data-reset="${esc(u.id)}">Send reset email</button>
        <button class="btn secondary sm" data-activity="${esc(u.id)}">Activity</button>
        ${u.id === ctx.me.uid ? "" : `<button class="btn ${u.active ? "danger" : "secondary"} sm" data-toggle="${esc(u.id)}">${u.active ? "Deactivate" : "Activate"}</button>`}</td></tr>`).join("")
      : emptyRow(6, "No administrators yet.");
  }

  const permChecks = (selected = []) => `<div class="field"><label>Permissions (Admin role)</label><div class="checks">
    ${Object.entries(labels).map(([k, l]) => `<label><input type="checkbox" name="permissions" value="${k}" ${selected.includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div></div>`;

  const readPerms = (form) => [...form.querySelectorAll("input[name=permissions]:checked")].map((c) => c.value);

  function form(u) {
    modal({
      title: u ? "Edit administrator" : "Create administrator",
      submitLabel: u ? "Save changes" : "Create account",
      body: `<div class="field"><label>Full name</label><input name="name" maxlength="100" value="${esc(u?.name || "")}" required></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${esc(u?.email || "")}" ${u ? "readonly" : ""} required></div>
        ${u ? "" : `<div class="field"><label>Temporary password</label><input name="password" type="password" minlength="8" autocomplete="new-password" required>
          <div class="muted small">At least 8 characters. Ask them to use "Forgot your password?" to set their own.</div></div>`}
        <div class="field"><label>Role</label><select name="role"><option value="admin" ${u?.role !== "super_admin" ? "selected" : ""}>Admin</option>
          <option value="super_admin" ${u?.role === "super_admin" ? "selected" : ""}>Super Admin (full access)</option></select></div>
        ${permChecks(u?.permissions || [])}`,
      onSubmit: async (data, f, close) => {
        const body = { ...data, permissions: readPerms(f) };
        if (u) await api("/users/" + u.id, { method: "PUT", body });
        else await api("/users", { method: "POST", body });
        close();
        toast(u ? "Administrator updated." : "Administrator account created.");
        await load();
      },
    });
  }

  async function showActivity(u) {
    const { activity } = await api(`/users/${u.id}/activity`);
    modal({
      title: `Activity - ${u.name}`, wide: true,
      body: `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Record</th></tr></thead><tbody>
        ${activity.length ? activity.map((a) => `<tr><td>${esc(a.timestampLocal)}</td><td>${esc(a.action)}</td><td>${esc(a.entity)} ${esc(a.entityId)}</td></tr>`).join("") : emptyRow(3, "No activity recorded.")}
        </tbody></table></div>`,
    });
  }

  view.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.id === "add") form(null);
      if (b.dataset.edit) form(users.find((x) => x.id === b.dataset.edit));
      if (b.dataset.activity) await showActivity(users.find((x) => x.id === b.dataset.activity));
      if (b.dataset.reset) {
        const u = users.find((x) => x.id === b.dataset.reset);
        if (await confirmBox(`Send a password reset email to ${u.email}?`, { confirmLabel: "Send email" })) {
          await sendReset(u.email);
          toast("Password reset email sent.");
        }
      }
      if (b.dataset.toggle) {
        const u = users.find((x) => x.id === b.dataset.toggle);
        if (await confirmBox(u.active ? `Deactivate ${u.name}? They will be signed out and unable to log in.` : `Activate ${u.name}?`,
          { confirmLabel: u.active ? "Deactivate" : "Activate", danger: u.active })) {
          await api(`/users/${u.id}/status`, { method: "POST", body: { active: !u.active } });
          toast(u.active ? "Account deactivated." : "Account activated.");
          await load();
        }
      }
    } catch (err) { toast(err.message, "error"); }
  });
  await load();
}
