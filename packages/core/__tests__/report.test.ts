import { describe, it, expect } from "vitest";
import { buildReport } from "../src/report/report.js";
import type { CompileResult } from "../src/types.js";

function makeResult(overrides: Partial<CompileResult> = {}): CompileResult {
  return {
    harnessName: "test-harness",
    targets: ["claude-code", "cursor"],
    files: [],
    warnings: [],
    skippedPlugins: [],
    ...overrides,
  };
}

describe("buildReport", () => {
  it("sorts entries by platform order then slot order", () => {
    const result = makeResult({
      files: [
        { path: ".cursor/mcp.json", content: "{}", action: "create", platform: "cursor", slot: "mcp-servers", linesAdded: 1 },
        { path: "CLAUDE.md", content: "ops", action: "create", platform: "claude-code", slot: "operational", linesAdded: 10 },
        { path: ".cursor/rules/harness.mdc", content: "ops", action: "create", platform: "cursor", slot: "operational", linesAdded: 10 },
        { path: "AGENT.md", content: "beh", action: "create", platform: "claude-code", slot: "behavioral", linesAdded: 5 },
      ],
    });

    const report = buildReport(result);
    const files = report.entries.map((e) => e.file);
    expect(files).toEqual([
      "CLAUDE.md",
      "AGENT.md",
      ".cursor/rules/harness.mdc",
      ".cursor/mcp.json",
    ]);
  });

  it("formats MCP server counts", () => {
    const result = makeResult({
      files: [
        { path: ".mcp.json", content: "{}", action: "create", platform: "claude-code", slot: "mcp-servers", linesAdded: 3 },
      ],
    });

    const report = buildReport(result);
    expect(report.entries[0].detail).toBe("3 servers");
  });

  it("formats single server count without plural", () => {
    const result = makeResult({
      files: [
        { path: ".mcp.json", content: "{}", action: "create", platform: "claude-code", slot: "mcp-servers", linesAdded: 1 },
      ],
    });

    const report = buildReport(result);
    expect(report.entries[0].detail).toBe("1 server");
  });

  it("formats permission details from JSON content", () => {
    const content = JSON.stringify({
      permissions: { allow: ["Read", "Write"], deny: ["drop"] },
    });

    const result = makeResult({
      files: [
        { path: ".claude/settings.json", content, action: "create", platform: "claude-code", slot: "permissions" },
      ],
    });

    const report = buildReport(result);
    expect(report.entries[0].detail).toBe("2 allowed, 1 denied");
  });

  it("omits skipped files", () => {
    const result = makeResult({
      files: [
        { path: "CLAUDE.md", content: "ops", action: "skip", platform: "claude-code", slot: "operational" },
        { path: "AGENT.md", content: "beh", action: "create", platform: "claude-code", slot: "behavioral", linesAdded: 5 },
      ],
    });

    const report = buildReport(result);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].file).toBe("AGENT.md");
  });

  it("passes through warnings and skippedPlugins", () => {
    const result = makeResult({
      warnings: ["test warning"],
      skippedPlugins: ["missing: skipped"],
    });

    const report = buildReport(result);
    expect(report.warnings).toEqual(["test warning"]);
    expect(report.skippedPlugins).toEqual(["missing: skipped"]);
  });

  it("formats skills as copied", () => {
    const result = makeResult({
      files: [
        { path: ".cursor/skills/explain/SKILL.md", content: "# Explain", action: "create", platform: "cursor", slot: "skills" },
      ],
    });

    const report = buildReport(result);
    expect(report.entries[0].detail).toBe("copied");
  });
});
