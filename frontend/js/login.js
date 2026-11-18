import { signIn, logOut, sendReset, waitForUser, getToken, friendlyAuthError } from "./auth.js";

const $ = (id) => document.getElementById(id);
const errorBox = $("error");
const infoBox = $("info");
const showError = (msg) => { errorBox.textContent = msg; errorBox.classList.remove("hidden"); infoBox.classList.add("hidden"); };

// Hospital name / logo (public endpoint)
fetch("/api/public/settings").then((r) => r.json()).then((s) => {
  $("hospital").textContent = s.hospitalName;
  if (s.logo) { $("logo").src = s.logo; $("logo").classList.remove("hidden"); }
}).catch(() => {});

async function checkAdminAndGo() {
  const res = await fetch("/api/admin/me", { headers: { Authorization: "Bearer " + (await getToken()) } });
  if (res.ok) { window.location.href = "/admin"; return; }
  const data = await res.json().catch(() => ({}));
  await logOut();
  throw new Error(data.error || "This account cannot access the dashboard.");
}

waitForUser().then((user) => { if (user) checkAdminAndGo().catch(() => {}); });

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.add("hidden");
  const btn = $("submit");
  btn.disabled = true;
  btn.textContent = "Signing in...";
  try {
    await signIn($("email").value.trim(), $("password").value);
    await checkAdminAndGo();
  } catch (err) {
    showError(friendlyAuthError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

$("forgot").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  if (!email) return showError("Enter your email address above first, then choose 'Forgot your password?'.");
  try {
    await sendReset(email);
  } catch (err) {
    if (err.code !== "auth/user-not-found") return showError(friendlyAuthError(err));
  }
  // Same message either way so the form does not reveal which emails have accounts.
  errorBox.classList.add("hidden");
  infoBox.textContent = "If an account exists for that email, a password reset link has been sent.";
  infoBox.classList.remove("hidden");
});
