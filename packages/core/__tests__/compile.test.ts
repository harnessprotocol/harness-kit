import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "../src/compile/compile.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

describe("compile", () => {
  it("compiles a valid harness for claude-code (dry-run)", async () => {
    const fs = new MockFsProvider();
    const yaml = loadFixture("valid-harness.yaml");

    const result = await compile(yaml, ["claude-code"], fs, { dryRun: true });

    expect(result.harnessName).toBe("my-harness");
    expect(result.targets).toEqual(["claude-code"]);
    expect(result.files.length).toBeGreaterThan(0);

    // Should have operational, behavioral, mcp-servers, permissions
    const slots = result.files.map((f) => f.slot);
    expect(slots).toContain("operational");
    expect(slots).toContain("behavioral");
    expect(slots).toContain("mcp-servers");
    expect(slots).toContain("permissions");
  });

  it("compiles for all targets (dry-run)", async () => {
    const fs = new MockFsProvider();
    const yaml = loadFixture("valid-harness.yaml");

    const result = await compile(
      yaml,
      ["claude-code", "cursor", "copilot"],
      fs,
      { dryRun: true },
    );

    expect(result.targets).toHaveLength(3);

    // Claude Code files
    expect(result.files.some((f) => f.path === "CLAUDE.md")).toBe(true);
    expect(result.files.some((f) => f.path === "AGENT.md")).toBe(true);
    expect(result.files.some((f) => f.path === ".mcp.json")).toBe(true);

    // Cursor files
    expect(result.files.some((f) => f.path === ".cursor/rules/harness.mdc")).toBe(true);
    expect(result.files.some((f) => f.path === ".cursor/mcp.json")).toBe(true);

    // Copilot files
    expect(result.files.some((f) => f.path === ".github/copilot-instructions.md")).toBe(true);
    expect(result.files.some((f) => f.path === ".vscode/mcp.json")).toBe(true);
  });

  it("throws on invalid harness.yaml", async () => {
    const fs = new MockFsProvider();
    const yaml = loadFixture("invalid-harness.yaml");

    await expect(
      compile(yaml, ["claude-code"], fs),
    ).rejects.toThrow("validation failed");
  });

  it("writes files when not dry-run", async () => {
    const fs = new MockFsProvider();
    const yaml = loadFixture("valid-harness.yaml");

    await compile(yaml, ["claude-code"], fs, { dryRun: false });

    // Files should exist in the mock filesystem
    const claudeMd = fs.getFile("/project/CLAUDE.md");
    expect(claudeMd).toBeDefined();
    expect(claudeMd).toContain("<!-- BEGIN harness:my-harness:operational -->");

    const mcpJson = fs.getFile("/project/.mcp.json");
    expect(mcpJson).toBeDefined();
    expect(JSON.parse(mcpJson!).mcpServers.postgres).toBeDefined();
  });

  it("generates correct marker format", async () => {
    const fs = new MockFsProvider();
    const yaml = loadFixture("valid-harness.yaml");

    const result = await compile(yaml, ["claude-code"], fs, { dryRun: true });
    const ops = result.files.find(
      (f) => f.slot === "operational" && f.platform === "claude-code",
    );

    expect(ops!.content).toMatch(
      /<!-- BEGIN harness:my-harness:operational -->/,
    );
    expect(ops!.content).toMatch(
      /<!-- END harness:my-harness:operational -->/,
    );
  });

  it("includes Cursor .mdc frontmatter", async () => {
    const fs = new MockFsProvider();
    const yaml = loadFixture("valid-harness.yaml");

    const result = await compile(yaml, ["cursor"], fs, { dryRun: true });
    const ops = result.files.find(
      (f) => f.slot === "operational" && f.platform === "cursor",
    );

    expect(ops!.content).toContain("description: Harness operational instructions");
    expect(ops!.content).toContain("alwaysApply: true");
  });

  it("reports warnings for non-enforceable deny permissions", async () => {
    const fs = new MockFsProvider();
    const yaml = loadFixture("valid-harness.yaml");

    const result = await compile(yaml, ["cursor"], fs, { dryRun: true });
    expect(result.warnings.some((w) => w.includes("not machine-enforceable"))).toBe(true);
  });
});
