import { describe, expect, it } from "vitest";
import { SURFACES, getSurface, PRIORITY_SURFACES } from "../src/surfaces/registry.js";
import { SURFACE_IDS } from "../src/surfaces/types.js";
import type { StoreFormatId, SurfaceId } from "../src/surfaces/types.js";
import type { HarnessResourceKind } from "../src/portability/types.js";

describe("surface registry", () => {
  it("declares exactly the supported surfaces, in SURFACE_IDS order", () => {
    expect(SURFACES.map((s) => s.id)).toEqual([...SURFACE_IDS]);
  });
  it("flags exactly the 8 priority surfaces", () => {
    expect([...PRIORITY_SURFACES].sort()).toEqual([
      "claude-code",
      "claude-desktop",
      "codex",
      "copilot-cli",
      "copilot-vscode",
      "cursor",
      "opencode",
      "pi",
    ]);
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

  it("every store pairs its resource kind with an allowed format", () => {
    const ALLOWED: Partial<Record<HarnessResourceKind, StoreFormatId[]>> = {
      skill: ["skills-dir"],
      instructions: ["markdown-instructions"],
      "mcp-server": ["json-mcpservers", "toml-codex", "json-opencode"],
      permissions: ["json-generic"],
      plugin: ["json-claude-plugins", "toml-codex-plugins"],
    };
    for (const s of SURFACES) {
      for (const store of s.stores) {
        expect(
          ALLOWED[store.kind],
          `${s.id}: no formats allowed for kind ${store.kind}`,
        ).toBeDefined();
        expect(
          ALLOWED[store.kind],
          `${s.id} ${store.path}: kind ${store.kind} disallows format ${store.formatId}`,
        ).toContain(store.formatId);
      }
    }
  });

  it("store and detect paths are all relative (no leading / or ~)", () => {
    for (const s of SURFACES) {
      const paths = [
        ...s.stores.flatMap((st) => [st.path, ...Object.values(st.pathByPlatform ?? {})]),
        ...s.detect.flatMap((d) => [d.path, ...Object.values(d.pathByPlatform ?? {})]),
      ];
      for (const p of paths) {
        expect(p, `${s.id}: absolute or home-anchored path ${p}`).not.toMatch(/^[/~]/);
      }
    }
  });

  it("notApplicable kinds never overlap a surface's store kinds", () => {
    for (const s of SURFACES) {
      const storeKinds = new Set(s.stores.map((st) => st.kind));
      for (const kind of s.notApplicable) {
        expect(
          storeKinds.has(kind),
          `${s.id}: ${kind} is both notApplicable and stored`,
        ).toBe(false);
      }
    }
  });
});
