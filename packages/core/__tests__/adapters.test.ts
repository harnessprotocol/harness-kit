import { describe, it, expect } from "vitest";
import {
  ADAPTERS,
  getAdapter,
  getAllAdapters,
  adapterIdForTarget,
  groupTargetsByAdapter,
} from "../src/adapters/registry.js";
import { claudeCodeAdapter } from "../src/adapters/claude-code/index.js";
import { cursorAdapter } from "../src/adapters/cursor/index.js";
import { copilotAdapter } from "../src/adapters/copilot/index.js";
import { agentsMdAdapter } from "../src/adapters/agents-md/index.js";
import { domainHasContent } from "../src/adapters/domain-content.js";
import { domainSkippedWarning } from "../src/adapters/adapter.js";
import { compile } from "../src/compile/compile.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import type { HarnessConfig } from "../src/types.js";

describe("adapter registry", () => {
  it("registers exactly the four adapters with real exportConfig this WP", () => {
    const ids = ADAPTERS.map((a) => a.id).sort();
    expect(ids).toEqual(["agents-md", "claude-code", "copilot", "cursor"]);
  });

  it("getAdapter resolves each registered id", () => {
    expect(getAdapter("claude-code")).toBe(claudeCodeAdapter);
    expect(getAdapter("cursor")).toBe(cursorAdapter);
    expect(getAdapter("copilot")).toBe(copilotAdapter);
    expect(getAdapter("agents-md")).toBe(agentsMdAdapter);
  });

  it("getAdapter throws for an unregistered id (pi has no adapter yet)", () => {
    expect(() => getAdapter("pi")).toThrow("Unknown adapter: pi");
  });

  it("getAllAdapters returns the same list as ADAPTERS", () => {
    expect(getAllAdapters()).toBe(ADAPTERS);
  });

  it("maps every legacy TargetPlatform to an adapter", () => {
    expect(adapterIdForTarget("claude-code")).toBe("claude-code");
    expect(adapterIdForTarget("cursor")).toBe("cursor");
    expect(adapterIdForTarget("copilot")).toBe("copilot");
    expect(adapterIdForTarget("codex")).toBe("agents-md");
    expect(adapterIdForTarget("opencode")).toBe("agents-md");
    expect(adapterIdForTarget("windsurf")).toBe("agents-md");
    expect(adapterIdForTarget("gemini")).toBe("agents-md");
    expect(adapterIdForTarget("junie")).toBe("agents-md");
  });

  it("groups a mixed target list by adapter, preserving first-seen order", () => {
    const groups = groupTargetsByAdapter(["cursor", "codex", "claude-code", "gemini"]);
    expect(groups.map((g) => g.adapter.id)).toEqual(["cursor", "agents-md", "claude-code"]);
    expect(groups.find((g) => g.adapter.id === "agents-md")!.legacyTargets).toEqual([
      "codex",
      "gemini",
    ]);
  });
});

