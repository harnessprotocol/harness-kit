import { describe, it, expect } from "vitest";
import { compilePermissions, buildPermissionsText } from "../src/compile/permissions.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import type { HarnessConfig } from "../src/types.js";

function makeConfig(permissions: HarnessConfig["permissions"]): HarnessConfig {
  return {
    version: "1",
    metadata: { name: "test", description: "test" },
    permissions,
  };
}

describe("compilePermissions", () => {
  it("creates .claude/settings.json for Claude Code", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig({
      tools: {
        allow: ["Read", "Write"],
        deny: ["mcp__postgres__drop_table"],
      },
      paths: {
        writable: ["sql/", "migrations/"],
      },
    });

    const { files } = await compilePermissions(config, ["claude-code"], fs);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".claude/settings.json");

    const parsed = JSON.parse(files[0].content);
    expect(parsed.permissions.allow).toEqual(["Read", "Write"]);
    expect(parsed.permissions.deny).toEqual(["mcp__postgres__drop_table"]);
    // Only writable paths become additionalDirectories (readonly would gain unintended write access)
    expect(parsed.permissions.additionalDirectories).toEqual(["sql/", "migrations/"]);
  });

  it("merges with existing settings.json", async () => {
    const existing = JSON.stringify({
      existingKey: "preserved",
      permissions: { allow: ["Bash"] },
    });

    const fs = new MockFsProvider({
      "/project/.claude/settings.json": existing,
    });

    const config = makeConfig({
      tools: { allow: ["Read"] },
    });

    const { files } = await compilePermissions(config, ["claude-code"], fs);
    const parsed = JSON.parse(files[0].content);
    expect(parsed.existingKey).toBe("preserved");
    expect(parsed.permissions.allow).toEqual(["Read"]);
  });

  it("warns about deny not being enforceable for non-Claude-Code", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig({
      tools: {
        allow: ["Read"],
        deny: ["mcp__postgres__drop_table"],
      },
    });

    const { warnings } = await compilePermissions(config, ["cursor"], fs);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("not machine-enforceable");
    expect(warnings[0]).toContain("cursor");
  });
});

describe("buildPermissionsText", () => {
  it("generates human-readable permissions", () => {
    const text = buildPermissionsText({
      tools: {
        allow: ["Read", "Write", "Bash"],
        deny: ["mcp__*__drop_*"],
      },
    });

    expect(text).toContain("## Tool Permissions");
    expect(text).toContain("Read, Write, Bash");
    expect(text).toContain("mcp__*__drop_*");
  });

  it("returns null when no tools defined", () => {
    const text = buildPermissionsText({});
    expect(text).toBeNull();
  });
});
