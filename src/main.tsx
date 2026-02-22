import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// === Build-timestamp cache-busting ===
const CURRENT_BUILD = __BUILD_TIMESTAMP__;
const STORED_BUILD = localStorage.getItem('build_timestamp');

if (STORED_BUILD && STORED_BUILD !== CURRENT_BUILD) {
  // Preserve auth tokens
  const authKeys: [string, string | null][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith('sb-') || key === 'cached_user_id') {
      authKeys.push([key, localStorage.getItem(key)]);
    }
  }

  // Unregister service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((r) => r.unregister());
    });
  }

  // Clear caches
  if ('caches' in window) {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
  }

  // Clear and restore localStorage
  localStorage.clear();
  authKeys.forEach(([k, v]) => { if (v) localStorage.setItem(k, v); });
  localStorage.setItem('build_timestamp', CURRENT_BUILD);

  // Hard reload
  window.location.reload();
} else {
  // First visit or same build – just stamp and render
  localStorage.setItem('build_timestamp', CURRENT_BUILD);

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
