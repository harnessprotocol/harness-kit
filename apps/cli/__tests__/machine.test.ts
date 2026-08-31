import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SURFACE_IDS } from "@harness-kit/core";
import { statusCommand } from "../src/commands/status.js";
import { diffCommand } from "../src/commands/diff.js";
import { detectCommand } from "../src/commands/detect.js";
import { SqliteStateStore } from "../src/state/sqlite-store.js";
import { CliTestEnv } from "./helpers/cli-test-env.js";

/**
 * Task 13: machine-wide status section, cross-surface diff mode, and the
 * detect carry-forward for non-compile surfaces. Every test runs in a fresh
 * temp project + temp HOME so observation and the state db never touch the
 * real machine.
 */
describe.sequential("machine inventory CLI", () => {
  let root: string;
  let project: string;
  let home: string;
  let originalCwd: string;
  let env: CliTestEnv;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-machine-"));
    project = join(root, "project");
    home = join(root, "home");
    await mkdir(project, { recursive: true });
    await mkdir(home, { recursive: true });
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

  /** A project where claude-code, cursor, and pi are detected, and
   * mcp-server "postgres" exists in BOTH claude-code scopes (user +
   * project) — the duplicate that proves present-row counts come from
   * cells, not resourceCount. */
  async function seedDuplicateMcpFixture(): Promise<void> {
    await mkdir(join(project, ".claude"), { recursive: true });
    await mkdir(join(project, ".cursor"), { recursive: true });
    await mkdir(join(project, ".pi"), { recursive: true });
    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({ mcpServers: { postgres: { command: "pg-mcp", args: ["--local"] } } }),
    );
    await writeFile(
      join(home, ".claude.json"),
      JSON.stringify({ mcpServers: { postgres: { command: "pg-mcp" } } }),
    );
  }

  describe("status machine section", () => {
    it("emits an additive machine key in --json with all 11 surfaces in registry order", async () => {
      await seedDuplicateMcpFixture();
      await statusCommand({ json: true });

      const payload = JSON.parse(env.getLog()) as Record<string, unknown>;
      // Existing FleetReport keys are still present (AC-29).
      expect(payload).toHaveProperty("scopes");
      expect(payload).toHaveProperty("rows");
      expect(payload).toHaveProperty("summary");

      const machine = payload.machine as {
        surfaces: Array<{ id: string; detected: boolean; resourceCount: number }>;
        rows: Array<{ key: string; cells: Record<string, { status: string }> }>;
      };
      expect(machine.surfaces.map((s) => s.id)).toEqual([...SURFACE_IDS]);
      const byId = new Map(machine.surfaces.map((s) => [s.id, s]));
      expect(byId.get("claude-code")?.detected).toBe(true);
      expect(byId.get("cursor")?.detected).toBe(true);
      expect(byId.get("pi")?.detected).toBe(true);
      expect(byId.get("junie")?.detected).toBe(false);
      // Raw entry count includes the user+project duplicate...
      expect(byId.get("claude-code")?.resourceCount).toBe(2);
      // ...but the grid folds both into ONE row's cell.
      const row = machine.rows.find((r) => r.key === "mcp-server:postgres");
      expect(row?.cells["claude-code"].status).toBe("present");
    });

    it("renders the human Machine section with derived counts and not-installed annotations", async () => {
      await seedDuplicateMcpFixture();
      await statusCommand({});

      const log = env.getLog();
      expect(log).toContain("Machine");
      // Present-row count derived from cells: 1, not the raw entry count 2.
      expect(log).toMatch(/Claude Code\s+1 present, 1 gap\(s\)/);
      // Undetected surfaces are annotated rather than dropped.
      expect(log).toMatch(/Junie.*\(not installed\)/);
      // Totals + the cross-surface diff hint.
      expect(log).toMatch(/1 resource row\(s\), 1 gap\(s\), 0 diff\(s\)/);
      expect(log).toContain("harness-kit diff --from <a> --to <b>");
      expect(env.exitCode).toBeNull();

      // The observation snapshot was persisted to the (temp-HOME) state db.
      const store = new SqliteStateStore(join(home, ".harness", "harness.db"));
      try {
        const snapshot = await store.latestObservation();
        expect(snapshot).not.toBeNull();
        // process.cwd() rather than `project`: macOS tmpdir paths resolve
        // through the /var -> /private/var symlink when chdir'd into.
        expect(snapshot?.meta.projectRoot).toBe(process.cwd());
        expect(
          snapshot?.resources.filter((r) => r.identityKey === "mcp-server:postgres"),
        ).toHaveLength(2);
      } finally {
        await store.close();
      }
    });

    it("degrades gracefully when the state db is corrupt: one warning, no stack trace, exit unchanged", async () => {
      await seedDuplicateMcpFixture();
      await mkdir(join(home, ".harness"), { recursive: true });
      await writeFile(join(home, ".harness", "harness.db"), "this is not a sqlite database at all");

      await statusCommand({});

      const warnings = env.consoleError.filter((line) => line.includes("state database unavailable"));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("continuing without history");
      expect(env.getError()).not.toMatch(/\n\s+at /);
      // The command still produced its report and did not fail.
      expect(env.getLog()).toContain("Machine");
      expect(env.exitCode).toBeNull();
    });
  });

  describe("diff --from/--to cross-surface mode", () => {
    it("reports a gap when one surface has an mcp server the other lacks, and exits 1", async () => {
      await seedDuplicateMcpFixture();

      await expect(
        diffCommand(undefined, { from: "claude-code", to: "cursor" }),
      ).rejects.toThrow("process.exit(1)");
      expect(env.exitCode).toBe(1);

      const log = env.getLog();
      expect(log).toContain("mcp-server:postgres");
      expect(log).toContain("present on claude-code");
      expect(log).toContain("absent on cursor");
    });

    it("filters rows with --only and emits the documented --json shape", async () => {
      await seedDuplicateMcpFixture();

      await expect(
        diffCommand(undefined, { from: "claude-code", to: "cursor", only: "mcp-server", json: true }),
      ).rejects.toThrow("process.exit(1)");

      const payload = JSON.parse(env.getLog()) as {
        from: string;
        to: string;
        rows: Array<{ key: string; from: string; to: string; deltas: unknown[] }>;
        summary: { gaps: number; diffs: number; identical: number };
      };
      expect(payload.from).toBe("claude-code");
      expect(payload.to).toBe("cursor");
      expect(payload.rows).toHaveLength(1);
      expect(payload.rows[0]).toMatchObject({ key: "mcp-server:postgres", from: "present", to: "absent" });
      expect(payload.summary).toEqual({ gaps: 1, diffs: 0, identical: 0 });
      expect(env.exitCode).toBe(1);
    });

    it("excludes rows via --only when the kind does not match", async () => {
      await seedDuplicateMcpFixture();

      await diffCommand(undefined, { from: "claude-code", to: "cursor", only: "skill", json: true });

      const payload = JSON.parse(env.getLog()) as { rows: unknown[]; summary: { gaps: number } };
      expect(payload.rows).toHaveLength(0);
      expect(payload.summary.gaps).toBe(0);
      expect(env.exitCode).toBeNull();
    });

    it("exits 0 when the pair is identical", async () => {
      await seedDuplicateMcpFixture();
      // Give cursor the same server; the project-scope entry wins precedence
      // on claude-code, so both effective forms are identical.
      await writeFile(
        join(project, ".cursor", "mcp.json"),
        JSON.stringify({ mcpServers: { postgres: { command: "pg-mcp", args: ["--local"] } } }),
      );

      await diffCommand(undefined, { from: "claude-code", to: "cursor" });

      expect(env.exitCode).toBeNull();
      const log = env.getLog();
      expect(log).toContain("identical on claude-code and cursor");
      expect(log).toMatch(/0 gap\(s\), 0 diff\(s\), 1 identical row\(s\)/);
    });

    it("reports not-applicable cells without triggering exit 1", async () => {
      // pi has no concept of mcp servers; a claude-code-only server must
      // read as "not applicable on pi", not as a gap.
      await seedDuplicateMcpFixture();

      await diffCommand(undefined, { from: "claude-code", to: "pi" });

      expect(env.exitCode).toBeNull();
      expect(env.getLog()).toContain("not applicable on pi");
    });

    it("rejects an unknown surface id with the legacy hint and the valid id list", async () => {
      await expect(
        diffCommand(undefined, { from: "copilot", to: "cursor" }),
      ).rejects.toThrow("process.exit(1)");

      expect(env.exitCode).toBe(1);
      const error = env.getError();
      expect(error).toContain("Unknown surface: copilot");
      expect(error).toContain("did you mean copilot-vscode?");
      expect(error).toContain(SURFACE_IDS.join(", "));
    });
  });

  describe("detect non-compile carry-forward", () => {
    it("lists pi after the platform summary when .pi/ is present", async () => {
      await mkdir(join(project, ".pi"), { recursive: true });

      await detectCommand({});

      expect(env.getLog()).toContain("pi detected (not a compile target)");
    });

    it("does not list non-compile surfaces when none are detected", async () => {
      await detectCommand({});

      expect(env.getLog()).not.toContain("not a compile target");
    });
  });
});
