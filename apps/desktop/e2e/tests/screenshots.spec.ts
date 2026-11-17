import { test, expect, collectConsoleErrors } from "../fixtures";

// AC-39: every DEV fixture route, both themes, two widths. Fails on any console
// error; CI uploads the PNGs. Fixture routes exist only under the dev server.
const ROUTES = ["machine", "drift", "onboarding"] as const;
const THEMES = ["light", "dark"] as const;
const WIDTHS = [1440, 1024] as const;

for (const route of ROUTES) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`screenshot ${route} ${theme} ${width}`, async ({ appPage }) => {
        await appPage.addInitScript(t => {
          localStorage.setItem("harness-kit-theme", t);
        }, theme);
        await appPage.setViewportSize({ width, height: 900 });
        const fatalErrors = collectConsoleErrors(appPage);

        await appPage.goto(`/__fixtures__/${route}`);
        await appPage.waitForLoadState("networkidle");
        const isDark = await appPage.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        );
        expect(isDark).toBe(theme === "dark");

        await appPage.screenshot({
          path: `e2e/screenshots/${route}-${theme}-${width}.png`,
          fullPage: true,
        });

        const fatal = fatalErrors();
        expect(fatal, `Console errors on ${route}:\n${fatal.join("\n")}`).toHaveLength(0);
      });
    }
  }
}
