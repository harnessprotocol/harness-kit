import { describe, expect, it } from "vitest";
import { detectPlatforms } from "../src/detect/detect-platforms.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

describe("detectPlatforms", () => {
  it("detects Claude Code from CLAUDE.md", async () => {
    const fs = new MockFsProvider({
      "/project/CLAUDE.md": "# Claude instructions",
    });
    const result = await detectPlatforms(fs);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("claude-code");
    expect(result[0].indicators).toContain("CLAUDE.md");
    expect(result[0].needsConfirmation).toBe(false);
  });

  it("detects Cursor from .cursor directory", async () => {
    const fs = new MockFsProvider({
      "/project/.cursor/rules/test.mdc": "rule",
    });
    const result = await detectPlatforms(fs);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("cursor");
  });

  it("detects Copilot from copilot-instructions.md", async () => {
    const fs = new MockFsProvider({
      "/project/.github/copilot-instructions.md": "instructions",
    });
    const result = await detectPlatforms(fs);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("copilot");
    expect(result[0].needsConfirmation).toBe(false);
  });

  it("flags .github as ambiguous for Copilot", async () => {
    const fs = new MockFsProvider({
      "/project/.github/workflows/ci.yml": "name: CI",
    });
    const result = await detectPlatforms(fs);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("copilot");
    expect(result[0].needsConfirmation).toBe(true);
  });

  it("detects multiple platforms", async () => {
    const fs = new MockFsProvider({
      "/project/CLAUDE.md": "# Claude",
      "/project/.cursor/rules/test.mdc": "rule",
      "/project/.vscode/mcp.json": "{}",
    });
    const result = await detectPlatforms(fs);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const platforms = result.map((r) => r.platform);
    expect(platforms).toContain("claude-code");
    expect(platforms).toContain("cursor");
  });

  it("returns empty array when nothing detected", async () => {
    const fs = new MockFsProvider({});
    const result = await detectPlatforms(fs);
    expect(result).toHaveLength(0);
  });
});
