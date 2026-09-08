import { describe, expect, it } from "vitest";
import { recommend } from "../src/observe/recommendations.js";
import { computeMachineInventory } from "../src/observe/machine-inventory.js";
import type { SurfaceObservation } from "../src/observe/observe-surface.js";
import type { HarnessConfig } from "../src/types.js";

/**
 * Recommendations (AC-10). Two deterministic sources and no third: this is
 * not an editorial catalog. The tests below pin what each source may and may
 * not propose, and the fact that the two never double-report the same thing.
 */

function observation(
  surface: SurfaceObservation["surface"],
  resources: Array<{ kind: "mcp-server" | "skill" | "plugin"; name: string; value: unknown }>,
  detected = true,
): SurfaceObservation {
  return {
    surface,
    detected,
    resources: resources.map((r) => ({
      surface,
      kind: r.kind,
      scope: "user" as const,
      name: r.name,
      value: r.value,
      provenance: { file: `/home/user/${surface}.json`, formatId: "json-mcpservers" as const },
    })),
    marketplaces: [],
    marketplacesReadable: false,
    skipped: [],
  };
}

const mcp = (command: string) => ({ transport: "stdio", command });

describe("machine-gap recommendations", () => {
  it("reports a resource one surface has and another reachably lacks", () => {
    const inventory = computeMachineInventory([
      observation("claude-code", [{ kind: "mcp-server", name: "postgres", value: mcp("pg") }]),
      observation("cursor", []),
    ]);
    const [only] = recommend(inventory);
    expect(only.source).toBe("machine-gap");
    expect(only.identityKey).toBe("mcp-server:postgres");
    expect(only.presentOn).toEqual(["claude-code"]);
    expect(only.missingOn).toEqual(["cursor"]);
  });

  it("never proposes what the grid itself calls unreachable", () => {
    // The engine's gap list already applies every reachability rule; reading
    // it rather than recomputing is what keeps the two from disagreeing.
    const inventory = computeMachineInventory([
      observation("claude-code", [{ kind: "mcp-server", name: "postgres", value: mcp("pg") }]),
      observation("pi", []), // pi has no MCP concept at all
    ]);
    expect(recommend(inventory)).toEqual([]);
  });

  it("says nothing when there is nothing to say", () => {
    const inventory = computeMachineInventory([
      observation("claude-code", [{ kind: "mcp-server", name: "postgres", value: mcp("pg") }]),
      observation("cursor", [{ kind: "mcp-server", name: "postgres", value: mcp("pg") }]),
    ]);
    expect(recommend(inventory)).toEqual([]);
  });
});

describe("baseline-gap recommendations", () => {
  const baseline: HarnessConfig = {
    version: "2.1",
    plugins: [{ name: "research", source: "github:acme/research" }],
    skills: [{ name: "reviewer" }, { name: "retired-thing", enabled: false }],
    "mcp-servers": { postgres: { transport: "stdio", command: "pg" } as never },
  };

  it("reports what the team declares and the machine has nowhere", () => {
    const inventory = computeMachineInventory([observation("claude-code", []), observation("cursor", [])]);
    const results = recommend(inventory, { baseline });
    expect(results.map((r) => r.identityKey).sort()).toEqual([
      "mcp-server:postgres",
      "plugin:research",
      "skill:reviewer",
    ]);
    expect(results.every((r) => r.source === "baseline-gap")).toBe(true);
  });

  it("does not recommend something the baseline explicitly disables", () => {
    // `enabled: false` is the team saying they do NOT want it. Recommending
    // it would invert the baseline's meaning.
    const inventory = computeMachineInventory([observation("claude-code", [])]);
    const keys = recommend(inventory, { baseline }).map((r) => r.identityKey);
    expect(keys).not.toContain("skill:retired-thing");
  });

  it("is satisfied by the resource existing ANYWHERE, not on every surface", () => {
    // A baseline says what a machine should have, not where. Having it on one
    // surface satisfies it; any remaining spread is a machine gap, reported
    // once by that source rather than twice by both.
    const inventory = computeMachineInventory([
      observation("claude-code", [{ kind: "mcp-server", name: "postgres", value: mcp("pg") }]),
      observation("cursor", []),
    ]);
    const results = recommend(inventory, { baseline });
    const postgres = results.filter((r) => r.identityKey === "mcp-server:postgres");
    expect(postgres).toHaveLength(1);
    expect(postgres[0].source).toBe("machine-gap");
  });

  it("matches a bare baseline plugin name against a machine's name@marketplace", () => {
    // A baseline should not have to pin the marketplace to be satisfied.
    const inventory = computeMachineInventory([
      observation("claude-code", [
        { kind: "plugin", name: "research@harness-kit", value: { marketplace: "harness-kit", name: "research", enabled: true } },
      ]),
    ]);
    const keys = recommend(inventory, { baseline }).map((r) => r.identityKey);
    expect(keys).not.toContain("plugin:research");
  });

  it("points a baseline gap at surfaces that could actually hold it", () => {
    const inventory = computeMachineInventory([
      observation("claude-code", []),
      observation("pi", []),
      observation("cursor", [], false), // present but not installed
    ]);
    const [research] = recommend(inventory, { baseline }).filter((r) => r.kind === "plugin");
    // pi has no plugin concept; cursor is undetected. Neither is a candidate.
    expect(research.missingOn).toEqual(["claude-code"]);
  });
});

