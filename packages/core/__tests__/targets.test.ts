import { describe, it, expect } from "vitest";
import { TARGETS, getTarget, AGENTS_MD_TARGETS } from "../src/compile/targets.js";
import type { TargetPlatform } from "../src/types.js";

describe("TARGETS registry", () => {
  it("contains all 8 platforms", () => {
    const ids = TARGETS.map((t) => t.id);
    const expected: TargetPlatform[] = [
      "claude-code", "cursor", "copilot",
      "codex", "opencode", "windsurf", "gemini", "junie",
    ];
    expect(ids).toEqual(expected);
  });

  it("every target has required fields", () => {
    for (const target of TARGETS) {
      expect(target.id).toBeTruthy();
      expect(target.label).toBeTruthy();
      expect(target.layout).toMatch(/^flat|nested$/);
      // mcpConfigFormat is null iff mcpConfigFile is null
      expect(target.mcpConfigFile === null).toBe(target.mcpConfigFormat === null);
    }
  });

  it("claude-code has null skillsDir (uses plugin install system)", () => {
    expect(getTarget("claude-code").skillsDir).toBeNull();
  });

  it("cursor uses nested layout", () => {
    expect(getTarget("cursor").layout).toBe("nested");
  });

  it("all other targets use flat layout", () => {
    const nonNested = TARGETS.filter((t) => t.id !== "cursor");
    for (const t of nonNested) {
      expect(t.layout, `${t.id} should be flat`).toBe("flat");
    }
  });

  it("codex has skillsReadDirect flag", () => {
    expect(getTarget("codex").skillsReadDirect).toBe(true);
  });

  it("windsurf has null mcpConfigFile (global-only)", () => {
    expect(getTarget("windsurf").mcpConfigFile).toBeNull();
    expect(getTarget("windsurf").mcpConfigFormat).toBeNull();
  });

  it("codex uses toml mcp format", () => {
    expect(getTarget("codex").mcpConfigFormat).toBe("toml");
  });

  it("getTarget throws for unknown id", () => {
    expect(() => getTarget("unknown" as TargetPlatform)).toThrow("Unknown target: unknown");
  });
});

describe("AGENTS_MD_TARGETS", () => {
  it("includes codex, opencode, windsurf, gemini, junie", () => {
    const expected: TargetPlatform[] = ["codex", "opencode", "windsurf", "gemini", "junie"];
    for (const id of expected) {
      expect(AGENTS_MD_TARGETS).toContain(id);
    }
  });

  it("does not include claude-code, cursor, or copilot", () => {
    expect(AGENTS_MD_TARGETS).not.toContain("claude-code");
    expect(AGENTS_MD_TARGETS).not.toContain("cursor");
    expect(AGENTS_MD_TARGETS).not.toContain("copilot");
  });
});
