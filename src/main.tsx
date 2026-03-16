import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// === Build-timestamp cache-busting ===
// NOTE: __BUILD_TIMESTAMP__ must be a bare identifier so Vite's `define` replaces it at build time.
// Using (globalThis as any).__BUILD_TIMESTAMP__ is a property access and will NOT be replaced.
// @ts-ignore - Vite replaces __BUILD_TIMESTAMP__ at build time
const CURRENT_BUILD = (typeof __BUILD_TIMESTAMP__ !== 'undefined') ? String(__BUILD_TIMESTAMP__) : String(Date.now());
const STORED_BUILD = localStorage.getItem('build_timestamp');

if (STORED_BUILD && STORED_BUILD !== CURRENT_BUILD) {
  // Flag that an update is pending – the app will show a prompt
  sessionStorage.setItem('update_pending', 'true');
}

// Always stamp current build and render
localStorage.setItem('build_timestamp', CURRENT_BUILD);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
