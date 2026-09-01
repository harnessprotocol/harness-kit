import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { surfaceSyncCommand } from "../src/commands/surface-sync.js";
import { CliTestEnv } from "./helpers/cli-test-env.js";

/**
 * Task 10 / AC-27, AC-28, AC-38. Every test runs in a fresh temp HOME so the
 * real machine's config is never read or written.
 */
describe.sequential("cross-surface sync", () => {
  let root: string;
  let project: string;
  let home: string;
  let originalCwd: string;
  let env: CliTestEnv;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-surface-sync-"));
    project = join(root, "project");
    home = join(root, "home");
    await mkdir(project, { recursive: true });
    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(join(home, ".cursor"), { recursive: true });
    // claude-code has an MCP server; cursor is detected but does not.
    await writeFile(
      join(home, ".claude.json"),
      JSON.stringify({
        mcpServers: { postgres: { type: "stdio", command: "pg-mcp", args: ["--local"] } },
      }),
    );
    await writeFile(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: {} }));
    originalCwd = process.cwd();
    process.chdir(project);
    vi.stubEnv("HOME", home);
    env = new CliTestEnv();
    env.setup();
  });

  afterEach(() => {
    env.restore();
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports without writing when bare", async () => {
    const before = await readFile(join(home, ".cursor", "mcp.json"), "utf8");
    await surfaceSyncCommand({});
    const output = env.consoleLog.join("\n");
    expect(output).toContain("Nothing has been written.");
    expect(await readFile(join(home, ".cursor", "mcp.json"), "utf8")).toBe(before);
  });

  it("shows the exact CLI invocation for every proposed action (AC-28)", async () => {
    await surfaceSyncCommand({ only: ["mcp-server"], json: true });
    const payload = JSON.parse(env.consoleLog.join("\n"));
    const action = payload.actions.find((entry: { to: string }) => entry.to === "cursor");
    expect(action.cli).toContain("--from claude-code");
    expect(action.cli).toContain("--to cursor");
    expect(action.cli).toContain("--only mcp-server:postgres");
    expect(action.cli).toContain("--yes");
  });

  it("applies only with --yes", async () => {
    await surfaceSyncCommand({ only: ["mcp-server:postgres"], to: ["cursor"], yes: true });
    const after = JSON.parse(await readFile(join(home, ".cursor", "mcp.json"), "utf8"));
    expect(after.mcpServers.postgres).toMatchObject({ type: "stdio", command: "pg-mcp" });
  });

  it("honours --dry-run even alongside --yes", async () => {
    const before = await readFile(join(home, ".cursor", "mcp.json"), "utf8");
    await surfaceSyncCommand({ to: ["cursor"], yes: true, dryRun: true });
    expect(await readFile(join(home, ".cursor", "mcp.json"), "utf8")).toBe(before);
  });

  it("errors with the install mapping for retired flags (AC-38)", async () => {
    await expect(surfaceSyncCommand({ frozen: true })).rejects.toThrow(/harness-kit install --frozen/);
    await expect(surfaceSyncCommand({ locked: true })).rejects.toThrow(/harness-kit install --locked/);
  });

  it("rejects an unknown surface by name", async () => {
    await expect(surfaceSyncCommand({ from: "emacs" })).rejects.toThrow(/unknown surface/);
  });

  it("filters by --to", async () => {
    await surfaceSyncCommand({ to: ["cursor"], json: true });
    const payload = JSON.parse(env.consoleLog.join("\n"));
    expect(payload.actions.every((entry: { to: string }) => entry.to === "cursor")).toBe(true);
  });

  it("reports up-to-date rather than re-writing after a successful apply", async () => {
    await surfaceSyncCommand({ only: ["mcp-server:postgres"], to: ["cursor"], yes: true });
    env.consoleLog.length = 0;
    await surfaceSyncCommand({ only: ["mcp-server:postgres"], to: ["cursor"], json: true });
    const payload = JSON.parse(env.consoleLog.join("\n"));
    // The gap is closed, so there is no longer an action proposed at all.
    expect(payload.actions.filter((e: { status: string }) => e.status === "ready")).toEqual([]);
  });

  it("records the apply in the rollback ledger", async () => {
    await surfaceSyncCommand({ only: ["mcp-server:postgres"], to: ["cursor"], yes: true });
    const { SqliteStateStore } = await import("../src/state/sqlite-store.js");
    const store = await SqliteStateStore.open(join(home, ".harness", "harness.db"));
    try {
      const listed = await store.listTransactions();
      expect(listed.length).toBeGreaterThan(0);
      expect(listed[0]?.surfaces).toContain("cursor");
    } finally {
      await store.close();
    }
  });
});
