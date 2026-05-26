/**
 * Production-build E2E config.
 *
 * Unlike playwright.config.ts (which serves the Vite *dev* server), this serves the
 * built `dist/` via `vite preview`. The dev server hides prod-only breakage: lazy-route
 * chunk loading, provider wiring that only fails in the bundled app, and dead imports
 * tree-shaken differently. Running the smoke against the production bundle is the
 * closest cheap approximation of the packaged app and guards the e4e0271 blank-screen class.
 *
 * Requires `vite build` to have run first. The Tauri bridge mock is injected by the
 * e2e fixtures, so no Tauri binary is needed.
 *
 * Run: pnpm build && pnpm test:e2e:preview
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// vite preview must run from the desktop package root (where dist/ lives), not the
// e2e/ config directory that Playwright uses as the default webServer cwd.
const DESKTOP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  testDir: "./tests",
  // Only the production blank-screen guard runs against the preview build. The
  // richer mock-content / console-error specs target the dev server (test:e2e),
  // since plain-browser preview is not the Tauri WebView and produces false noise.
  testMatch: /prod-smoke\.spec\.ts$/,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:1422",
    screenshot: "only-on-failure",
    video: "off",
  },
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "pnpm exec vite preview --port 1422 --strictPort",
    cwd: DESKTOP_ROOT,
    url: "http://localhost:1422",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
