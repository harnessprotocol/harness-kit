import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  computeMachineInventory,
  buildMachineInventory,
} from "../src/observe/machine-inventory.js";
import type { MachineInventory } from "../src/observe/machine-inventory.js";
import type {
  ObserveOptions,
  ObservedResource,
  SurfaceObservation,
} from "../src/observe/observe-surface.js";
import type { SurfaceId, SurfaceScope } from "../src/surfaces/types.js";
import { SURFACE_IDS } from "../src/surfaces/types.js";
import { loadFixtureProject } from "./helpers/load-fixture-tree.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "..", "fixtures", "observe");
const HOME = "/home/user";
const PROJECT = "/project";
const OPTS: ObserveOptions = { projectRoot: PROJECT, homeRoot: HOME, platform: "darwin" };

/** Same machine simulation as observe-surface.test.ts: home/ at $HOME, project/ at /project. */
function machineFs(): MockFsProvider {
  const home = loadFixtureProject(resolve(FIXTURES_DIR, "machine", "home"), HOME, HOME);
  const project = loadFixtureProject(resolve(FIXTURES_DIR, "machine", "project"), PROJECT, HOME);
  return new MockFsProvider(
    { ...home.getAllFiles(), ...project.getAllFiles() },
    PROJECT,
    HOME,
  );
}

async function machineInventory(): Promise<MachineInventory> {
  return buildMachineInventory(machineFs(), OPTS);
}

/** Hand-build one observation for unit-precision compute tests. */
function obs(
  surface: SurfaceId,
  resources: Array<{
    kind?: ObservedResource["kind"];
    scope?: SurfaceScope;
    name: string;
    value: unknown;
    file?: string;
  }>,
  detected = true,
): SurfaceObservation {
  return {
    surface,
    detected,
    resources: resources.map((r) => ({
      surface,
      kind: r.kind ?? "mcp-server",
      scope: r.scope ?? "user",
      name: r.name,
      value: r.value,
      provenance: { file: r.file ?? `${HOME}/${surface}.json`, formatId: "json-mcpservers" },
    })),
    marketplaces: [],
    skipped: [],
  };
}

function row(inventory: MachineInventory, key: string) {
  const found = inventory.rows.find((r) => r.key === key);
  expect(found, `row ${key} should exist`).toBeDefined();
  return found!;
}

// Surfaces detected in the machine fixture tree.
const FIXTURE_DETECTED: SurfaceId[] = ["claude-code", "copilot-cli", "codex", "cursor", "pi"];

describe("buildMachineInventory: surface summary (integration)", () => {
  it("lists all 11 surfaces in registry order with correct detected flags", async () => {
    const inventory = await machineInventory();

    expect(inventory.surfaces.map((s) => s.id)).toEqual([...SURFACE_IDS]);
    for (const surface of inventory.surfaces) {
      expect(surface.detected).toBe(FIXTURE_DETECTED.includes(surface.id));
      expect(surface.skipped).toEqual([]);
    }

    const claudeCode = inventory.surfaces.find((s) => s.id === "claude-code")!;
    expect(claudeCode.resourceCount).toBe(7); // 3 mcp + 2 skills + 2 instructions
    const claudeDesktop = inventory.surfaces.find((s) => s.id === "claude-desktop")!;
    expect(claudeDesktop.resourceCount).toBe(0);
  });
});

