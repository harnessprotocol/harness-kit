import { expect, test } from "../fixtures";

test.describe("Navigation smoke tests", () => {
  test("app loads at root and redirects to a valid page", async ({ appPage }) => {
    await appPage.goto("/");
    await appPage.waitForLoadState("networkidle");
    const body = await appPage.locator("body").textContent();
    expect(body?.trim().length).toBeGreaterThan(0);
  });

  test("Harness File page renders without error", async ({ appPage }) => {
    await appPage.goto("/harness/file");
    await appPage.waitForLoadState("networkidle");
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
    expect(text).not.toContain("command_not_found");
  });

  test("Harness File page shows file path from mock", async ({ appPage }) => {
    await appPage.goto("/harness/file");
    await appPage.waitForLoadState("networkidle");
    // Mock returns path ~/.claude/harness.yaml
    await expect(appPage.getByText(/\.claude\/harness\.yaml/)).toBeVisible();
  });

  test("Plugins page renders without error", async ({ appPage }) => {
    await appPage.goto("/harness/plugins");
    await appPage.waitForLoadState("networkidle");
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
  });

  test("Sync page renders without error", async ({ appPage }) => {
    await appPage.goto("/harness/sync");
    await appPage.waitForLoadState("networkidle");
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
  });

  test("Observatory dashboard renders", async ({ appPage }) => {
    await appPage.goto("/observatory");
    await appPage.waitForLoadState("networkidle");
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
  });

  test("Marketplace page renders", async ({ appPage }) => {
    await appPage.goto("/marketplace");
    await appPage.waitForLoadState("networkidle");
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
  });

  test("Security permissions page renders", async ({ appPage }) => {
    await appPage.goto("/security/permissions");
    await appPage.waitForLoadState("networkidle");
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
  });

  test("Parity dashboard renders without error", async ({ appPage }) => {
    await appPage.goto("/parity");
    await appPage.waitForLoadState("networkidle");
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
    expect(text).not.toContain("Mock: no response");
  });
});

test.describe("Harness File page — content validation", () => {
  test("shows harness name from mock content", async ({ appPage }) => {
    await appPage.goto("/harness/file");
    await appPage.waitForLoadState("networkidle");
    // Mock content includes 'name: test-harness'
    await expect(appPage.getByText(/test-harness/i)).toBeVisible();
  });

  test("no JS errors in console", async ({ appPage }) => {
    const errors: string[] = [];
    appPage.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await appPage.goto("/harness/file");
    await appPage.waitForLoadState("networkidle");
    const fatal = errors.filter((e) => !e.includes("favicon") && !e.includes("ResizeObserver"));
    expect(fatal).toHaveLength(0);
  });
});

test.describe("Parity dashboard — content validation", () => {
  test("shows Claude Code version from mock snapshot", async ({ appPage }) => {
    await appPage.goto("/parity");
    await appPage.waitForLoadState("networkidle");
    await expect(appPage.getByText("1.2.3")).toBeVisible();
  });

  test("shows Scan Now button", async ({ appPage }) => {
    await appPage.goto("/parity");
    await appPage.waitForLoadState("networkidle");
    await expect(appPage.getByRole("button", { name: /scan now/i })).toBeVisible();
  });

  test("feature matrix section headers visible", async ({ appPage }) => {
    await appPage.goto("/parity");
    await appPage.waitForLoadState("networkidle");
    // Use first() — these labels also appear in the drift breakdown sub-text
    await expect(appPage.getByText("CLI Flags").first()).toBeVisible();
    await expect(appPage.getByText("Settings Keys").first()).toBeVisible();
  });

  test("drift items visible in Drift Alerts section", async ({ appPage }) => {
    await appPage.goto("/parity");
    await appPage.waitForLoadState("networkidle");
    // Items appear in both feature matrix and drift list — last() targets the drift row
    await expect(appPage.getByText("someNewKey").last()).toBeVisible();
    await expect(appPage.getByText("AGENT.md").last()).toBeVisible();
  });

  test("expanding a drift item reveals Mark as Known button", async ({ appPage }) => {
    await appPage.goto("/parity");
    await appPage.waitForLoadState("networkidle");
    // Click the drift row (last occurrence is in drift alerts, not feature matrix table)
    await appPage.getByText("someNewKey").last().click();
    await expect(appPage.getByRole("button", { name: /mark as known/i })).toBeVisible();
  });

  test("expanding a missing_file drift item reveals Create button", async ({ appPage }) => {
    await appPage.goto("/parity");
    await appPage.waitForLoadState("networkidle");
    await appPage.getByText("AGENT.md").last().click();
    await expect(appPage.getByRole("button", { name: /create agent\.md/i })).toBeVisible();
  });
});

test.describe("Sync page — regression: harness loaded from mock", () => {
  test("Preview Changes button exists on sync page when harness is loaded", async ({ appPage }) => {
    // Mock returns found: true with harness content, so the sync form is shown
    // with "Preview Changes" button (not the empty-state "Generate" button)
    await appPage.goto("/harness/sync");
    await appPage.waitForLoadState("networkidle");
    const btn = appPage.getByRole("button", { name: /preview changes/i });
    await expect(btn).toBeVisible();
  });
});
