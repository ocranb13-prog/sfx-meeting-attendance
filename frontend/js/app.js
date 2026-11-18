import { waitForUser, logOut } from "./auth.js";
import { api } from "./api.js";
import { $, $$, esc, icon, toast } from "./ui.js";

const ROUTES = {
  dashboard: { module: "dashboard", title: "Dashboard", icon: "home" },
  staff: { module: "staff", title: "Staff", icon: "users", perms: ["staff"] },
  departments: { module: "departments", title: "Departments", icon: "building", perms: ["departments", "staff"] },
  meetings: { module: "meetings", title: "Meetings", icon: "calendar", perms: ["meetings", "qr", "attendance_view", "attendance_manual", "reports"] },
  attendance: { module: "attendance", title: "Attendance", icon: "check", perms: ["attendance_view"] },
  reports: { module: "reports", title: "Reports", icon: "file", perms: ["reports"] },
  users: { module: "users", title: "Administrators", icon: "shield", superOnly: true },
  audit: { module: "audit", title: "Audit logs", icon: "log", superOnly: true },
  settings: { module: "settings", title: "Settings", icon: "gear", superOnly: true },
};

const ctx = { me: null, settings: null, params: {}, can: () => false };
let cleanup = null;

function allowed(route) {
  if (route.superOnly) return ctx.me.role === "super_admin";
  if (!route.perms) return true;
  return route.perms.some((p) => ctx.can(p));
}

function parseHash() {
  const raw = (location.hash || "#/dashboard").slice(2);
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { name: parts[0] || "dashboard", id: parts[1] || null, params: Object.fromEntries(new URLSearchParams(query)) };
}

function buildNav() {
  $("#nav").innerHTML = Object.entries(ROUTES)
    .filter(([, r]) => allowed(r))
    .map(([key, r]) => `<a href="#/${key}" data-route="${key}">${icon(r.icon)}<span>${esc(r.title)}</span></a>`)
    .join("");
}

async function route() {
  if (cleanup) { try { cleanup(); } catch (_) {} cleanup = null; }
  const { name, id, params } = parseHash();
  const def = ROUTES[name];
  const view = $("#view");
  $("#sidebar").classList.remove("open");
  if (!def || !allowed(def)) {
    view.innerHTML = `<div class="card"><h2>Page not available</h2><p class="muted">You do not have access to this page.</p><a class="btn" href="#/dashboard">Back to dashboard</a></div>`;
    return;
  }
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
  document.title = def.title + " - Meeting Attendance";
  ctx.params = params;
  view.innerHTML = `<p class="muted">Loading...</p>`;
  try {
    const mod = await import(`./pages/${def.module}.js`);
    const page = name === "meetings" && id ? mod.renderDetail : mod.render;
    cleanup = (await page(view, { ...ctx, id })) || null;
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`;
  }
}

async function start() {
  const user = await waitForUser();
  if (!user) { location.href = "/login.html"; return; }
  try {
    const [{ user: me }, { settings }] = await Promise.all([api("/me"), api("/settings")]);
    ctx.me = me;
    ctx.settings = settings;
    ctx.can = (p) => me.role === "super_admin" || me.permissions.includes(p);
  } catch (err) {
    await logOut();
    location.href = "/login.html";
    return;
  }

  $("#brand-name").textContent = ctx.settings.hospitalName;
  $("#topbar-name").textContent = ctx.settings.hospitalName;
  if (ctx.settings.logo) { const img = $("#brand-logo"); img.src = ctx.settings.logo; img.classList.remove("hidden"); }
  $("#menu-btn").innerHTML = icon("menu", 24);
  $("#menu-btn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#who").innerHTML = `<b>${esc(ctx.me.name || ctx.me.email)}</b><br><span class="muted" style="color:#b7c9e6">${ctx.me.role === "super_admin" ? "Super Admin" : "Admin"}</span>`;
  $("#logout").addEventListener("click", async () => { await logOut(); location.href = "/login.html"; });

  buildNav();
  window.addEventListener("hashchange", route);
  route();
}

start().catch((e) => toast(e.message, "error"));
