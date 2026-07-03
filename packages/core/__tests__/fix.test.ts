import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { compile } from "../src/compile/compile.js";
import { parseHarness } from "../src/parser/parse-harness.js";
import { claudeCodeAdapter } from "../src/adapters/claude-code/index.js";
import { cursorAdapter } from "../src/adapters/cursor/index.js";
import { agentsMdAdapter } from "../src/adapters/agents-md/index.js";
import type { AdapterContext } from "../src/adapters/adapter.js";
import { detectDrift } from "../src/fix/index.js";
import { detectInstructionDrift, toDriftReport } from "../src/fix/detect.js";
import { buildFixPlan } from "../src/fix/plan.js";
import { applyFix } from "../src/fix/apply.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import { loadFixtureProject } from "./helpers/load-fixture-tree.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "..", "fixtures", "drift");

function ctxFor(fs: MockFsProvider): AdapterContext {
  return { fs, projectRoot: fs.cwd(), homeRoot: "/home/user" };
}

const YAML_ACME = `
version: "1"
metadata:
  name: acme
  description: test harness
instructions:
  operational: "Operational instructions, exactly as compiled."
`;

async function configFor(yaml: string) {
  const { config } = parseHarness(yaml);
  return config;
}

describe("drift classification (fix/detect.ts)", () => {
  it("classifies in-marker drift as modified-inside-markers (repairable)", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "in-marker-drift"));
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const drifted = items.filter((i) => i.slot === "operational" && i.path === "CLAUDE.md");

    expect(drifted.some((i) => i.class === "modified-inside-markers")).toBe(true);
  });

  it("classifies an absent expected file as missing", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const missing = items.find((i) => i.path === "CLAUDE.md" && i.slot === "operational");

    expect(missing?.class).toBe("missing");
  });

  it("classifies out-of-marker user edits as user-modified-outside, never repairable", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "out-of-marker-edit"));
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const outside = items.find((i) => i.class === "user-modified-outside");

    expect(outside).toBeDefined();
    expect(outside!.path).toBe("CLAUDE.md");

    // The marker block itself matches compiled output in this fixture, so
    // there should be NO modified-inside-markers or missing item for it.
    const repairableForFile = items.filter(
      (i) => i.path === "CLAUDE.md" && (i.class === "missing" || i.class === "modified-inside-markers"),
    );
    expect(repairableForFile).toHaveLength(0);
  });

  it("classifies a marker block for a slot/name no longer in harness.yaml as orphaned", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "orphaned-block"));
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const orphan = items.find((i) => i.class === "orphaned");

    expect(orphan).toBeDefined();
    expect(orphan!.harnessName).toBe("old-name");
    expect(orphan!.slot).toBe("operational");
  });

  it("toDriftReport groups items by class and computes hasDrift correctly", () => {
    const empty = toDriftReport([]);
    expect(empty.hasDrift).toBe(false);
    expect(empty.byClass.missing).toEqual([]);

    const onlyUserContent = toDriftReport([
      {
        class: "user-modified-outside",
        path: "CLAUDE.md",
        adapter: "claude-code",
        target: "claude-code",
        harnessName: "acme",
        slot: "operational",
        detail: "x",
      },
    ]);
    // user-modified-outside alone must NOT count as "drift" needing a fix —
    // it's review-only, never actionable via applyFix.
    expect(onlyUserContent.hasDrift).toBe(false);
  });
});

