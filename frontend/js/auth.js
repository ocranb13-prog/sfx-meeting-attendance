import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

/** Resolves with the signed-in user (or null) once Firebase has restored the session. */
export function waitForUser() {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (user) => { off(); resolve(user); });
  });
}

export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logOut = () => signOut(auth);
export const sendReset = (email) => sendPasswordResetEmail(auth, email);

export async function getToken() {
  if (!auth.currentUser) throw new Error("Not signed in");
  return auth.currentUser.getIdToken();
}

export function friendlyAuthError(err) {
  const code = (err && err.code) || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(code))
    return "Incorrect email or password.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a few minutes and try again.";
  if (code === "auth/user-disabled") return "This account has been deactivated.";
  if (code === "auth/network-request-failed") return "Network problem. Check your connection and try again.";
  return err.message || "Something went wrong. Please try again.";
}
