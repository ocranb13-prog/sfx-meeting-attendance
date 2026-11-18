export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  users: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  building: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3",
  calendar: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  check: "M20 6L9 17l-5-5",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  log: "M12 8v4l3 2M21 12a9 9 0 1 1-3-6.7M21 3v6h-6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M14 20h3M20 20v1",
  print: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  plus: "M12 5v14M5 12h14",
  menu: "M3 6h18M3 12h18M3 18h18",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  clock: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
};
export const icon = (name, size = 18) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ""}"/></svg>`;

export function toast(message, type = "success") {
  let box = $(".toasts");
  if (!box) {
    box = document.createElement("div");
    box.className = "toasts";
    box.setAttribute("role", "status");
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast " + (type === "error" ? "error" : "");
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), type === "error" ? 6000 : 3500);
}

/**
 * Opens a modal. `body` is an HTML string (escape dynamic values with esc()).
 * If onSubmit is given the body is wrapped in a form; onSubmit(data, form) may throw to show an error.
 */
export function modal({ title, body, submitLabel = "Save changes", onSubmit, wide = false, onOpen }) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button type="button" data-close aria-label="Close">&times;</button></div>
      <form novalidate>
        <div class="modal-body"><div class="form-error hidden"></div>${body}</div>
        <div class="modal-foot">
          <button type="button" class="btn secondary" data-close>${onSubmit ? "Cancel" : "Close"}</button>
          ${onSubmit ? `<button type="submit" class="btn">${esc(submitLabel)}</button>` : ""}
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.dataset.close !== undefined) close(); });
  const form = $("form", overlay);
  const errBox = $(".form-error", overlay);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const btn = $("button[type=submit]", form);
    errBox.classList.add("hidden");
    btn.disabled = true;
    try {
      // Note: repeated checkbox names collapse to one value here; read those from `form` directly.
      const data = Object.fromEntries(new FormData(form).entries());
      await onSubmit(data, form, close);
    } catch (err) {
      errBox.textContent = err.message || "Something went wrong.";
      errBox.classList.remove("hidden");
      overlay.querySelector(".modal").scrollTop = 0;
    } finally {
      btn.disabled = false;
    }
  });
  const first = $("input:not([type=hidden]):not([readonly]), select, textarea", overlay);
  if (first) first.focus();
  if (onOpen) onOpen(overlay, close);
  return { close, overlay };
}

export function confirmBox(message, { title = "Please confirm", confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: `<p>${esc(message)}</p>`,
      submitLabel: confirmLabel,
      onSubmit: async (_d, _f, close) => { done = true; close(); resolve(true); },
    });
    if (danger) $("button[type=submit]", m.overlay).classList.add("danger");
    new MutationObserver(() => { if (!document.body.contains(m.overlay) && !done) { done = true; resolve(false); } })
      .observe(document.body, { childList: true });
  });
}

/** Asks for a mandatory reason (min 5 chars). Resolves with the text, or null if cancelled. */
export function askReason(title, message) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: `<p>${esc(message)}</p><div class="field"><label>Reason</label><textarea name="reason" maxlength="300" required></textarea></div>`,
      submitLabel: "Confirm",
      onSubmit: async (d, _f, close) => {
        if ((d.reason || "").trim().length < 5) throw new Error("Please enter a reason of at least 5 characters.");
        done = true; close(); resolve(d.reason.trim());
      },
    });
    new MutationObserver(() => { if (!document.body.contains(m.overlay) && !done) { done = true; resolve(null); } })
      .observe(document.body, { childList: true });
  });
}

export const badge = (text, cls = text) => `<span class="badge ${esc(cls)}">${esc(text)}</span>`;
export const phaseLabel = { upcoming: "Upcoming", active: "Active", completed: "Completed", cancelled: "Cancelled" };
export const phaseBadge = (p) => `<span class="badge ${p === "active" ? "active" : p}">${esc(phaseLabel[p] || p)}</span>`;
export const emptyRow = (cols, text) => `<tr><td class="empty" colspan="${cols}">${esc(text)}</td></tr>`;
export const deptOptions = (depts, selected = "", placeholder = "Select department") =>
  `<option value="">${esc(placeholder)}</option>` +
  depts.map((d) => `<option value="${esc(d.id)}" ${d.id === selected ? "selected" : ""}>${esc(d.name)}</option>`).join("");
