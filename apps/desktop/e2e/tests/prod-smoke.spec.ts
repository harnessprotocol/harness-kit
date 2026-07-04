import { test, expect } from "../fixtures";

/**
 * Production-build blank-screen guard. Runs against the built bundle via
 * `vite preview` (see playwright.preview.config.ts), not the dev server.
 *
 * Scope is deliberately narrow: assert the app *shell mounts* and each lazy route
 * renders without tripping the error boundary. This is the e4e0271 failure class
 * (a missing provider / broken lazy chunk leaves users staring at a blank window).
 *
 * It intentionally does NOT assert zero console errors or mock-content visibility:
 * `vite preview` runs in a plain browser, not the Tauri WebView, so runtime-only
 * concerns (e.g. externalized node builtins, real IPC) produce non-fatal noise there.
 * Those richer assertions live in the dev-server config (test:e2e).
 */
const ROUTES = [
  "/fleet",
  "/harness/file",
  "/harness/sync",
  "/harness/plugins",
  "/harness/hooks",
  "/harness/claude-md",
  "/harness/settings",
  "/comparator",
  "/marketplace",
  "/observatory",
  "/observatory/sessions",
  "/security/permissions",
  "/security/secrets",
  "/drift",
];

// Formerly quarantined: /harness/file, /harness/sync, /comparator tripped the error
// boundary in the production bundle because their chunks pulled in @harness-kit/core's
// compile/check, which statically imported `node:crypto`. Core is now browser-safe
// (crypto → @noble/hashes), so these routes are guarded like every other route.

const ERROR_BOUNDARY_TEXT = "Something went wrong loading this page.";

test("app shell mounts at root (not a blank screen)", async ({ appPage }) => {
  await appPage.goto("/");
  await appPage.waitForLoadState("networkidle");
  // The sidebar is part of the always-rendered app shell; if App failed to mount
  // (e.g. a provider threw, as in e4e0271) there would be no <aside> at all.
  await expect(appPage.locator("aside")).toBeVisible();
  const body = await appPage.locator("body").textContent();
  expect(body?.trim().length ?? 0).toBeGreaterThan(0);
});

async function expectRouteHealthy(appPage: import("@playwright/test").Page, route: string) {
  await appPage.goto(route);
  await appPage.waitForLoadState("networkidle");
  // Shell present → the app mounted.
  await expect(appPage.locator("aside")).toBeVisible();
  // Lazy chunk loaded and the page subtree did not throw into the error boundary.
  await expect(appPage.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
}

for (const route of ROUTES) {
  test(`route renders without error boundary: ${route}`, async ({ appPage }) => {
    await expectRouteHealthy(appPage, route);
  });
}
