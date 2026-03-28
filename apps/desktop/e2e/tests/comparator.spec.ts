import { test, expect } from "../fixtures";

test.describe("Comparator setup page", () => {
  test("harness cards render from mock data", async ({ appPage }) => {
    await appPage.goto("/comparator");
    await appPage.waitForLoadState("networkidle");

    // Available harnesses show up with their names
    await expect(appPage.getByText("Claude Code")).toBeVisible();
    await expect(appPage.getByText("GitHub Copilot")).toBeVisible();
    // Unavailable harness still renders (with "Not found" badge)
    await expect(appPage.getByText("Cursor")).toBeVisible();
    await expect(appPage.getByText("Not found")).toBeVisible();
  });

  test("first available harness is pre-selected", async ({ appPage }) => {
    await appPage.goto("/comparator");
    await appPage.waitForLoadState("networkidle");

    // Claude Code is the first available harness; its card should have the
    // "selected" class and the model selector should be visible.
    const claudeCard = appPage.locator(".harness-card.selected");
    await expect(claudeCard).toBeVisible();
    await expect(claudeCard.getByText("Claude Code")).toBeVisible();
  });

  test("prompt textarea and Run Comparison button present", async ({ appPage }) => {
    await appPage.goto("/comparator");
    await appPage.waitForLoadState("networkidle");

    // Prompt textarea exists
    const prompt = appPage.getByPlaceholder(/prompt/i);
    await expect(prompt).toBeVisible();

    // Run button exists but is disabled until prompt is filled
    const runBtn = appPage.getByRole("button", { name: /run comparison/i });
    await expect(runBtn).toBeVisible();
  });

  test("Run button enables after typing a prompt", async ({ appPage }) => {
    await appPage.goto("/comparator");
    await appPage.waitForLoadState("networkidle");

    const prompt = appPage.getByPlaceholder(/prompt/i);
    const runBtn = appPage.getByRole("button", { name: /run comparison/i });

    // Initially disabled (harness pre-selected, but no prompt)
    await expect(runBtn).toBeDisabled();

    // Type a prompt
    await prompt.fill("hello world");
    await expect(runBtn).not.toBeDisabled();
  });

  test("version number shown for available harness", async ({ appPage }) => {
    await appPage.goto("/comparator");
    await appPage.waitForLoadState("networkidle");

    // Mock returns version "1.5.0" for Claude Code
    await expect(appPage.getByText("1.5.0")).toBeVisible();
  });
});

test.describe("Comparator history page", () => {
  test("comparison list renders from mock data", async ({ appPage }) => {
    await appPage.goto("/comparator/history");
    await appPage.waitForLoadState("networkidle");

    // Both mock comparisons should appear
    await expect(appPage.getByText("write a hello world function")).toBeVisible();
    await expect(appPage.getByText("refactor the auth module")).toBeVisible();
  });

  test("harness names shown in comparison rows", async ({ appPage }) => {
    await appPage.goto("/comparator/history");
    await appPage.waitForLoadState("networkidle");

    // First comparison has "Claude Code vs GitHub Copilot" in the panel summary
    await expect(
      appPage.getByText("Claude Code vs GitHub Copilot"),
    ).toBeVisible();
  });

  test("status badges visible", async ({ appPage }) => {
    await appPage.goto("/comparator/history");
    await appPage.waitForLoadState("networkidle");

    // Both mock comparisons have status "complete"
    const badges = appPage.getByText("complete");
    await expect(badges.first()).toBeVisible();
  });

  test("delete buttons present for each comparison", async ({ appPage }) => {
    await appPage.goto("/comparator/history");
    await appPage.waitForLoadState("networkidle");

    const deleteButtons = appPage.getByRole("button", { name: /delete/i });
    await expect(deleteButtons).toHaveCount(2);
  });
});

test.describe("Comparator analytics page", () => {
  test("shows empty state when no evaluations exist", async ({ appPage }) => {
    await appPage.goto("/comparator/analytics");
    await appPage.waitForLoadState("networkidle");

    // Mock returns totalComparisons: 0, so the empty state message shows
    await expect(
      appPage.getByText(/no evaluated comparisons yet/i),
    ).toBeVisible();
  });
});
