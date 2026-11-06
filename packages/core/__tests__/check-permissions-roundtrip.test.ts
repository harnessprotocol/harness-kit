import { describe, it, expect } from "vitest";
import { compile } from "../src/compile/compile.js";
import { checkCompiled, getCheckableTargets } from "../src/compile/check.js";
import { parseHarness } from "../src/parser/parse-harness.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import type { SurfaceId } from "../src/types.js";

// Regression: compile appends a "Tool Permissions" section to the operational
// marker block on every non-claude-code target, but check compared the deployed
// block to the bare instructions.operational text and reported drift right
// after a clean compile.

const YAML = `version: "1"
metadata:
  name: perm-demo
  description: Permissions round trip.
instructions:
  operational: |
    ## Commands
    - Build: \`pnpm build\`
  behavioral: |
    Be concise.
permissions:
  tools:
    allow:
      - Read
    deny:
      - mcp__postgres__drop_table
    ask:
      - Bash
  paths:
    writable:
      - sql/
`;

const TARGETS = getCheckableTargets();

describe("compile then check with a permissions block", () => {
  it("covers every checkable target", () => {
    expect(TARGETS).toEqual(
      expect.arrayContaining(["claude-code", "cursor", "codex", "opencode", "copilot-vscode"]),
    );
  });

  for (const target of TARGETS) {
    it(`reports no drift for ${target}`, async () => {
      const fs = new MockFsProvider();
      await compile(YAML, [target as SurfaceId], fs, { force: true });
      const { config } = parseHarness(YAML);
      const result = await checkCompiled(config, [target as SurfaceId], fs);
      expect(result.entries.filter((e) => e.status !== "ok")).toEqual([]);
      expect(result.hasDrift).toBe(false);
    });
  }

  it("still reports drift when the deployed permissions text is edited", async () => {
    const fs = new MockFsProvider();
    await compile(YAML, ["codex"], fs, { force: true });
    const path = "/project/AGENTS.md";
    const text = await fs.readFile(path);
    expect(text).toContain("mcp__postgres__drop_table");
    await fs.writeFile(path, text.replace("mcp__postgres__drop_table", "something_else"));
    const { config } = parseHarness(YAML);
    const result = await checkCompiled(config, ["codex"], fs);
    expect(result.hasDrift).toBe(true);
    expect(result.entries.find((e) => e.name === "operational")!.status).toBe("drift");
  });

  it("still reports drift when instructions change after compile", async () => {
    const fs = new MockFsProvider();
    await compile(YAML, ["cursor"], fs, { force: true });
    const { config } = parseHarness(YAML.replace("pnpm build", "pnpm other"));
    const result = await checkCompiled(config, ["cursor"], fs);
    expect(result.hasDrift).toBe(true);
  });
});
