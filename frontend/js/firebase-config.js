// Firebase web configuration. These values are public identifiers (safe in frontend code);
// real protection comes from Firestore rules + backend authorization, not from hiding this.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAc39YfjrOPIas_oXtgDc1BEthOGKPscE0",
  authDomain: "attandance-b.firebaseapp.com",
  projectId: "attandance-b",
  storageBucket: "attandance-b.firebasestorage.app",
  messagingSenderId: "435051342667",
  appId: "1:435051342667:web:254ea1e39387215f8356ce",
  measurementId: "G-VYKWV4DQY6",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Analytics is optional and only loaded in browsers that support it (it is skipped on
// the public staff attendance page, which does not import this file at all).
import("https://www.gstatic.com/firebasejs/13.3.0/firebase-analytics.js")
  .then(async (m) => { if (await m.isSupported()) m.getAnalytics(app); })
  .catch(() => {});
