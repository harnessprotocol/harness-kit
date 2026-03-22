/**
 * E2E test setup for Harness Kit desktop.
 *
 * PREREQUISITES:
 *   1. pnpm --filter harness-kit-desktop dev   (Vite dev server on :1420)
 *   2. open ~/Applications/"Harness Kit.app"   (debug binary for real IPC)
 *
 * These tests inject a Tauri mock bridge so they work WITHOUT the Tauri binary running.
 * Commands return controlled mock data rather than real filesystem data.
 *
 * To run: pnpm test:e2e
 * To run with UI: pnpm test:e2e:ui
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:1420",
    screenshot: "only-on-failure",
    video: "off",
  },
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
