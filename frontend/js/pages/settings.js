import { api } from "../api.js";
import { $, esc, toast } from "../ui.js";

export async function render(view) {
  const { settings: s } = await api("/settings");
  let logo = s.logo || "";

  view.innerHTML = `
    <div class="page-head"><h1>System settings</h1></div>
    <form id="form" novalidate>
      <div class="card"><h2>Hospital</h2>
        <div class="row2">
          <div class="field"><label>Hospital name</label><input name="hospitalName" maxlength="120" value="${esc(s.hospitalName)}" required></div>
          <div class="field"><label>Contact email</label><input name="email" type="email" maxlength="120" value="${esc(s.email)}"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Phone</label><input name="phone" maxlength="40" value="${esc(s.phone)}"></div>
          <div class="field"><label>Address</label><input name="address" maxlength="200" value="${esc(s.address)}"></div>
        </div>
        <div class="field"><label>Logo (PNG or JPEG, under 250 KB)</label>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <img id="logo-preview" alt="" style="max-height:60px;max-width:140px;${logo ? "" : "display:none"}" ${logo ? `src="${esc(logo)}"` : ""}>
            <input type="file" id="logo-file" accept="image/png,image/jpeg" style="width:auto">
            <button type="button" class="btn secondary sm" id="logo-clear">Remove logo</button></div></div>
      </div>
      <div class="card"><h2>Attendance and meetings</h2>
        <div class="row2">
          <div class="field"><label>Open attendance (minutes before start)</label><input name="defaultOpenMinutesBefore" type="number" min="0" max="1440" value="${esc(s.defaultOpenMinutesBefore)}"></div>
          <div class="field"><label>Close attendance (minutes after end)</label><input name="defaultCloseMinutesAfter" type="number" min="0" max="1440" value="${esc(s.defaultCloseMinutesAfter)}"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Meeting categories (one per line)</label><textarea name="categories" style="min-height:150px">${esc(s.categories.join("\n"))}</textarea></div>
          <div class="field"><label>Default category</label><select name="defaultCategory">${s.categories.map((c) => `<option ${c === s.defaultCategory ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        </div>
      </div>
      <div class="card"><h2>QR code and reports</h2>
        <div class="row2">
          <div class="field"><label>QR error correction</label><select name="qrErrorCorrection">
            ${[["L", "Low (largest modules)"], ["M", "Medium (recommended)"], ["Q", "Quartile"], ["H", "High (densest code)"]].map(([k, l]) => `<option value="${k}" ${k === s.qrErrorCorrection ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field"><label>Instruction shown on the printed QR sheet</label><input name="qrInstruction" maxlength="200" value="${esc(s.qrInstruction)}"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Organizer signature label</label><input name="organizerLabel" maxlength="80" value="${esc(s.organizerLabel)}"></div>
          <div class="field"><label>Report footer text</label><input name="reportFooter" maxlength="200" value="${esc(s.reportFooter)}"></div>
        </div>
      </div>
      <div class="form-error hidden" id="err"></div>
      <button class="btn" type="submit" id="save">Save settings</button>
    </form>`;

  $("#logo-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { toast("Logo must be a PNG or JPEG image.", "error"); e.target.value = ""; return; }
    if (file.size > 250 * 1024) { toast("Logo is too large. Use an image under 250 KB.", "error"); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { logo = reader.result; const p = $("#logo-preview"); p.src = logo; p.style.display = ""; };
    reader.readAsDataURL(file);
  });
  $("#logo-clear").addEventListener("click", () => { logo = ""; $("#logo-preview").style.display = "none"; $("#logo-file").value = ""; });

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#err");
    err.classList.add("hidden");
    const btn = $("#save");
    btn.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(e.target).entries());
      body.logo = logo;
      await api("/settings", { method: "PUT", body });
      toast("Settings saved. Reloading...");
      setTimeout(() => location.reload(), 700);
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove("hidden");
    } finally { btn.disabled = false; }
  });
}
