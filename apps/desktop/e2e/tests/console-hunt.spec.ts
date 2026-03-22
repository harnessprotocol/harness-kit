import { test, expect } from "../fixtures";

const ALL_ROUTES = [
  "/harness/file",
  "/harness/plugins",
  "/harness/hooks",
  "/harness/claude-md",
  "/harness/sync",
  "/harness/settings",
  "/marketplace",
  "/observatory",
  "/observatory/sessions",
  "/comparator",
  "/comparator/history",
  "/comparator/analytics",
  "/security/permissions",
  "/security/secrets",
  "/security/audit",
  "/parity",
  "/board",
];

for (const route of ALL_ROUTES) {
  test(`no console errors on ${route}`, async ({ appPage }) => {
    const errors: string[] = [];
    appPage.on("console", msg => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    appPage.on("pageerror", err => errors.push("PAGEERROR: " + err.message));

    await appPage.goto(route);
    await appPage.waitForLoadState("networkidle");

    const fatal = errors.filter(e =>
      !e.includes("favicon") &&
      !e.includes("ResizeObserver") &&
      !e.includes("webkit") &&
      !e.includes("Supabase")  // marketplace has no supabase config in dev
    );
    expect(fatal, `Console errors on ${route}:\n${fatal.join("\n")}`).toHaveLength(0);
  });
}
