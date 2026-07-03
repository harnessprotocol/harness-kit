import { describe, it, expect } from "vitest";
import type { ImportProjectResult } from "@harness-kit/core";
import { buildSprawlReveal } from "../onboarding-data";
import {
  ONBOARDING_FIXTURE_RESULT,
  ONBOARDING_FIXTURE_LOW_COUNT,
} from "../../__fixtures__/onboarding-fixture-data";

const EMPTY_RESULT: ImportProjectResult = {
  harnessYaml: 'version: "1"\nmetadata:\n  name: imported\n  description: ""\n',
  harnessConfig: { version: "1", metadata: { name: "imported", description: "" } },
  findings: {
    adapters: [
      { adapter: "claude-code", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "cursor", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "copilot", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "opencode", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "pi", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "agents-md", detected: false, found: [], skipped: [], warnings: [] },
    ],
  },
  provenance: { entries: [], conflicts: [] },
};

describe("buildSprawlReveal", () => {
  it("computes honest counts from a multi-harness sprawl scenario", () => {
    const reveal = buildSprawlReveal(ONBOARDING_FIXTURE_RESULT);

    expect(reveal.stats.harnessesFound).toBe(3); // claude-code, cursor, copilot
    // .claude/CLAUDE.md, .claude/mcp.json, .claude/settings.json, .cursor/rules/repo.mdc,
    // .cursor/mcp.json, .github/copilot-instructions.md — 6 distinct files.
    expect(reveal.stats.configFiles).toBe(6);
    expect(reveal.stats.overlappingInstructionSets).toBe(1); // "operational" seen from claude-code + cursor
    expect(reveal.stats.directConflicts).toBe(2); // mcp-servers.github, permissions.tools
    expect(reveal.isLowHarnessCount).toBe(false);
  });

  it("produces one source chip per detected adapter with file/conflict counts", () => {
    const reveal = buildSprawlReveal(ONBOARDING_FIXTURE_RESULT);
    const byAdapter = Object.fromEntries(reveal.convergence.sources.map((s) => [s.adapter, s]));

    expect(Object.keys(byAdapter).sort()).toEqual(["claude-code", "copilot", "cursor"]);
    expect(byAdapter["claude-code"].fileCount).toBe(3);
    expect(byAdapter["claude-code"].conflictCount).toBe(2);
    expect(byAdapter["cursor"].conflictCount).toBe(1);
    expect(byAdapter["copilot"].conflictCount).toBe(1);
  });

  it("describes conflicts concretely without fabricating detail", () => {
    const reveal = buildSprawlReveal(ONBOARDING_FIXTURE_RESULT);
    expect(reveal.conflicts).toHaveLength(2);
    expect(reveal.conflicts[0].description).toMatch(/mcp server 'github'/i);
    expect(reveal.conflicts[0].adapters).toEqual(["claude-code", "cursor"]);
    expect(reveal.conflicts[1].description).toMatch(/allowed.*denied/i);
  });

  it("reads real mcp-server/plugin counts from the synthesized config, never fabricated", () => {
    const reveal = buildSprawlReveal(ONBOARDING_FIXTURE_RESULT);
    expect(reveal.convergence.destination.mcpServerCount).toBe(2);
    expect(reveal.convergence.destination.pluginCount).toBe(0); // synthesize() never populates plugins today — honest zero
    expect(reveal.convergence.destination.skillCount).toBe(0);
  });

  it("marks a single-harness scan as low-count with no fabricated sprawl", () => {
    const reveal = buildSprawlReveal(ONBOARDING_FIXTURE_LOW_COUNT);
    expect(reveal.isLowHarnessCount).toBe(true);
    expect(reveal.stats.harnessesFound).toBe(1);
    expect(reveal.stats.directConflicts).toBe(0);
    expect(reveal.conflicts).toHaveLength(0);
    expect(reveal.convergence.sources).toHaveLength(1);
  });

  it("handles the zero-harness case gracefully — no divide-by-zero, no fake numbers", () => {
    const reveal = buildSprawlReveal(EMPTY_RESULT);
    expect(reveal.isLowHarnessCount).toBe(true);
    expect(reveal.stats.harnessesFound).toBe(0);
    expect(reveal.stats.configFiles).toBe(0);
    expect(reveal.stats.overlappingInstructionSets).toBe(0);
    expect(reveal.stats.directConflicts).toBe(0);
    expect(reveal.convergence.sources).toHaveLength(0);
    expect(reveal.conflicts).toHaveLength(0);
  });
});