describe("gaps (AC-9)", () => {
  it("github present on claude-code only → missing on detected kind-supporting surfaces, never on pi or undetected surfaces", async () => {
    const inventory = await machineInventory();

    const gap = inventory.gaps.find((g) => g.row === "mcp-server:github")!;
    expect(gap).toBeDefined();
    expect(gap.presentOn).toEqual(["claude-code"]);
    // Detected + has an mcp-server store + absent: copilot-cli, codex, cursor.
    expect(gap.missingOn).toEqual(["copilot-cli", "codex", "cursor"]);

    // pi has no MCP concept: not-applicable, never a gap target.
    expect(gap.missingOn).not.toContain("pi");
    expect(row(inventory, "mcp-server:github").cells.pi.status).toBe("not-applicable");
    // Undetected surfaces (claude-desktop, opencode, gemini, junie, …) are
    // never gaps — installing a tool is not a config gap.
    for (const id of SURFACE_IDS.filter((s) => !FIXTURE_DETECTED.includes(s))) {
      expect(gap.missingOn).not.toContain(id);
    }
  });

  it("a detected surface WITHOUT a store for the kind is never in missingOn (windsurf mcp: unmanaged locally, not a gap)", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ name: "gh", value: { command: "npx", args: ["gh-mcp"] } }]),
      // Cursor: detected, kind-supporting, absent → the row's one real gap target.
      obs("cursor", [], true),
      // Windsurf: detected, mcp-server NOT in notApplicable, but zero mcp
      // stores in its descriptor — the concept exists, the config is just
      // not locally managed, so there is nothing the user could add here.
      obs("windsurf", [], true),
    ]);

    const cell = row(inventory, "mcp-server:gh").cells.windsurf;
    // "unmanaged", not "absent": windsurf HAS an MCP concept but declares no
    // locally managed MCP store, so this is nowhere to copy into rather than
    // a surface that could hold it and doesn't.
    expect(cell.status).toBe("unmanaged");

    const gap = inventory.gaps.find((g) => g.row === "mcp-server:gh")!;
    expect(gap).toBeDefined();
    expect(gap.missingOn).toEqual(["cursor"]);
    expect(gap.missingOn).not.toContain("windsurf");
  });

  it("unknown cells appear in neither presentOn nor missingOn", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ name: "gh", value: { command: "npx", args: ["gh-mcp"] } }]),
      obs("copilot-vscode", [], true), // detected, zero mcp entries, needsConfirmation user store
    ]);

    expect(row(inventory, "mcp-server:gh").cells["copilot-vscode"].status).toBe("unknown");
    const gap = inventory.gaps.find((g) => g.row === "mcp-server:gh");
    // copilot-vscode is unknown, so no surface qualifies for missingOn → no gap emitted.
    expect(gap).toBeUndefined();
  });
});

