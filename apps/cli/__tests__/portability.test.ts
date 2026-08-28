import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureCommand } from "../src/commands/capture.js";
import { applyCommand } from "../src/commands/apply.js";
import { rollbackCommand } from "../src/commands/rollback.js";
import { skillsPromoteCommand } from "../src/commands/skills.js";

describe.sequential("portability CLI workflows", () => {
  let root: string;
  let project: string;
  let home: string;
  let originalCwd: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-portability-"));
    project = join(root, "project");
    home = join(root, "home");
    await mkdir(join(project, ".claude/skills/review"), { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(
      join(project, ".claude/skills/review/SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
    originalCwd = process.cwd();
    process.chdir(project);
    vi.stubEnv("HOME", home);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("captures, applies, and restores a whole transaction", async () => {
    await captureCommand({ scope: "project" });
    expect(await readFile(join(project, "harness.yaml"), "utf8")).toContain('version: "2"');

    await applyCommand("harness.yaml", { target: "codex", yes: true });
    expect(await readFile(join(project, ".agents/skills/review/SKILL.md"), "utf8")).toContain("# Review");
    expect(await readFile(join(project, ".harness/state.json"), "utf8")).toContain("lastKnownGood");

    await rollbackCommand({ yes: true });
    await expect(readFile(join(project, ".agents/skills/review/SKILL.md"), "utf8")).rejects.toThrow();
  });

  it("promotes a validated capsule into the personal content-addressed catalog", async () => {
    const source = join(root, "shared-review");
    await mkdir(join(source, "scripts"), { recursive: true });
    await writeFile(
      join(source, "SKILL.md"),
      "---\nname: shared-review\ndescription: Shared review\n---\n\n# Shared\n",
    );
    await writeFile(join(source, "scripts/check.sh"), "#!/bin/sh\necho ok\n");

    await skillsPromoteCommand(source, { mode: "capsule", scope: "personal", yes: true });
    const profile = await readFile(join(home, ".harness/harness.yaml"), "utf8");
    expect(profile).toContain("capsule:personal/shared-review");
    expect(profile).toMatch(/sha256:\s*[a-f0-9]{64}/);
  });
});