describe("baseline recommendations respect marketplace reachability", () => {
  // The grid refuses to propose a plugin gap on a surface that has not
  // registered the marketplace. Without the same rule here, the two sources
  // contradict each other on one machine: the grid stays silent while the
  // baseline list happily suggests the target.
  const baseline: HarnessConfig = {
    version: "2.1",
    plugins: [{ name: "research@harness-kit", source: "github:acme/research" }],
  };

  function withMarketplaces(
    surface: "claude-code" | "codex",
    ids: string[],
    readable: boolean,
  ): SurfaceObservation {
    return {
      ...observation(surface, []),
      marketplacesReadable: readable,
      marketplaces: ids.map((id) => ({
        id,
        scope: "user" as const,
        provenance: { file: "/x", formatId: "json-claude-marketplaces" as const },
      })),
    };
  }

  it("omits a surface that has not registered the plugin's marketplace", () => {
    const inventory = computeMachineInventory([
      withMarketplaces("claude-code", ["harness-kit"], true),
      withMarketplaces("codex", ["something-else"], true),
    ]);
    const [research] = recommend(inventory, { baseline });
    expect(research.missingOn).toEqual(["claude-code"]);
  });

  it("keeps a surface whose marketplaces could not be read — cannot say is not no", () => {
    const inventory = computeMachineInventory([
      withMarketplaces("claude-code", ["harness-kit"], true),
      withMarketplaces("codex", [], false),
    ]);
    const [research] = recommend(inventory, { baseline });
    expect(research.missingOn).toEqual(["claude-code", "codex"]);
  });

  it("keeps every store-bearing surface when the baseline does not pin a marketplace", () => {
    const unqualified: HarnessConfig = {
      version: "2.1",
      plugins: [{ name: "research", source: "github:acme/research" }],
    };
    const inventory = computeMachineInventory([
      withMarketplaces("claude-code", ["harness-kit"], true),
      withMarketplaces("codex", ["something-else"], true),
    ]);
    const [research] = recommend(inventory, { baseline: unqualified });
    expect(research.missingOn).toEqual(["claude-code", "codex"]);
  });
});

describe("a malformed baseline degrades rather than crashing", () => {
  // `parseHarness` accepts shapes this engine did not expect. A map-shaped
  // `plugins:` — the form someone would most plausibly hand-write — threw
  // "object is not iterable" and took down the whole `status` command with a
  // message naming neither the file nor the field. The CLI's own try/catch
  // guarded parsing and then called recommend() outside it.
  const inventory = () => computeMachineInventory([observation("claude-code", [])]);

  it("survives plugins declared as a map", () => {
    const baseline = { version: "1", plugins: { research: { version: "1.0.0" } } } as never;
    expect(() => recommend(inventory(), { baseline })).not.toThrow();
    expect(recommend(inventory(), { baseline })).toEqual([]);
  });

  it("survives a null list entry", () => {
    const baseline = { version: "1", plugins: [null], skills: [null] } as never;
    expect(() => recommend(inventory(), { baseline })).not.toThrow();
  });

  it("survives mcp-servers declared as a list", () => {
    const baseline = { version: "1", "mcp-servers": ["postgres"] } as never;
    expect(() => recommend(inventory(), { baseline })).not.toThrow();
  });

  it("still reads the well-formed parts of a partly-malformed baseline", () => {
    const baseline = {
      version: "1",
      plugins: { bad: {} },
      skills: [{ name: "reviewer" }],
    } as never;
    expect(recommend(inventory(), { baseline }).map((r) => r.identityKey)).toEqual([
      "skill:reviewer",
    ]);
  });
});

describe("ordering is deterministic", () => {
  it("puts baseline gaps first, then machine gaps, each by identity", () => {
    const baseline: HarnessConfig = {
      version: "2.1",
      "mcp-servers": { zebra: { transport: "stdio", command: "z" } as never },
      skills: [{ name: "alpha" }],
    };
    const inventory = computeMachineInventory([
      observation("claude-code", [
        { kind: "mcp-server", name: "beta", value: mcp("b") },
        { kind: "mcp-server", name: "alpha", value: mcp("a") },
      ]),
      observation("cursor", []),
    ]);
    const results = recommend(inventory, { baseline });
    expect(results.map((r) => `${r.source}/${r.identityKey}`)).toEqual([
      "baseline-gap/mcp-server:zebra",
      "baseline-gap/skill:alpha",
      "machine-gap/mcp-server:alpha",
      "machine-gap/mcp-server:beta",
    ]);
  });

  it("returns nothing at all with no baseline and no gaps", () => {
    expect(recommend(computeMachineInventory([observation("claude-code", [])]))).toEqual([]);
  });
});
