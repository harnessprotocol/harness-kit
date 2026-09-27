import { test, expect } from "../fixtures";

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
    await appPage.goto("/harness/permissions");
    await appPage.waitForLoadState("networkidle");
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
  });

  test("/fleet redirects to Machine", async ({ appPage }) => {
    await appPage.goto("/fleet");
    await appPage.waitForLoadState("networkidle");
    expect(appPage.url()).toContain("/machine");
  });

  test("/security/permissions lands under Claude Code", async ({ appPage }) => {
    await appPage.goto("/security/permissions");
    await appPage.waitForLoadState("networkidle");
    expect(appPage.url()).toContain("/harness/permissions");
    await expect(appPage.getByRole("heading", { name: "Permissions" })).toBeVisible();
  });

  // AC-37 / AC-18: /drift redirects to Machine's Drift view.
  test("legacy /drift route lands on Machine's Drift view", async ({ appPage }) => {
    await appPage.goto("/drift");
    await appPage.waitForLoadState("networkidle");
    expect(appPage.url()).toContain("/machine?view=drift");
    await expect(appPage.getByTestId("drift-view")).toBeVisible();
    const text = await appPage.locator("body").textContent();
    expect(text).not.toContain("command not found");
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
    const fatal = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("ResizeObserver")
    );
    expect(fatal).toHaveLength(0);
  });
});

test.describe("Drift as a view of Machine — content validation", () => {
  test("renders the Drift view in place of the grid, with Machine keeping the only page heading", async ({
    appPage,
  }) => {
    await appPage.goto("/drift");
    await appPage.waitForLoadState("networkidle");
    await expect(appPage.getByTestId("machine-drift-view")).toBeVisible();
    await expect(appPage.getByTestId("drift-view")).toBeVisible();
    await expect(appPage.getByTestId("machine-grid")).toHaveCount(0);
    // Embedded: Drift contributes no second document-level heading.
    await expect(appPage.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("Machine opened directly shows the grid view and does not mount Drift", async ({ appPage }) => {
    await appPage.goto("/machine");
    await appPage.waitForLoadState("networkidle");
    const toggle = appPage.getByRole("tablist", { name: "Machine view" });
    await expect(toggle.getByRole("tab", { name: "Resources" })).toHaveAttribute("aria-selected", "true");
    await expect(appPage.getByTestId("drift-view")).toHaveCount(0);
  });

  test("the view toggle switches between the grid and Drift", async ({ appPage }) => {
    await appPage.goto("/machine");
    await appPage.waitForLoadState("networkidle");
    const toggle = appPage.getByRole("tablist", { name: "Machine view" });
    await toggle.getByRole("tab", { name: "Drift vs harness.yaml" }).click();
    await expect(appPage.getByTestId("drift-view")).toBeVisible();
    expect(appPage.url()).toContain("view=drift");
    await toggle.getByRole("tab", { name: "Resources" }).click();
    await expect(appPage.getByTestId("drift-view")).toHaveCount(0);
    expect(appPage.url()).not.toContain("view=drift");
  });

  test("the legacy ?drift=1 still lands on the Drift view", async ({ appPage }) => {
    await appPage.goto("/machine?drift=1");
    await appPage.waitForLoadState("networkidle");
    await expect(appPage.getByTestId("drift-view")).toBeVisible();
  });
});

test.describe("Sync page — regression: harness loaded from mock", () => {
  test("Preview Changes button exists on sync page when harness is loaded", async ({
    appPage,
  }) => {
    // Mock returns found: true with harness content, so the sync form is shown
    // with "Preview Changes" button (not the empty-state "Generate" button)
    await appPage.goto("/harness/sync");
    await appPage.waitForLoadState("networkidle");
    const btn = appPage.getByRole("button", { name: /preview changes/i });
    await expect(btn).toBeVisible();
  });
});

test.describe("Machine row drawer and the title bar (AC-17, AC-19)", () => {
  test("an open drawer leaves the project selector visible and clickable", async ({ appPage }) => {
    // The shared mock has no home dir or plugin-fs commands, so Machine would
    // scan nothing. Serve a home dir and one Claude Code MCP server, enough
    // for the grid to show a row to open.
    await appPage.addInitScript(() => {
      const files: Record<string, string> = {
        "/home/mock/.claude.json": JSON.stringify({ mcpServers: { github: { command: "gh-mcp" } } }),
      };
      const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: { path?: string }) => Promise<unknown> } }).__TAURI_INTERNALS__;
      const base = internals.invoke;
      internals.invoke = (cmd, args) => {
        const path = args?.path ?? "";
        if (cmd === "plugin:path|resolve_directory") return Promise.resolve("/home/mock");
        if (cmd === "plugin:fs|exists") return Promise.resolve(path in files);
        if (cmd === "plugin:fs|read_text_file") {
          return path in files
            ? Promise.resolve(Array.from(new TextEncoder().encode(files[path])))
            : Promise.reject(`not found: ${path}`);
        }
        return base(cmd, args);
      };
    });

    await appPage.goto("/machine");
    await appPage.getByRole("button", { name: "github details" }).click();
    await expect(appPage.getByTestId("machine-row-drawer")).toBeVisible();

    // The drawer starts where the title bar ends.
    const drawerTop = await appPage.getByTestId("machine-row-drawer").evaluate((el) => el.getBoundingClientRect().top);
    const titlebarBottom = await appPage.locator(".titlebar").evaluate((el) => el.getBoundingClientRect().bottom);
    expect(drawerTop).toBe(titlebarBottom);

    const selector = appPage.getByRole("button", { name: /^Project:/ });
    const uncovered = await selector.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit !== null && button.contains(hit);
    });
    expect(uncovered).toBe(true);

    // Its menu opens over the drawer, not under it.
    await selector.click();
    const choose = appPage.getByRole("menuitem", { name: "Choose folder…" });
    const menuUncovered = await choose.evaluate((item) => {
      const box = item.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit !== null && item.contains(hit);
    });
    expect(menuUncovered).toBe(true);
  });
});

test.describe("⌘K affordance and page commands (AC-21)", () => {
  test("the title bar's ⌘K button opens the palette with Machine's commands first", async ({ appPage }) => {
    await appPage.setViewportSize({ width: 1024, height: 700 });
    await appPage.goto("/machine");
    await expect(appPage.getByRole("heading", { name: "Machine" })).toBeVisible();

    const cmdk = appPage.getByRole("button", { name: "Command palette" });
    const selector = appPage.getByRole("button", { name: /^Project:/ });
    // Side by side at the narrowest supported width, not overlapping.
    const [a, b] = await Promise.all([selector.boundingBox(), cmdk.boundingBox()]);
    expect(a && b).toBeTruthy();
    expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x);
    expect(b!.x + b!.width).toBeLessThanOrEqual(1024);

    await cmdk.click();
    const palette = appPage.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("button").first()).toHaveText("Rescan this machine");
    await expect(palette.getByText("This page")).toBeVisible();

    await appPage.keyboard.press("Escape");
    await appPage.goto("/marketplace");
    await expect(appPage.getByRole("heading", { name: "Browse Plugins" })).toBeVisible();
    await appPage.keyboard.press("Meta+k");
    await expect(palette).toBeVisible();
    await expect(palette.getByText("This page")).toHaveCount(0);
  });
});