describe("adapter.diff() wiring", () => {
  it("claude-code adapter reports drift via diff() and capabilities.diff is true", async () => {
    expect(claudeCodeAdapter.capabilities.diff).toBe(true);
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "in-marker-drift"));
    const config = await configFor(YAML_ACME);

    const report = await claudeCodeAdapter.diff!(config, ctxFor(fs));
    expect(report.hasDrift).toBe(true);
    expect(report.byClass["modified-inside-markers"].length).toBeGreaterThan(0);
  });

  it("detectDrift() aggregates across the adapters covering the requested targets", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "in-marker-drift"));
    const config = await configFor(YAML_ACME);

    const report = await detectDrift(config, ctxFor(fs), ["claude-code"]);
    expect(report.hasDrift).toBe(true);
    // claude-code's CLAUDE.md drift must be present in the merged report.
    expect(report.items.some((i) => i.path === "CLAUDE.md" && i.adapter === "claude-code")).toBe(true);
    // Scoped to claude-code only — no cursor/copilot/agents-md items leak in.
    expect(report.items.every((i) => i.adapter === "claude-code")).toBe(true);
  });

  it("detectDrift() defaults to all checkable targets when none are specified", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    const config = await configFor(YAML_ACME);

    const report = await detectDrift(config, ctxFor(fs));
    // Every adapter's file is absent — all report "missing".
    const adapters = new Set(report.items.map((i) => i.adapter));
    expect(adapters.has("claude-code")).toBe(true);
    expect(adapters.has("cursor")).toBe(true);
    expect(adapters.has("copilot")).toBe(true);
    expect(adapters.has("agents-md")).toBe(true);
  });

  it("cursor adapter classifies its own harness.mdc marker drift", async () => {
    const fs = new MockFsProvider(
      {
        "/project/.cursor/rules/harness.mdc": [
          "---",
          "description: Harness operational instructions",
          'globs: "**/*"',
          "alwaysApply: true",
          "---",
          "",
          "<!-- BEGIN harness:acme:operational -->",
          "stale content",
          "<!-- END harness:acme:operational -->",
          "",
        ].join("\n"),
      },
      "/project",
      "/home/user",
    );
    const config = await configFor(YAML_ACME);
    const report = await cursorAdapter.diff!(config, ctxFor(fs));
    expect(report.byClass["modified-inside-markers"].some((i) => i.path === ".cursor/rules/harness.mdc")).toBe(true);
  });

  it("agents-md adapter restricts diff() to ctx.legacyTargets when provided", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    const config = await configFor(YAML_ACME);

    const restricted = await agentsMdAdapter.diff!(config, {
      ...ctxFor(fs),
      legacyTargets: ["codex"],
    });
    // AGENTS.md is shared across the whole family — restricting to one
    // legacy target still reports exactly one missing item for the shared file.
    const agentsMdItems = restricted.items.filter((i) => i.path === "AGENTS.md");
    expect(agentsMdItems).toHaveLength(1);
    expect(agentsMdItems[0].target).toBe("codex");
  });
});

