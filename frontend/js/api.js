import { getToken } from "./auth.js";

async function request(path, { method = "GET", body } = {}) {
  const token = await getToken();
  const res = await fetch("/api/admin" + path, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/login.html";
    throw new Error("Session expired");
  }
  return res;
}

async function errorFrom(res) {
  const data = await res.json().catch(() => ({}));
  return new Error(data.error || "Request failed (" + res.status + ")");
}

export async function api(path, options) {
  const res = await request(path, options);
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); });
  const s = p.toString();
  return s ? "?" + s : "";
};

/** Fetch a binary response as a Blob (used for QR previews and file downloads). */
export async function fetchBlob(path) {
  const res = await request(path);
  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}

export async function downloadFile(path, filename) {
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Open a PDF in a new tab for printing. The tab is opened synchronously to avoid pop-up blockers. */
export async function openPdf(path) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Please allow pop-ups to open the document.");
  win.document.write("<p style='font-family:sans-serif'>Preparing document...</p>");
  try {
    const blob = await fetchBlob(path);
    win.location.href = URL.createObjectURL(blob);
  } catch (e) {
    win.close();
    throw e;
  }
}
