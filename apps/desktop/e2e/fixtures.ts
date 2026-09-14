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