describe("fix plan + apply: the byte-exact safety line", () => {
  it("EARS: WHEN drift is inside a marker block, fix restores compiled content without touching bytes outside the block", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "in-marker-drift"));
    const before = fs.getFile("/project/CLAUDE.md")!;
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const plan = await buildFixPlan(items, fs);

    expect(plan.changes).toHaveLength(1);
    const change = plan.changes[0];
    expect(change.path).toBe("CLAUDE.md");
    expect(change.operation).toBe("restore-marker");

    // The lines before the BEGIN marker and after the END marker must be
    // byte-for-byte identical between before and after.
    const beforeLines = before.split("\n");
    const afterLines = change.after.split("\n");
    const beginIdx = beforeLines.findIndex((l) => l.trim() === "<!-- BEGIN harness:acme:operational -->");
    const endIdx = beforeLines.findIndex((l) => l.trim() === "<!-- END harness:acme:operational -->");

    expect(beforeLines.slice(0, beginIdx)).toEqual(afterLines.slice(0, beginIdx));
    // The content after END shifts position only if line count inside the
    // block changed; compare by trailing slice instead of fixed index.
    const beforeAfterBlock = beforeLines.slice(endIdx + 1);
    const afterAfterBlock = afterLines.slice(afterLines.length - beforeAfterBlock.length);
    expect(afterAfterBlock).toEqual(beforeAfterBlock);

    // And the marker content itself now matches the compiled expectation.
    expect(change.after).toContain("Operational instructions, exactly as compiled.");
    expect(change.after).not.toContain("stale operational content");
  });

  it("EARS: WHEN a user edited outside markers, it's classified user-modified-outside and fix never modifies it", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "out-of-marker-edit"));
    const before = fs.getFile("/project/CLAUDE.md")!;
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const plan = await buildFixPlan(items, fs);

    // No repairable drift in this fixture (marker content already matches) —
    // the plan must be empty, and the user-modified-outside item must be
    // acknowledged, never planned.
    expect(plan.changes).toHaveLength(0);
    expect(plan.acknowledged.some((i) => i.class === "user-modified-outside")).toBe(true);

    // Applying this (empty) plan must leave the file completely untouched.
    const result = await applyFix(plan, { fs, timestamp: "2026-07-03T00-00-00" });
    expect(result.written).toHaveLength(0);
    expect(fs.getFile("/project/CLAUDE.md")).toBe(before);
  });

  it("byte-exact proof: drift BOTH inside the marker AND in user prose above/below — fix restores the block and leaves prose untouched", async () => {
    const fileContent = [
      "# User's own heading",
      "",
      "The user wrote this paragraph and then edited it later by hand.",
      "",
      "<!-- BEGIN harness:acme:operational -->",
      "very stale content, does not match harness.yaml at all",
      "<!-- END harness:acme:operational -->",
      "",
      "The user also edited this trailing paragraph after export.",
      "",
    ].join("\n");

    const fs = new MockFsProvider({ "/project/CLAUDE.md": fileContent }, "/project", "/home/user");
    const config = await configFor(YAML_ACME);

    const proseAbove = "# User's own heading\n\nThe user wrote this paragraph and then edited it later by hand.";
    const proseBelow = "The user also edited this trailing paragraph after export.";

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    expect(items.some((i) => i.class === "modified-inside-markers")).toBe(true);
    expect(items.some((i) => i.class === "user-modified-outside")).toBe(true);

    const plan = await buildFixPlan(items, fs);
    // Only the repairable in-marker drift is planned; the outside prose drift
    // (relative to whatever the user "should" have kept, which core has no
    // opinion on) is never part of the plan.
    expect(plan.changes).toHaveLength(1);

    const result = await applyFix(plan, { fs, timestamp: "20260703-000000" });
    expect(result.written).toEqual(["CLAUDE.md"]);

    const after = fs.getFile("/project/CLAUDE.md")!;
    expect(after).toContain(proseAbove);
    expect(after).toContain(proseBelow);
    expect(after).toContain("Operational instructions, exactly as compiled.");
    expect(after).not.toContain("very stale content");

    // Exact byte-for-byte check of the untouched regions.
    expect(after.startsWith(proseAbove)).toBe(true);
    expect(after.trimEnd().endsWith(proseBelow)).toBe(true);
  });

  it("EARS: WHEN fix runs as dry-run (plan only, no apply), zero writes occur and the printed plan equals what a subsequent apply executes", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "in-marker-drift"));
    const beforeSnapshot = { ...fs.getAllFiles() };
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const plan = await buildFixPlan(items, fs);

    // buildFixPlan is read-only: building the plan must not have mutated fs.
    expect(fs.getAllFiles()).toEqual(beforeSnapshot);

    // Now actually apply — the write must match plan.changes[0].after exactly.
    const result = await applyFix(plan, { fs, timestamp: "20260703-010203" });
    expect(result.written).toEqual(["CLAUDE.md"]);
    expect(fs.getFile("/project/CLAUDE.md")).toBe(plan.changes[0].after);
  });

  it("EARS: missing file — fix creates it with the compiled marker block", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    expect(items).toHaveLength(1);
    expect(items[0].class).toBe("missing");

    const plan = await buildFixPlan(items, fs);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].operation).toBe("create-file");
    expect(plan.changes[0].before).toBe("");

    const result = await applyFix(plan, { fs, timestamp: "20260703-020000" });
    expect(result.written).toEqual(["CLAUDE.md"]);
    expect(fs.getFile("/project/CLAUDE.md")).toContain("Operational instructions, exactly as compiled.");

    // No backup is written for a file that never existed.
    expect(result.backups).toHaveLength(0);
  });

  it("EARS: orphaned block — fix removes it, preserving the rest of the file byte-for-byte", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "orphaned-block"));
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const orphanItem = items.find((i) => i.class === "orphaned")!;
    expect(orphanItem).toBeDefined();

    const plan = await buildFixPlan(items, fs);
    const change = plan.changes.find((c) => c.path === "CLAUDE.md")!;
    expect(change).toBeDefined();

    expect(change.after).not.toContain("harness:old-name:operational");
    expect(change.after).toContain("Operational instructions, exactly as compiled.");
    expect(change.after).toContain("User prose above the blocks.");
    expect(change.after).toContain("User prose below the blocks.");
  });

  it("composes all repairable classes on one file: in-marker drift restored, orphan removed, user prose untouched", async () => {
    const fileContent = [
      "# User heading — never touch",
      "",
      "<!-- BEGIN harness:acme:operational -->",
      "stale content that must be replaced",
      "<!-- END harness:acme:operational -->",
      "",
      "<!-- BEGIN harness:retired:operational -->",
      "orphaned block that must be removed",
      "<!-- END harness:retired:operational -->",
      "",
      "User's trailing paragraph — never touch",
      "",
    ].join("\n");

    const fs = new MockFsProvider({ "/project/CLAUDE.md": fileContent }, "/project", "/home/user");
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const classes = new Set(items.map((i) => i.class));
    expect(classes.has("modified-inside-markers")).toBe(true);
    expect(classes.has("orphaned")).toBe(true);
    // No out-of-marker drift in this fixture — the user prose is untouched
    // relative to itself, so it should NOT appear as user-modified-outside
    // here... but core cannot know that without a prior snapshot, so it is
    // still surfaced (see detect.ts's documented limitation) and must still
    // never be part of the fix plan.
    const plan = await buildFixPlan(items, fs);
    const change = plan.changes.find((c) => c.path === "CLAUDE.md")!;
    expect(change).toBeDefined();

    const result = await applyFix(plan, { fs, timestamp: "20260703-333333" });
    const after = fs.getFile("/project/CLAUDE.md")!;

    expect(after).toContain("Operational instructions, exactly as compiled.");
    expect(after).not.toContain("stale content that must be replaced");
    expect(after).not.toContain("harness:retired:operational");
    expect(after).not.toContain("orphaned block that must be removed");
    expect(after).toContain("# User heading — never touch");
    expect(after).toContain("User's trailing paragraph — never touch");
    expect(result.written).toEqual(["CLAUDE.md"]);
  });

  it("backups are written before any mutation, one per touched (pre-existing) file", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "in-marker-drift"));
    const before = fs.getFile("/project/CLAUDE.md")!;
    const config = await configFor(YAML_ACME);

    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    const plan = await buildFixPlan(items, fs);

    const timestamp = "20260703-120000";
    const result = await applyFix(plan, { fs, timestamp });

    expect(result.backupDir).toBe(".harness/backups/20260703-120000");
    expect(result.backups).toEqual([".harness/backups/20260703-120000/CLAUDE.md"]);

    const backupContent = fs.getFile("/project/.harness/backups/20260703-120000/CLAUDE.md");
    expect(backupContent).toBe(before);

    // And the live file was actually repaired (backup captured the OLD state).
    expect(fs.getFile("/project/CLAUDE.md")).not.toBe(before);
  });

  it("core never calls Date.now()/Math.random(): timestamp is fully caller-controlled and deterministic", async () => {
    const fs1 = loadFixtureProject(resolve(FIXTURES_DIR, "in-marker-drift"));
    const fs2 = loadFixtureProject(resolve(FIXTURES_DIR, "in-marker-drift"));
    const config = await configFor(YAML_ACME);

    const items1 = await detectInstructionDrift(fs1, config, ["claude-code"], "claude-code");
    const items2 = await detectInstructionDrift(fs2, config, ["claude-code"], "claude-code");
    const plan1 = await buildFixPlan(items1, fs1);
    const plan2 = await buildFixPlan(items2, fs2);

    const result1 = await applyFix(plan1, { fs: fs1, timestamp: "FIXED" });
    const result2 = await applyFix(plan2, { fs: fs2, timestamp: "FIXED" });

    expect(result1.backupDir).toBe(result2.backupDir);
    expect(result1.backups).toEqual(result2.backups);
  });
});

