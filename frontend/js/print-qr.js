import { waitForUser } from "./auth.js";
import { api, fetchBlob } from "./api.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const meetingId = params.get("meeting");

(async function () {
  try {
    const user = await waitForUser();
    if (!user) { location.href = "/login.html"; return; }
    if (!meetingId) throw new Error("No meeting selected.");
    const [{ meeting: m }, { settings: s }, blob] = await Promise.all([
      api("/meetings/" + encodeURIComponent(meetingId)),
      api("/settings"),
      fetchBlob(`/meetings/${encodeURIComponent(meetingId)}/qr.png`),
    ]);
    $("hospital").textContent = s.hospitalName;
    if (s.logo) { $("logo").src = s.logo; $("logo").hidden = false; }
    $("title").textContent = m.title;
    $("date").textContent = "Date: " + m.date;
    $("time").textContent = "Time: " + m.startTime + " - " + m.endTime;
    $("venue").textContent = "Venue: " + m.venue;
    $("instr").textContent = s.qrInstruction;
    $("contact").textContent = [s.address, s.phone, s.email].filter(Boolean).join(" | ");
    document.title = "QR - " + m.title;
    const img = $("qr");
    img.onload = () => {
      $("msg").hidden = true;
      $("sheet").hidden = false;
      if (params.get("auto") === "1") setTimeout(() => window.print(), 400);
    };
    img.src = URL.createObjectURL(blob);
  } catch (e) {
    $("msg").textContent = e.message || "Could not load the QR code.";
  }
})();
