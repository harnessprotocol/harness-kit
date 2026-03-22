import { test as base, Page } from "@playwright/test";
import { buildBridgeScript, MOCK_RESPONSES } from "./tauri-bridge-mock";

type HarnessFixtures = {
  appPage: Page;
};

export const test = base.extend<HarnessFixtures>({
  appPage: async ({ page }, use) => {
    await page.addInitScript(buildBridgeScript(MOCK_RESPONSES));
    await use(page);
  },
});

export { expect } from "@playwright/test";
