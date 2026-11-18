import { api } from "../api.js";
import { $, esc, modal, toast, deptOptions } from "../ui.js";

/** Opens the create/edit meeting dialog. `meeting` is null for a new meeting. */
export async function openMeetingForm(ctx, meeting, onSaved) {
  const { departments } = await api("/departments");
  const cats = ctx.settings.categories;
  const m = meeting || {};
  const catSel = m.category || ctx.settings.defaultCategory;
  const activeDepts = departments.filter((d) => d.active || d.id === m.departmentId);

  modal({
    title: meeting ? "Edit meeting" : "Create meeting",
    wide: true,
    submitLabel: meeting ? "Save changes" : "Create meeting",
    body: `
      <div class="field"><label>Meeting title</label><input name="title" maxlength="150" value="${esc(m.title || "")}" required></div>
      <div class="field"><label>Description</label><textarea name="description" maxlength="1000">${esc(m.description || "")}</textarea></div>
      <div class="row2">
        <div class="field"><label>Meeting date</label><input type="date" name="date" value="${esc(m.date || "")}" required></div>
        <div class="field"><label>Venue</label><input name="venue" maxlength="150" value="${esc(m.venue || "")}" required></div>
      </div>
      <div class="row2">
        <div class="field"><label>Start time</label><input type="time" name="startTime" value="${esc(m.startTime || "")}" required></div>
        <div class="field"><label>End time</label><input type="time" name="endTime" value="${esc(m.endTime || "")}" required></div>
      </div>
      <div class="row2">
        <div class="field"><label>Meeting category</label><select name="category">${cats.map((c) => `<option ${c === catSel ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        <div class="field"><label>Target audience</label><select name="audience" id="audience">
          <option value="hospital" ${m.audience !== "department" ? "selected" : ""}>Hospital-wide</option>
          <option value="department" ${m.audience === "department" ? "selected" : ""}>Selected department</option></select></div>
      </div>
      <div class="field ${m.audience === "department" ? "" : "hidden"}" id="dept-field"><label>Department</label>
        <select name="departmentId">${deptOptions(activeDepts, m.departmentId || "")}</select></div>
      <div class="row2">
        <div class="field"><label>Attendance opens</label><input type="datetime-local" name="openingTime" value="${esc(m.openingTime || "")}"></div>
        <div class="field"><label>Attendance closes</label><input type="datetime-local" name="closingTime" value="${esc(m.closingTime || "")}"></div>
      </div>
      <p class="muted small">Leave the opening and closing times blank to use the defaults from Settings (${ctx.settings.defaultOpenMinutesBefore} min before the start, ${ctx.settings.defaultCloseMinutesAfter} min after the end).</p>`,
    onOpen: (overlay) => {
      $("#audience", overlay).addEventListener("change", (e) => {
        $("#dept-field", overlay).classList.toggle("hidden", e.target.value !== "department");
      });
    },
    onSubmit: async (data, _f, close) => {
      if (meeting) await api("/meetings/" + meeting.id, { method: "PUT", body: data });
      else await api("/meetings", { method: "POST", body: data });
      close();
      toast(meeting ? "Meeting updated." : "Meeting created. Its QR code is ready.");
      if (onSaved) await onSaved();
    },
  });
}
