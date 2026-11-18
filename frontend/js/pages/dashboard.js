import { api } from "../api.js";
import { esc, icon, phaseBadge, badge, emptyRow } from "../ui.js";

export async function render(view, ctx) {
  const { stats, recentMeetings, upcomingMeetings, recentAttendance } = await api("/dashboard");

  const cards = [
    ["Total registered staff", stats.totalStaff, "users"],
    ["Total departments", stats.totalDepartments, "building"],
    ["Total meetings", stats.totalMeetings, "calendar"],
    ["Upcoming meetings", stats.upcomingMeetings, "clock"],
    ["Active meetings", stats.activeMeetings, "qr"],
    ["Completed meetings", stats.completedMeetings, "check"],
    ["Total attendance records", stats.attendanceRecords, "list"],
  ];

  const quick = [
    ["staff", "#/staff?action=new", "Register staff", "plus"],
    ["departments", "#/departments?action=new", "Add department", "building"],
    ["meetings", "#/meetings?action=new", "Create meeting", "calendar"],
    ["qr", "#/meetings", "Generate / view QR code", "qr"],
    ["attendance_view", "#/attendance", "View attendance", "check"],
    ["reports", "#/reports", "Generate reports", "file"],
  ].filter(([perm]) => ctx.can(perm));

  const meetingRows = (list) => list.length
    ? list.map((m) => `<tr><td><a href="#/meetings/${esc(m.id)}">${esc(m.title)}</a></td><td>${esc(m.date)}</td><td>${phaseBadge(m.phase)}</td></tr>`).join("")
    : emptyRow(3, "No meetings yet.");

  view.innerHTML = `
    <div class="page-head"><h1>Dashboard</h1></div>
    <div class="grid stats">
      ${cards.map(([label, value, ic]) => `<div class="stat">${icon(ic, 26)}<div><b>${value}</b><span>${esc(label)}</span></div></div>`).join("")}
    </div>
    ${quick.length ? `<div class="quick">${quick.map(([, href, label, ic]) => `<a class="btn secondary" href="${href}">${icon(ic, 16)} ${esc(label)}</a>`).join("")}</div>` : ""}
    <div class="grid two">
      <div class="card"><h2>Upcoming and active meetings</h2><div class="table-wrap"><table>
        <thead><tr><th>Meeting</th><th>Date</th><th>Status</th></tr></thead><tbody>${meetingRows(upcomingMeetings)}</tbody></table></div></div>
      <div class="card"><h2>Recent meetings</h2><div class="table-wrap"><table>
        <thead><tr><th>Meeting</th><th>Date</th><th>Status</th></tr></thead><tbody>${meetingRows(recentMeetings)}</tbody></table></div></div>
    </div>
    <div class="card"><h2>Recent attendance</h2><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Staff ID</th><th>Department</th><th>Meeting</th><th>Time</th><th>Method</th></tr></thead>
      <tbody>${recentAttendance.length ? recentAttendance.map((r) => `<tr>
        <td>${esc(r.fullName)}</td><td>${esc(r.staffId)}</td><td>${esc(r.departmentName)}</td>
        <td>${esc(r.meetingTitle)}</td><td>${esc(r.attendedAtLocal)}</td><td>${badge(r.method)}</td></tr>`).join("")
        : emptyRow(6, "No attendance recorded yet.")}</tbody></table></div></div>`;
}