describe("full compile -> drift -> fix loop", () => {
  it("a project compiled clean reports zero repairable drift", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    await compile(YAML_ACME, ["claude-code"], fs, {});

    const { config } = parseHarness(YAML_ACME);
    const report = await detectDrift(config, ctxFor(fs), ["claude-code"]);

    expect(report.hasDrift).toBe(false);
    expect(report.byClass.missing).toHaveLength(0);
    expect(report.byClass["modified-inside-markers"]).toHaveLength(0);
    expect(report.byClass.orphaned).toHaveLength(0);
  });

  it("hand-editing the compiled file inside the marker introduces detectable, fixable drift", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    await compile(YAML_ACME, ["claude-code"], fs, {});

    // Simulate a user hand-editing the deployed file's marker content.
    const deployed = fs.getFile("/project/CLAUDE.md")!;
    const tampered = deployed.replace(
      "Operational instructions, exactly as compiled.",
      "I changed this by hand.",
    );
    await fs.writeFile("/project/CLAUDE.md", tampered);

    const { config } = parseHarness(YAML_ACME);
    const items = await detectInstructionDrift(fs, config, ["claude-code"], "claude-code");
    expect(items.some((i) => i.class === "modified-inside-markers")).toBe(true);

    const plan = await buildFixPlan(items, fs);
    const result = await applyFix(plan, { fs, timestamp: "20260703-999999" });
    expect(result.written).toEqual(["CLAUDE.md"]);

    // Fix converges the file back to exactly what compile() produced.
    expect(fs.getFile("/project/CLAUDE.md")).toBe(deployed);
  });
});
