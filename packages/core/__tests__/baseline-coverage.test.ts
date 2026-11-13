import { describe, expect, it } from "vitest";
import { baselineCoverage, recommend } from "../src/observe/recommendations.js";
import { computeMachineInventory } from "../src/observe/machine-inventory.js";
import type { SurfaceObservation } from "../src/observe/observe-surface.js";
import type { HarnessConfig } from "../src/types.js";

/**
 * Team baseline column (UX AC-26): every resource the project's committed
 * harness.yaml declares, joined to the Machine grid's rows. It shares
 * recommend()'s matching, so the column and `harness-kit status --baseline`
 * cannot disagree about what the machine already has.
 */

function observation(
  surface: SurfaceObservation["surface"],
  resources: Array<{ kind: "mcp-server" | "skill" | "plugin"; name: string; value: unknown }>,
): SurfaceObservation {
  return {
    surface,
    detected: true,
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

const baseline: HarnessConfig = {
  version: "2.1",
  plugins: [{ name: "research", source: "github:acme/research" }],
  skills: [{ name: "reviewer" }, { name: "retired-thing", enabled: false }],
  "mcp-servers": {
    postgres: { transport: "stdio", command: "pg" },
    Linear: { transport: "stdio", command: "linear" },
  },
};

describe("baseline coverage (UX AC-26)", () => {
  it("marks a declared resource the machine has as present and joins it to its row", () => {
    const inventory = computeMachineInventory([
      observation("claude-code", [{ kind: "mcp-server", name: "postgres", value: mcp("pg") }]),
      observation("cursor", []),
    ]);
    const entry = baselineCoverage(inventory, baseline).find((e) => e.identityKey === "mcp-server:postgres")!;
    expect(entry.status).toBe("present");
    expect(entry.rowKeys).toEqual(["mcp-server:postgres"]);
  });

  it("marks a declared resource the machine has nowhere as missing, with no row and its candidate surfaces", () => {
    const inventory = computeMachineInventory([observation("claude-code", []), observation("cursor", [])]);
    const entry = baselineCoverage(inventory, baseline).find((e) => e.identityKey === "skill:reviewer")!;
    expect(entry.status).toBe("missing");
    expect(entry.rowKeys).toEqual([]);
    expect(entry.missingOn.length).toBeGreaterThan(0);
  });

  it("joins a bare plugin name to the machine's marketplace-qualified row", () => {
    const inventory = computeMachineInventory([
      observation("claude-code", [{ kind: "plugin", name: "research@harness-kit", value: {} }]),
    ]);
    const entry = baselineCoverage(inventory, baseline).find((e) => e.kind === "plugin")!;
    expect(entry.status).toBe("present");
    expect(entry.rowKeys).toEqual(["plugin:research@harness-kit"]);
  });

  it("matches names case-insensitively and keeps the baseline's spelling for display", () => {
    const inventory = computeMachineInventory([
      observation("claude-code", [{ kind: "mcp-server", name: "linear", value: mcp("linear") }]),
    ]);
    const entry = baselineCoverage(inventory, baseline).find((e) => e.identityKey === "mcp-server:linear")!;
    expect(entry.name).toBe("Linear");
    expect(entry.status).toBe("present");
  });

  it("leaves out a skill the baseline turns off", () => {
    const inventory = computeMachineInventory([observation("claude-code", [])]);
    expect(baselineCoverage(inventory, baseline).map((e) => e.identityKey)).not.toContain("skill:retired-thing");
  });

  it("agrees with recommend(): its missing entries are exactly the baseline gaps", () => {
    const inventory = computeMachineInventory([
      observation("claude-code", [
        { kind: "mcp-server", name: "postgres", value: mcp("pg") },
        { kind: "plugin", name: "research@harness-kit", value: {} },
      ]),
      observation("cursor", []),
    ]);
    const missing = baselineCoverage(inventory, baseline)
      .filter((e) => e.status === "missing")
      .map((e) => e.identityKey)
      .sort();
    const gaps = recommend(inventory, { baseline })
      .filter((r) => r.source === "baseline-gap")
      .map((r) => r.identityKey)
      .sort();
    expect(missing.length).toBeGreaterThan(0);
    expect(missing).toEqual(gaps);
  });

  it("never throws on a malformed baseline", () => {
    const inventory = computeMachineInventory([observation("claude-code", [])]);
    const odd = { version: "1", plugins: { research: {} } } as unknown as HarnessConfig;
    expect(baselineCoverage(inventory, odd)).toEqual([]);
  });
});