describe("diffs (AC-8)", () => {
  it("differing canonicalForms produce structured FieldDeltas (env change + arg added)", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [
        { name: "svc", value: { command: "npx", args: ["run", "serve"], env: { PORT: "3000" } } },
      ]),
      obs("cursor", [
        {
          name: "svc",
          value: { command: "npx", args: ["run", "serve", "--verbose"], env: { PORT: "4000" } },
        },
      ]),
    ]);

    expect(inventory.diffs).toHaveLength(1);
    const diff = inventory.diffs[0];
    expect(diff.row).toBe("mcp-server:svc");
    expect(diff.surfaces).toEqual(["claude-code", "cursor"]);
    expect(diff.delta).toEqual([
      { path: "args[2]", kind: "added", right: "--verbose" },
      { path: "env.PORT", kind: "changed", left: "3000", right: "4000" },
    ]);
  });

  it("secret rotation is NOT a diff: differing token values digest to the same placeholder form", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [
        { name: "gh", value: { command: "npx", args: ["gh"], env: { GITHUB_TOKEN: "old-secret-aaa" } } },
      ]),
      obs("cursor", [
        { name: "gh", value: { command: "npx", args: ["gh"], env: { GITHUB_TOKEN: "new-secret-bbb" } } },
      ]),
    ]);

    const cells = row(inventory, "mcp-server:gh").cells;
    // End-to-end honesty: sanitized canonicalForms are identical, so the
    // digests match and no diff (or false "in sync" break) is reported.
    expect(cells["claude-code"].effectiveDigest).toBe(cells.cursor.effectiveDigest);
    expect(inventory.diffs).toEqual([]);
  });

  it("root-level primitive canonicalForms diff at path '$'", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ kind: "env", name: "MODE", value: "fast" }]),
      obs("cursor", [{ kind: "env", name: "MODE", value: "slow" }]),
    ]);
    expect(inventory.diffs).toEqual([
      {
        row: "env:mode",
        surfaces: ["claude-code", "cursor"],
        delta: [{ path: "$", kind: "changed", left: "fast", right: "slow" }],
      },
    ]);
  });

  it("array-vs-object type mismatch collapses to a single 'changed' leaf at that node", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ kind: "env", name: "cfg", value: { a: { x: 1 } } }]),
      obs("cursor", [{ kind: "env", name: "cfg", value: { a: [1] } }]),
    ]);
    expect(inventory.diffs).toHaveLength(1);
    expect(inventory.diffs[0].delta).toEqual([
      { path: "a", kind: "changed", left: { x: 1 }, right: [1] },
    ]);
  });

  it("shorter right-hand array yields 'removed' deltas at the trailing indices", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ name: "svc", value: { command: "npx", args: ["a", "b", "c"] } }]),
      obs("cursor", [{ name: "svc", value: { command: "npx", args: ["a"] } }]),
    ]);
    expect(inventory.diffs).toHaveLength(1);
    expect(inventory.diffs[0].delta).toEqual([
      { path: "args[1]", kind: "removed", left: "b" },
      { path: "args[2]", kind: "removed", left: "c" },
    ]);
  });

  it("nested-object changes report the full dotted display path", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ kind: "env", name: "cfg", value: { a: { b: { c: 1 } } } }]),
      obs("cursor", [{ kind: "env", name: "cfg", value: { a: { b: { c: 2 } } } }]),
    ]);
    expect(inventory.diffs).toHaveLength(1);
    expect(inventory.diffs[0].delta).toEqual([
      { path: "a.b.c", kind: "changed", left: 1, right: 2 },
    ]);
  });

  it("only present-cell pairs with differing effectiveDigests are compared", async () => {
    const inventory = await machineInventory();
    for (const diff of inventory.diffs) {
      const cells = row(inventory, diff.row).cells;
      const [a, b] = diff.surfaces;
      expect(cells[a].status).toBe("present");
      expect(cells[b].status).toBe("present");
      expect(cells[a].effectiveDigest).not.toBe(cells[b].effectiveDigest);
    }
  });
});

describe("cell precedence", () => {
  it("project scope beats user scope for effectiveDigest; both entries retained", async () => {
    const inventory = await machineInventory();

    // Fixture: cursor defines postgres at BOTH scopes (home_db vs project_db).
    const cell = row(inventory, "mcp-server:postgres").cells.cursor;
    expect(cell.status).toBe("present");
    expect(cell.entries).toHaveLength(2);
    expect(cell.entries.map((e) => e.scope).sort()).toEqual(["project", "user"]);

    const projectEntry = cell.entries.find((e) => e.scope === "project")!;
    const userEntry = cell.entries.find((e) => e.scope === "user")!;
    expect(projectEntry.provenance.file).toBe(`${PROJECT}/.cursor/mcp.json`);
    // User store comes FIRST in cursor's descriptor, yet project still wins.
    expect(cell.entries[0].scope).toBe("user");
    expect(cell.effectiveDigest).toBe(projectEntry.digest);
    expect(cell.effectiveDigest).not.toBe(userEntry.digest);
  });

  it("within a scope, descriptor-store order wins a colliding identity (first store's entry)", () => {
    // Cursor user scope reads .cursor/skills before .agents/skills; a skill
    // named "helper" in both collides on identityKey — first store wins.
    const inventory = computeMachineInventory([
      {
        surface: "cursor",
        detected: true,
        resources: [
          {
            surface: "cursor",
            kind: "skill",
            scope: "user",
            name: "helper",
            value: { name: "helper", content: "# from .cursor/skills" },
            provenance: { file: `${HOME}/.cursor/skills/helper/SKILL.md`, formatId: "skills-dir" },
          },
          {
            surface: "cursor",
            kind: "skill",
            scope: "user",
            name: "helper",
            value: { name: "helper", content: "# from .agents/skills" },
            provenance: { file: `${HOME}/.agents/skills/helper/SKILL.md`, formatId: "skills-dir" },
          },
        ],
        marketplaces: [],
        skipped: [],
      },
    ]);

    const cell = row(inventory, "skill:helper").cells.cursor;
    expect(cell.entries).toHaveLength(2);
    expect(cell.effectiveDigest).toBe(cell.entries[0].digest);
    expect(cell.entries[0].provenance.file).toBe(`${HOME}/.cursor/skills/helper/SKILL.md`);
    expect(cell.entries[0].digest).not.toBe(cell.entries[1].digest);
  });
});

