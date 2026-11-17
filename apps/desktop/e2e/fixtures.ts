import { test as base, Page } from "@playwright/test";
import { buildBridgeScript, MOCK_RESPONSES } from "./tauri-bridge-mock";

type HarnessFixtures = {
  appPage: Page;
};

export const test = base.extend<HarnessFixtures>({
  appPage: async ({ page }, use) => {
    await page.addInitScript(buildBridgeScript(MOCK_RESPONSES));
    // Mark first-run onboarding as seen. The wizard is a full-screen overlay
    // outside the router; since spec AC-32 it renders its scan error (the mock
    // has no home-dir command) instead of a blank frame, which would otherwise
    // sit on top of every page under test.
    await page.addInitScript(() => {
      localStorage.setItem("hk-welcome-seen", "true");
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";

/**
 * Collect console errors and uncaught page errors for the page's lifetime.
 * Returns a function that yields the errors seen so far, minus known dev noise.
 */
export function collectConsoleErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", err => errors.push("PAGEERROR: " + err.message));
  return () =>
    errors.filter(e =>
      !e.includes("favicon") &&
      !e.includes("ResizeObserver") &&
      !e.includes("webkit") &&
      !e.includes("Supabase"), // marketplace has no supabase config in dev
    );
}
