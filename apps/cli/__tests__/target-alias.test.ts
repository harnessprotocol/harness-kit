import { mkdtemp } from "node:fs/promises";
import { copyFile, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileCommand } from "../src/commands/compile.js";
import { checkCommand } from "../src/commands/check.js";
import { diffCommand } from "../src/commands/diff.js";
import { compileHint } from "../src/commands/init.js";
import { parseTargets } from "../src/commands/portability-common.js";
import { CliTestEnv } from "./helpers/cli-test-env.js";

describe.sequential("agents-md target alias", () => {
  let env: CliTestEnv;
  let project: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    env = new CliTestEnv();
    env.setup();
    project = await mkdtemp(join(tmpdir(), "hk-alias-"));
    process.chdir(project);
    // test-harness.yaml has no permissions block; with one, codex check reports
    // drift right after compile (permissions text is appended on write only).
    await copyFile(join(__dirname, "fixtures", "test-harness.yaml"), join(project, "harness.yaml"));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    env.restore();
    vi.restoreAllMocks();
  });

  it("compile --target agents-md writes AGENTS.md; check and diff accept it", async () => {
    await compileCommand("harness.yaml", { target: "agents-md", force: true });
    const agents = join(project, "AGENTS.md");
    expect(await readFile(agents, "utf-8")).toContain("pnpm build");

    env.consoleLog.length = 0;
    await checkCommand("harness.yaml", { target: "agents-md" });
    expect(env.exitCode).toBeNull();

    await writeFile(agents, (await readFile(agents, "utf-8")).replace("pnpm build", "pnpm drifted"));
    env.consoleLog.length = 0;
    await expect(diffCommand("harness.yaml", { target: "agents-md" })).rejects.toThrow("process.exit(1)");
  });

  it("check rejects unknown targets and names agents-md as valid", async () => {
    await expect(checkCommand("harness.yaml", { target: "agents" })).rejects.toThrow("process.exit(1)");
    expect(env.getError()).toContain("Unknown target: agents");
    expect(env.getError()).toContain("agents-md");
  });

  it("portability parseTargets resolves the alias and dedupes with codex", () => {
    expect(parseTargets("agents-md,codex")).toEqual(["codex"]);
    expect(() => parseTargets("agents")).toThrow(/agents-md/);
  });

  it("init suggests agents-md when no tool is confirmed", () => {
    expect(compileHint([])).toContain("--target agents-md");
    expect(compileHint([{ needsConfirmation: true }])).toContain("--target agents-md");
    expect(compileHint([{ needsConfirmation: false }])).not.toContain("agents-md");
  });
});
