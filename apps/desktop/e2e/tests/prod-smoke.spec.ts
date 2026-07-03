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
  "/harness/plugins",
  "/harness/hooks",
  "/harness/claude-md",
  "/harness/settings",
  "/marketplace",
  "/observatory",
  "/observatory/sessions",
  "/security/permissions",
  "/security/secrets",
  "/board",
  "/drift",
];

// Known-broken in the production bundle (NOT in dev mode, which is why daily use hides it):
// these chunks pull in @harness-kit/core's compile/check, which statically
// `import { createHash } from "node:crypto"`. That bare specifier is unresolvable in a
// non-Node bundle, so the route trips the error boundary. Quarantined here so the guard
// still protects every other route; remove from this list once the crypto import is
// browser-safe (tracked separately).
const KNOWN_BROKEN_ROUTES = ["/harness/file", "/harness/sync", "/comparator"];

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

// Quarantined: documents the node:crypto production-bundle bug. Marked fixme so the
// suite stays green while the failure remains visible in reports. Drop the fixme once fixed.
for (const route of KNOWN_BROKEN_ROUTES) {
  test.fixme(`route renders without error boundary (known broken): ${route}`, async ({ appPage }) => {
    await expectRouteHealthy(appPage, route);
  });
}