describe("unknown cells", () => {
  it("detected copilot-vscode with zero mcp entries → unknown (needsConfirmation user store)", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ name: "gh", value: { command: "npx" } }]),
      obs("copilot-vscode", [], true),
    ]);
    expect(row(inventory, "mcp-server:gh").cells["copilot-vscode"].status).toBe("unknown");
  });

  it("the same surface UNdetected → absent (no installation, nothing hidden to confirm)", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ name: "gh", value: { command: "npx" } }]),
      obs("copilot-vscode", [], false),
    ]);
    const cell = row(inventory, "mcp-server:gh").cells["copilot-vscode"];
    expect(cell.status).toBe("absent");
    // ...and undetected means it is still not a gap target.
    const gap = inventory.gaps.find((g) => g.row === "mcp-server:gh");
    expect(gap).toBeUndefined();
  });
});

describe("determinism and serialization", () => {
  it("rows are sorted lexicographically by identityKey (kind-alpha then name-alpha) — pinned", async () => {
    const inventory = await machineInventory();
    const keys = inventory.rows.map((r) => r.key);
    expect(keys).toEqual([...keys].sort());
    expect(keys.length).toBeGreaterThan(0);
    // kind prefix ordering falls out of the lexicographic key sort.
    const kinds = inventory.rows.map((r) => r.kind);
    expect(kinds).toEqual([...kinds].sort());
  });

  it("output is JSON-round-trip stable (pure serializable data, no options echo)", async () => {
    const inventory = await machineInventory();
    expect(JSON.parse(JSON.stringify(inventory))).toEqual(inventory);
    expect("options" in inventory).toBe(false);
  });
});

describe("row display name", () => {
  it("case-differing names join on one row; first-observed casing wins the display name", () => {
    const inventory = computeMachineInventory([
      obs("claude-code", [{ name: "MyServer", value: { command: "npx" } }]),
      obs("cursor", [{ name: "myserver", value: { command: "npx" } }]),
    ]);
    expect(inventory.rows).toHaveLength(1);
    const only = inventory.rows[0];
    expect(only.key).toBe("mcp-server:myserver");
    expect(only.name).toBe("MyServer");
    expect(only.cells["claude-code"].status).toBe("present");
    expect(only.cells.cursor.status).toBe("present");
  });
});

describe("instructions rows (file-based identity)", () => {
  it("CLAUDE.md (claude-code) and AGENTS.md (codex) land in SEPARATE rows even with identical content", () => {
    // Instruction identity is file-based (Task 9): different filenames mean
    // different identityKeys, so same-content files across surfaces are
    // separate rows. Content-level cross-file instruction comparison
    // (matching CLAUDE.md against AGENTS.md) is post-M1.
    const content = { content: "Shared house rules." };
    const inventory = computeMachineInventory([
      obs("claude-code", [
        { kind: "instructions", name: "CLAUDE.md", value: content, file: `${HOME}/.claude/CLAUDE.md` },
      ]),
      obs("codex", [
        { kind: "instructions", name: "AGENTS.md", value: content, file: `${HOME}/.codex/AGENTS.md` },
      ]),
    ]);

    const claudeRow = row(inventory, "instructions:claude.md");
    const agentsRow = row(inventory, "instructions:agents.md");
    expect(claudeRow.name).toBe("CLAUDE.md");
    expect(agentsRow.name).toBe("AGENTS.md");
    expect(claudeRow.cells["claude-code"].status).toBe("present");
    expect(claudeRow.cells.codex.status).toBe("absent");
    expect(agentsRow.cells.codex.status).toBe("present");
    // Separate rows ⇒ no diff is computed between the two files.
    expect(inventory.diffs).toEqual([]);
  });
});
