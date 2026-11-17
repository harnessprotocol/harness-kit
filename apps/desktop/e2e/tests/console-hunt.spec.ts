import { test, expect, collectConsoleErrors } from "../fixtures";

const ALL_ROUTES = [
  "/fleet",
  "/harness/file",
  "/harness/plugins",
  "/harness/hooks",
  "/harness/claude-md",
  "/harness/sync",
  "/harness/settings", // retired route; redirects to /harness/file (AC-41)
  "/harness/permissions",
  "/marketplace",
  "/observatory",
  "/observatory/sessions",
  "/comparator",
  "/comparator/history",
  "/comparator/analytics",
  "/preferences/activity",
  "/preferences/labs",
  "/security/permissions",
  "/security/secrets",
  "/security/audit",
  "/drift",
];

for (const route of ALL_ROUTES) {
  test(`no console errors on ${route}`, async ({ appPage }) => {
    const fatalErrors = collectConsoleErrors(appPage);

    await appPage.goto(route);
    await appPage.waitForLoadState("networkidle");

    const fatal = fatalErrors();
    expect(fatal, `Console errors on ${route}:\n${fatal.join("\n")}`).toHaveLength(0);
  });
}
