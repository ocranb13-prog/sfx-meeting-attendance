// Public staff page. It never loads Firebase or any admin code: it only talks to /api/public/*.
(function () {
  const $ = (id) => document.getElementById(id);
  const token = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const show = (...ids) => ["step-form", "confirm", "success"].forEach((x) => $(x).classList.toggle("hidden", !ids.includes(x)));
  const showError = (msg) => { $("error").textContent = msg; $("error").classList.remove("hidden"); };
  const clearError = () => $("error").classList.add("hidden");

  async function post(path, body) {
    const res = await fetch("/api/public/" + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  const current = () => ({ token, staffId: $("staffId").value.trim(), departmentId: $("department").value });
  let meetingInfo = null;

  async function init() {
    try {
      const res = await fetch("/api/public/meeting/" + encodeURIComponent(token));
      const data = await res.json();
      $("loading").classList.add("hidden");
      if (!res.ok) { showError(data.error || "This QR code is not valid."); return; }
      meetingInfo = data;
      $("hospital").textContent = data.hospital.hospitalName;
      if (data.hospital.logo) { $("logo").src = data.hospital.logo; $("logo").classList.remove("hidden"); }
      const m = data.meeting;
      const box = $("meeting");
      box.innerHTML = "";
      const title = document.createElement("b"); title.textContent = m.title; box.appendChild(title);
      [["Date", m.date + ", " + m.startTime], ["Venue", m.venue]].forEach(([k, v]) => {
        const s = document.createElement("span"); s.textContent = k + ": " + v; box.appendChild(s);
      });
      box.classList.remove("hidden");
      document.title = m.title + " - attendance";
      if (!data.attendanceOpen) { showError(data.message || "Attendance is not open."); return; }
      const sel = $("department");
      sel.innerHTML = '<option value="">Select your department</option>';
      data.departments.forEach((d) => { const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; sel.appendChild(o); });
      show("step-form");
    } catch (e) {
      $("loading").classList.add("hidden");
      showError("Could not load this meeting. Check your connection and scan again.");
    }
  }

  $("step-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const v = current();
    if (!v.staffId || !v.departmentId) return showError("Enter your Staff ID and choose your department.");
    const btn = $("continue");
    btn.disabled = true; btn.textContent = "Checking...";
    try {
      const d = await post("verify", v);
      $("c-name").textContent = d.fullName;
      $("c-id").textContent = d.staffId;
      $("c-dept").textContent = d.departmentName;
      show("confirm");
    } catch (err) { showError(err.message); }
    finally { btn.disabled = false; btn.textContent = "Continue"; }
  });

  $("back-btn").addEventListener("click", () => { clearError(); show("step-form"); });

  $("confirm-btn").addEventListener("click", async () => {
    clearError();
    const btn = $("confirm-btn");
    btn.disabled = true; btn.textContent = "Submitting...";
    try {
      const d = await post("submit", { ...current(), confirm: true });
      $("s-name").textContent = d.fullName;
      $("s-id").textContent = d.staffId;
      $("s-dept").textContent = d.departmentName;
      $("s-meeting").textContent = d.meetingTitle;
      $("s-date").textContent = d.meetingDate;
      $("s-time").textContent = d.attendedAt;
      show("success");
    } catch (err) { showError(err.message); show("step-form"); }
    finally { btn.disabled = false; btn.textContent = "Confirm attendance"; }
  });

  init();
})();
