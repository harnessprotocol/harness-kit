import { describe, expect, it } from "vitest";
import type { GridCell, GridRow, SurfaceId } from "@harness-kit/core";
import { MACHINE_FIXTURE_INVENTORY } from "../../__fixtures__/machine-fixture-data";
import {
  CELL_VARIANTS,
  LEGEND_VARIANTS,
  inventoryVariants,
  rowBaselineDigest,
  rowBaselineSource,
  rowCellVariants,
} from "../cell-state";

const inventory = MACHINE_FIXTURE_INVENTORY;
const surfaceOrder = inventory.surfaces.map((s) => s.id);

function fixtureRow(key: string): GridRow {
  const row = inventory.rows.find((r) => r.key === key);
  if (!row) throw new Error(`fixture row ${key} missing`);
  return row;
}

function variantsFor(key: string) {
  return rowCellVariants(fixtureRow(key), inventory.gaps, surfaceOrder);
}

function present(digest: string, scope: "user" | "project" = "user"): GridCell {
  return {
    status: "present",
    effectiveDigest: digest,
    entries: [{ scope, digest, provenance: { file: "f", formatId: "json-mcpservers" } }],
  };
}

function syntheticRow(cells: Partial<Record<SurfaceId, GridCell>>): GridRow {
  return { key: "mcp-server:x", kind: "mcp-server", name: "x", cells: cells as Record<SurfaceId, GridCell> };
}

describe("rowCellVariants on the fixture", () => {
  it("marks a present user-scope cell matching the baseline as present-user", () => {
    expect(variantsFor("mcp-server:github")["claude-code"]).toBe("present-user");
  });

  it("marks a present project-scope cell matching the baseline as present-project", () => {
    expect(variantsFor("mcp-server:github").cursor).toBe("present-project");
  });

  it("marks a present cell whose digest departs from the row's majority as differs", () => {
    expect(variantsFor("mcp-server:github").codex).toBe("differs");
  });

  it("marks absent cells listed in the row's gap as gap", () => {
    expect(variantsFor("mcp-server:github").gemini).toBe("gap");
    expect(variantsFor("skill:code-review").codex).toBe("gap");
    expect(variantsFor("skill:code-review").gemini).toBe("gap");
  });

  it("marks absent cells not in any gap as absent", () => {
    // copilot-cli is undetected, so the engine never lists it as closable.
    expect(variantsFor("mcp-server:github")["copilot-cli"]).toBe("absent");
    // instructions:claude.md has no gap entry at all.
    expect(variantsFor("instructions:claude.md").codex).toBe("absent");
    expect(variantsFor("instructions:claude.md").gemini).toBe("absent");
  });

  it("maps not-applicable, unmanaged and unknown to their own variants", () => {
    expect(variantsFor("plugin:board@harness-kit")["claude-desktop"]).toBe("none");
    expect(variantsFor("plugin:board@harness-kit").cursor).toBe("unmanaged");
    expect(variantsFor("mcp-server:github")["copilot-vscode"]).toBe("unknown");
  });

  it("returns exactly one variant per cell key", () => {
    const row = fixtureRow("mcp-server:github");
    expect(Object.keys(variantsFor(row.key)).sort()).toEqual(Object.keys(row.cells).sort());
  });

  it("gives the plugin row no differs when every present copy matches", () => {
    const variants = variantsFor("plugin:board@harness-kit");
    expect(variants["claude-code"]).toBe("present-user");
    expect(variants.codex).toBe("present-user");
    expect(Object.values(variants)).not.toContain("differs");
  });
});

describe("rowBaselineDigest / rowBaselineSource", () => {
  it("picks the most frequent present digest", () => {
    const row = fixtureRow("mcp-server:github");
    expect(rowBaselineDigest(row, surfaceOrder)).toBe("sha256:aa11bb22cc");
    expect(rowBaselineSource(row, surfaceOrder)).toBe("claude-code");
  });

  it("breaks a tie with the earliest surface in surfaceOrder", () => {
    const row = syntheticRow({ "claude-code": present("sha256:A"), codex: present("sha256:B") });
    expect(rowBaselineDigest(row, ["claude-code", "codex"])).toBe("sha256:A");
    expect(rowBaselineDigest(row, ["codex", "claude-code"])).toBe("sha256:B");
    const variants = rowCellVariants(row, [], ["claude-code", "codex"]);
    expect(variants["claude-code"]).toBe("present-user");
    expect(variants.codex).toBe("differs");
  });

  it("returns the first surface in order holding the baseline, skipping earlier non-baseline cells", () => {
    const row = syntheticRow({
      "claude-code": present("sha256:B"),
      codex: present("sha256:A"),
      cursor: present("sha256:A"),
    });
    const order: SurfaceId[] = ["claude-code", "codex", "cursor"];
    expect(rowBaselineDigest(row, order)).toBe("sha256:A");
    expect(rowBaselineSource(row, order)).toBe("codex");
  });

  it("yields undefined baseline and no differs when no cell is present", () => {
    const row = syntheticRow({
      "claude-code": { status: "absent", entries: [] },
      codex: { status: "unknown", entries: [] },
    });
    expect(rowBaselineDigest(row, surfaceOrder)).toBeUndefined();
    expect(rowBaselineSource(row, surfaceOrder)).toBeUndefined();
    expect(Object.values(rowCellVariants(row, [], surfaceOrder))).not.toContain("differs");
  });
});

describe("present-cell scope", () => {
  it("uses the winning entry's scope, not the first entry's", () => {
    const row = syntheticRow({
      "claude-code": {
        status: "present",
        effectiveDigest: "sha256:P",
        entries: [
          { scope: "user", digest: "sha256:U", provenance: { file: "u", formatId: "json-mcpservers" } },
          { scope: "project", digest: "sha256:P", provenance: { file: "p", formatId: "json-mcpservers" } },
        ],
      },
    });
    expect(rowCellVariants(row, [], ["claude-code"])["claude-code"]).toBe("present-project");
  });

  it("falls back to the first entry's scope when no entry matches the effective digest", () => {
    const row = syntheticRow({
      "claude-code": {
        status: "present",
        effectiveDigest: "sha256:Z",
        entries: [{ scope: "project", digest: "sha256:Y", provenance: { file: "p", formatId: "json-mcpservers" } }],
      },
    });
    expect(rowCellVariants(row, [], ["claude-code"])["claude-code"]).toBe("present-project");
  });
});

describe("CELL_VARIANTS table", () => {
  it("renders absent as an empty cell and keeps it out of the legend", () => {
    expect(CELL_VARIANTS.absent.chip).toBeNull();
    expect(LEGEND_VARIANTS).not.toContain("absent");
  });

  it("lists every other variant in the legend exactly once", () => {
    const others = (Object.keys(CELL_VARIANTS) as Array<keyof typeof CELL_VARIANTS>).filter((v) => v !== "absent");
    expect([...LEGEND_VARIANTS].sort()).toEqual(others.sort());
  });
});

describe("inventoryVariants", () => {
  it("returns one entry per row, each matching rowCellVariants", () => {
    const variants = inventoryVariants(inventory);
    expect([...variants.keys()]).toEqual(inventory.rows.map((row) => row.key));
    for (const row of inventory.rows) {
      expect(variants.get(row.key)).toEqual(rowCellVariants(row, inventory.gaps, surfaceOrder));
    }
  });
});
