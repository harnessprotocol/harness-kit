import { describe, expect, it } from "vitest";
import { SURFACES, getSurface, PRIORITY_SURFACES } from "../src/surfaces/registry.js";
import type { SurfaceId } from "../src/surfaces/types.js";

const ALL: SurfaceId[] = [
  "claude-code", "claude-desktop", "copilot-vscode", "copilot-cli",
  "codex", "cursor", "pi", "opencode", "windsurf", "gemini", "junie",
];

describe("surface registry", () => {
  it("declares exactly the 11 supported surfaces", () => {
    expect(SURFACES.map((s) => s.id).sort()).toEqual([...ALL].sort());
  });
  it("flags the 8 priority surfaces", () => {
    expect(PRIORITY_SURFACES).toHaveLength(8);
    expect(PRIORITY_SURFACES).not.toContain("windsurf");
  });
  it("every surface has a product family and at least one config store", () => {
    for (const s of SURFACES) {
      expect(s.family).toBeTruthy();
      expect(s.stores.length).toBeGreaterThan(0);
    }
  });
  it("pi marks mcp-server as not applicable", () => {
    expect(getSurface("pi").notApplicable).toContain("mcp-server");
  });
  it("codex merges the ChatGPT app, CLI, and IDE extension", () => {
    expect(getSurface("codex").mergedClients).toEqual([
      "chatgpt-desktop", "codex-cli", "codex-ide",
    ]);
  });
  it("copilot-vscode workspace MCP store uses the 'servers' root key", () => {
    const store = getSurface("copilot-vscode").stores.find(
      (st) => st.kind === "mcp-server" && st.scope === "project",
    );
    expect(store?.shape?.rootKey).toBe("servers");
  });
  it("getSurface throws on unknown id with the valid ids in the message", () => {
    expect(() => getSurface("windsurf-x" as SurfaceId)).toThrow(/claude-code/);
  });
});
