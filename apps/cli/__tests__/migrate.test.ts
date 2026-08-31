import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrateCommand } from "../src/commands/migrate.js";
import { CliTestEnv } from "./helpers/cli-test-env.js";

const V2_YAML = [
  "# team profile",
  'version: "2"',
  "kind: profile",
  "scope: project",
  "metadata:",
  "  name: migrate-me",
  "  description: Migration fixture",
  "vendor:",
  "  # native copilot block",
  "  copilot:",
  "    chat.mode: agent",
  "",
].join("\n");

describe("migrate command", () => {
  let env: CliTestEnv;
  let root: string;
  let harnessPath: string;

  beforeEach(async () => {
    env = new CliTestEnv();
    env.setup();
    root = await mkdtemp(join(tmpdir(), "harness-migrate-"));
    harnessPath = join(root, "harness.yaml");
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("dry-runs by default: prints each change and leaves the file untouched", async () => {
    await writeFile(harnessPath, V2_YAML, "utf-8");

    await migrateCommand(harnessPath, {});

    expect(env.exitCode).toBeNull();
    const log = env.getLog();
    expect(log).toContain('renamed vendor key "copilot" to "copilot-vscode"');
    expect(log).toContain("set protocol version to 2.1");
    expect(log).toContain("Dry run");
    expect(await readFile(harnessPath, "utf-8")).toBe(V2_YAML);
  });

  it("--write persists the migration and preserves comments", async () => {
    await writeFile(harnessPath, V2_YAML, "utf-8");

    await migrateCommand(harnessPath, { write: true });

    expect(env.exitCode).toBeNull();
    const written = await readFile(harnessPath, "utf-8");
    expect(written).toContain('version: "2.1"');
    expect(written).toContain("copilot-vscode:");
    expect(written).not.toMatch(/^\s*copilot:/m);
    expect(written).toContain("chat.mode: agent");
    // Structure-preserving write: comments survive.
    expect(written).toContain("# team profile");
    expect(written).toContain("# native copilot block");
  });

  it("reports already-current on a second run and leaves the file unchanged", async () => {
    await writeFile(harnessPath, V2_YAML, "utf-8");
    await migrateCommand(harnessPath, { write: true });
    const afterFirst = await readFile(harnessPath, "utf-8");
    env.consoleLog = [];

    await migrateCommand(harnessPath, { write: true });

    expect(env.exitCode).toBeNull();
    expect(env.getLog()).toContain("already at protocol v2.1");
    expect(await readFile(harnessPath, "utf-8")).toBe(afterFirst);
  });

  it("--write chains a v1 profile all the way to 2.1", async () => {
    await writeFile(
      harnessPath,
      ['version: "1"', "metadata:", "  name: legacy-profile", "  description: Legacy", ""].join("\n"),
      "utf-8",
    );

    await migrateCommand(harnessPath, { write: true });

    expect(env.exitCode).toBeNull();
    expect(env.getLog()).toContain("set protocol version to 2");
    expect(env.getLog()).toContain("set protocol version to 2.1");
    const written = await readFile(harnessPath, "utf-8");
    expect(written).toContain('version: "2.1"');
    expect(written).toContain("$schema:");
    expect(written).toContain("scope: project");
  });

  it("exits 1 when the file is missing", async () => {
    await expect(migrateCommand(join(root, "nope.yaml"), {})).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getError()).toContain("No harness.yaml found");
  });

  it("exits 1 for an invalid profile without writing", async () => {
    await writeFile(harnessPath, 'version: "2"\n', "utf-8");

    await expect(migrateCommand(harnessPath, { write: true })).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(await readFile(harnessPath, "utf-8")).toBe('version: "2"\n');
  });
});
