import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
import "./app.css";
import "@harness-kit/ui/styles.css";
import "@fontsource-variable/space-grotesk";

// Apply the persisted/system theme before first paint. AppLayout also calls
// initTheme() (kept for its existing tests/behavior), but routes rendered
// outside AppLayout — onboarding chief among them, since it's a full-bleed
// wizard with no sidebar (DESIGN.md §6.3) — would otherwise boot in light
// mode regardless of the user's actual preference.
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
