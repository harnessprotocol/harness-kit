import { describe, it, expect } from "vitest";
import { renderArchitecturalConstraints } from "../src/compile/architectural-constraints.js";
import { compile } from "../src/compile/compile.js";
import { checkCompiled } from "../src/compile/check.js";
import { parseHarness } from "../src/parser/parse-harness.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import type { ArchitecturalConstraints } from "../src/types.js";

const HEADER = `version: "1"
kind: profile
metadata:
  name: demo
  description: Demo harness exercising architectural constraints.
`;

const CONSTRAINTS = `architectural-constraints:
  linters:
    - name: module-boundary
      description: No imports across layer boundaries.
  structural-tests:
    - name: layering
      description: The dependency graph stays acyclic.
      entrypoint: pnpm test:arch
  review-policy:
    patterns:
      - name: no-queries-in-loops
        rule: Never issue a database query inside a loop.
        severity: error
`;

describe("renderArchitecturalConstraints", () => {
  it("returns null when there is nothing to say", () => {
    expect(renderArchitecturalConstraints(undefined)).toBeNull();
    expect(renderArchitecturalConstraints({})).toBeNull();
    expect(renderArchitecturalConstraints({ "review-policy": {} })).toBeNull();
    expect(
      renderArchitecturalConstraints({ linters: [], "structural-tests": [] }),
    ).toBeNull();
  });

  it("groups patterns by severity, most severe first", () => {
    const out = renderArchitecturalConstraints({
      "review-policy": {
        patterns: [
          { name: "c", rule: "Info rule.", severity: "info" },
          { name: "a", rule: "Error rule.", severity: "error" },
          { name: "b", rule: "Warning rule.", severity: "warning" },
        ],
      },
    })!;
    const order = ["Must not violate", "Should follow", "Worth considering"].map((h) =>
      out.indexOf(h),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  // The schema declares default: "warning"; an author who omits it should land
  // in the same group as one who spells it out.
  it("defaults a pattern with no severity to warning", () => {
    const out = renderArchitecturalConstraints({
      "review-policy": { patterns: [{ name: "p", rule: "A rule." }] },
    })!;
    expect(out).toContain("### Should follow");
    expect(out).toContain("- **p** — A rule.");
    expect(out).not.toContain("Must not violate");
  });

  it("renders enforcement and the runnable entrypoint for deterministic gates", () => {
    const out = renderArchitecturalConstraints({
      linters: [{ name: "l", description: "Lint rule.", enforcement: "warn" }],
      "structural-tests": [
        { name: "t", description: "Test rule.", entrypoint: "pnpm test:arch" },
      ],
    })!;
    expect(out).toContain("- **l** — linter, warns. Lint rule.");
    // enforcement defaults to block per the schema
    expect(out).toContain("- **t** — structural test, blocks. Test rule. Run: `pnpm test:arch`");
  });

  // enabled:false turns off the LLM review layer. The CI gates run regardless of
  // what the agent is told, so suppressing them would hide real blockers.
  it("suppresses review patterns when disabled but keeps the CI gates", () => {
    const constraints: ArchitecturalConstraints = {
      linters: [{ name: "l", description: "Lint rule." }],
      "review-policy": {
        enabled: false,
        guidance: "Philosophy.",
        patterns: [{ name: "p", rule: "A rule." }],
      },
    };
    const out = renderArchitecturalConstraints(constraints)!;
    expect(out).toContain("- **l** — linter, blocks. Lint rule.");
    expect(out).not.toContain("A rule.");
    expect(out).not.toContain("Philosophy.");
  });

  it("never renders review-policy.model — it configures the reviewer, not the agent", () => {
    const out = renderArchitecturalConstraints({
      "review-policy": { model: "claude-opus", patterns: [{ name: "p", rule: "A rule." }] },
    })!;
    expect(out).not.toContain("claude-opus");
  });
});

describe("compiling architectural-constraints", () => {
  it("emits its own marker block, separate from instructions.operational", async () => {
    const fs = new MockFsProvider();
    const result = await compile(
      HEADER + "instructions:\n  operational: |\n    ## Commands\n" + CONSTRAINTS,
      ["claude-code"],
      fs,
      { dryRun: true },
    );

    const slots = result.files.filter((f) => f.path === "CLAUDE.md").map((f) => f.slot);
    expect(slots).toEqual(["constraints", "operational"]);

    // Last write wins on a shared path, so the final CLAUDE.md must carry both.
    const final = [...result.files].reverse().find((f) => f.path === "CLAUDE.md")!;
    expect(final.content).toContain("<!-- BEGIN harness:demo:constraints -->");
    expect(final.content).toContain("<!-- BEGIN harness:demo:operational -->");
    expect(final.content).toContain("## Commands");
  });

  // Regression: each adapter's appendPermissionsToInstructions() mutates the
  // FileAction whose slot is "operational". If constraints were emitted after it,
  // constraints would be the last write for the path and silently drop permissions.
  it("keeps appended permissions on a shared file", async () => {
    const fs = new MockFsProvider();
    const result = await compile(
      HEADER +
        "instructions:\n  operational: |\n    ## Commands\n" +
        CONSTRAINTS +
        "permissions:\n  tools:\n    allow: [\"Bash(pnpm build)\"]\n",
      ["copilot-vscode"],
      fs,
      { dryRun: true },
    );

    const path = ".github/copilot-instructions.md";
    const final = [...result.files].reverse().find((f) => f.path === path)!;
    expect(final.content).toContain("Bash(pnpm build)");
    expect(final.content).toContain("<!-- BEGIN harness:demo:constraints -->");
  });

  it("compiles with no instructions section at all", async () => {
    const fs = new MockFsProvider();
    const result = await compile(HEADER + CONSTRAINTS, ["claude-code"], fs, {
      dryRun: true,
    });
    const claudeMd = result.files.filter((f) => f.path === "CLAUDE.md");
    expect(claudeMd).toHaveLength(1);
    expect(claudeMd[0].slot).toBe("constraints");
    expect(claudeMd[0].content).toContain("no-queries-in-loops");
  });

  // The whole reason the block rides the operational FILE: behavioral is null on
  // five of eight targets, and constraints reaching three of eight is worse than none.
  it("reaches every target platform", async () => {
    const fs = new MockFsProvider();
    const targets = ["claude-code", "cursor", "copilot-vscode", "codex"] as const;
    const result = await compile(HEADER + CONSTRAINTS, [...targets], fs, {
      dryRun: true,
    });
    const paths = result.files.filter((f) => f.slot === "constraints").map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "CLAUDE.md",
        ".cursor/rules/harness.mdc",
        ".github/copilot-instructions.md",
        "AGENTS.md",
      ]),
    );
  });

  // An .mdc without frontmatter is not loaded as a cursor rule, so the block
  // needs its own when it is the only thing in the file.
  it("gives cursor frontmatter when constraints stands alone", async () => {
    const fs = new MockFsProvider();
    const result = await compile(HEADER + CONSTRAINTS, ["cursor"], fs, { dryRun: true });
    const mdc = result.files.find((f) => f.path === ".cursor/rules/harness.mdc")!;
    expect(mdc.content.startsWith("---\n")).toBe(true);
    expect(mdc.content).toContain("alwaysApply: true");
  });

  it("is suppressed by instructions.import-mode: skip", async () => {
    const fs = new MockFsProvider();
    const result = await compile(
      HEADER + 'instructions:\n  import-mode: skip\n  operational: |\n    ## Commands\n' + CONSTRAINTS,
      ["claude-code"],
      fs,
      { dryRun: true },
    );
    expect(result.files.some((f) => f.slot === "constraints")).toBe(false);
  });

  it("reports drift when the deployed constraints block is missing", async () => {
    const fs = new MockFsProvider();
    const { config } = parseHarness(HEADER + CONSTRAINTS);
    const result = await checkCompiled(config, ["claude-code"], fs);
    const entry = result.entries.find((e) => e.name === "constraints");
    expect(entry).toBeDefined();
    expect(entry!.path).toBe("CLAUDE.md");
    expect(entry!.status).toBe("missing");
    expect(result.hasDrift).toBe(true);
  });
});