describe("adapter capabilities are honestly declared", () => {
  it("claude-code: full instructions/mcp/permissions, none for skills/subagents/hooks/model", () => {
    expect(claudeCodeAdapter.capabilities.export).toEqual({
      instructions: "full",
      skills: "none",
      subagents: "none",
      mcp: "full",
      permissions: "full",
      hooks: "none",
      model: "none",
    });
  });

  it("cursor and copilot: full instructions/skills/mcp, partial permissions (not machine-enforced)", () => {
    for (const adapter of [cursorAdapter, copilotAdapter]) {
      expect(adapter.capabilities.export.instructions).toBe("full");
      expect(adapter.capabilities.export.skills).toBe("full");
      expect(adapter.capabilities.export.mcp).toBe("full");
      expect(adapter.capabilities.export.permissions).toBe("partial");
      expect(adapter.capabilities.export.subagents).toBe("none");
      expect(adapter.capabilities.export.hooks).toBe("none");
      expect(adapter.capabilities.export.model).toBe("none");
    }
  });

  it("agents-md: instructions/skills full, mcp/permissions partial (varies per tool in the family)", () => {
    expect(agentsMdAdapter.capabilities.export.instructions).toBe("full");
    expect(agentsMdAdapter.capabilities.export.skills).toBe("full");
    expect(agentsMdAdapter.capabilities.export.mcp).toBe("partial");
    expect(agentsMdAdapter.capabilities.export.permissions).toBe("partial");
  });

  it("no adapter aspirationally claims import support this WP (all 'none')", () => {
    for (const adapter of ADAPTERS) {
      for (const support of Object.values(adapter.capabilities.import)) {
        expect(support).toBe("none");
      }
    }
  });

  it("no adapter claims diff support this WP", () => {
    for (const adapter of ADAPTERS) {
      expect(adapter.capabilities.diff).toBe(false);
    }
  });

  it("importConfig/diff are not implemented (stubs only)", () => {
    for (const adapter of ADAPTERS) {
      expect(adapter.importConfig).toBeUndefined();
      expect(adapter.diff).toBeUndefined();
    }
  });
});

describe("domainHasContent", () => {
  const base: HarnessConfig = { version: "1" };

  it("detects instructions content", () => {
    expect(domainHasContent(base, "instructions")).toBe(false);
    expect(
      domainHasContent({ ...base, instructions: { operational: "hi" } }, "instructions"),
    ).toBe(true);
  });

  it("detects skills (plugins) content", () => {
    expect(domainHasContent(base, "skills")).toBe(false);
    expect(
      domainHasContent({ ...base, plugins: [{ name: "x", source: "y" }] }, "skills"),
    ).toBe(true);
  });

  it("detects mcp content", () => {
    expect(domainHasContent(base, "mcp")).toBe(false);
    expect(
      domainHasContent(
        { ...base, "mcp-servers": { x: { transport: "stdio", command: "y" } } },
        "mcp",
      ),
    ).toBe(true);
  });

  it("detects permissions content", () => {
    expect(domainHasContent(base, "permissions")).toBe(false);
    expect(
      domainHasContent({ ...base, permissions: { tools: { allow: ["Read"] } } }, "permissions"),
    ).toBe(true);
  });

  it("subagents/hooks/model always report no content (no HarnessConfig field yet)", () => {
    expect(domainHasContent(base, "subagents")).toBe(false);
    expect(domainHasContent(base, "hooks")).toBe(false);
    expect(domainHasContent(base, "model")).toBe(false);
  });
});

describe("domainSkippedWarning", () => {
  it("formats a structured, adapter/domain-attributed message", () => {
    const msg = domainSkippedWarning("claude-code", "skills", "detail text");
    expect(msg).toContain("[claude-code]");
    expect(msg).toContain("'skills'");
    expect(msg).toContain('"none"');
    expect(msg).toContain("detail text");
  });
});

describe("compile() emits domain-skip warnings without throwing", () => {
  it("warns when claude-code is asked to compile with plugins present (skills export = none)", async () => {
    const fs = new MockFsProvider();
    const yaml = `
version: "1"
metadata:
  name: test
  description: test harness
plugins:
  - name: foo
    source: bar/baz
`;
    const result = await compile(yaml, ["claude-code"], fs, { dryRun: true });
    expect(
      result.warnings.some(
        (w) => w.includes("[claude-code]") && w.includes("'skills'") && w.includes('"none"'),
      ),
    ).toBe(true);
    // Must continue, not throw — files for other domains still present or empty, no exception.
    expect(result.harnessName).toBe("test");
  });

  it("does not warn for a domain an adapter fully exports", async () => {
    const fs = new MockFsProvider();
    const yaml = `
version: "1"
metadata:
  name: test
  description: test harness
instructions:
  operational: "hello"
`;
    const result = await compile(yaml, ["claude-code"], fs, { dryRun: true });
    expect(result.warnings.some((w) => w.includes("'instructions'"))).toBe(false);
  });
});
