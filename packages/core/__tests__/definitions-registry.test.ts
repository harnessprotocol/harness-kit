import { describe, expect, it } from "vitest";
import { resolveSurfaces, getSurfaceFrom } from "../src/surfaces/resolve.js";
import { SURFACES, getSurface } from "../src/surfaces/registry.js";
import { toBundle, fromBundle } from "../src/definitions/bundle.js";
import { buildMachineInventory } from "../src/observe/machine-inventory.js";
import { planCellAction } from "../src/write/plan-cell-action.js";
import { homeWriteScope, isWritableHomePath } from "../src/surfaces/write-scope.js";
import { planPluginAction } from "../src/plugins/broker.js";
import {
  buildCapabilityMatrix,
  getTargetCapability,
  assertCapabilityMatrixComplete,
  TARGET_CAPABILITY_MATRIX,
} from "../src/portability/capabilities.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import type { SurfaceDescriptor } from "../src/surfaces/types.js";

/**
 * AC-26: a definition update that changes a surface's config path must be
 * used on the NEXT INVENTORY, without an app update.
 *
 * PR #374 proved the bundle can be fetched and verified. It proved nothing
 * about the bundle reaching the engine — nothing called `loadDefinitions`, so
 * the path from "verified bytes" to "we read the new file" was untested in
 * both halves. These tests cover the second half: given a resolved registry,
 * does observation actually read where the bundle says?
 */

/**
 * MockFsProvider that records every path read.
 *
 * Subclassing the repo's own mock rather than hand-rolling one: a stub of my
 * own missed `joinPath`, every surface threw inside `resolveStorePath`,
 * `observeAllSurfaces`' per-surface isolation swallowed all eleven throws,
 * and the run completed with ZERO filesystem calls and no error. The control
 * case below exists because of that — it fails loudly if the fixture ever
 * stops exercising the path it claims to.
 */
class RecordingFs extends MockFsProvider {
  readonly reads: string[] = [];

  override async readFile(path: string): Promise<string> {
    this.reads.push(path);
    return super.readFile(path);
  }

  override async exists(path: string): Promise<boolean> {
    this.reads.push(path);
    return super.exists(path);
  }
}

/** The compiled-in claude-code user-scope instructions path. */
function instructionsPath(surfaces: readonly SurfaceDescriptor[]): string {
  const store = getSurfaceFrom(surfaces, "claude-code").stores.find(
    (entry) => entry.kind === "instructions" && entry.scope === "user",
  );
  if (store === undefined) throw new Error("fixture premise gone: no user instructions store");
  return store.path;
}

describe("resolveSurfaces", () => {
  it("returns the compiled-in registry when there is no bundle", () => {
    expect(resolveSurfaces()).toBe(SURFACES);
  });

  it("replaces a surface the bundle carries, and keeps the ones it omits", () => {
    const moved: SurfaceDescriptor = {
      ...getSurface("claude-code"),
      stores: getSurface("claude-code").stores.map((store) =>
        store.kind === "instructions" && store.scope === "user"
          ? { ...store, path: ".config/claude/AGENTS.md" }
          : store,
      ),
    };
    const resolved = resolveSurfaces(
      toBundle({ surfaces: [moved], capabilityMatrix: {}, bundleNumber: 2 }),
    );

    expect(instructionsPath(resolved)).toBe(".config/claude/AGENTS.md");
    // A one-surface bundle must not shrink the registry to one surface.
    expect(resolved).toHaveLength(SURFACES.length);
    // An omitted surface is untouched, still the very same object.
    expect(getSurfaceFrom(resolved, "codex")).toBe(getSurface("codex"));
  });

  it("keeps SURFACE_IDS order regardless of the order the bundle uses", () => {
    // A remote document must not be able to reorder the grid: observation
    // output order is registry order by contract.
    const reversed = [...SURFACES].reverse();
    const resolved = resolveSurfaces(
      toBundle({ surfaces: reversed, capabilityMatrix: {}, bundleNumber: 2 }),
    );
    expect(resolved.map((s) => s.id)).toEqual(SURFACES.map((s) => s.id));
  });

  it("does not mutate the compiled-in registry", () => {
    const before = JSON.stringify(SURFACES);
    const moved: SurfaceDescriptor = { ...getSurface("codex"), label: "REPLACED" };
    resolveSurfaces(toBundle({ surfaces: [moved], capabilityMatrix: {}, bundleNumber: 2 }));
    expect(JSON.stringify(SURFACES)).toBe(before);
    expect(getSurface("codex").label).not.toBe("REPLACED");
  });

  it("survives the JSON round-trip a real feed goes through", () => {
    // resolveSurfaces will be handed a bundle that came off the wire and
    // through `fromBundle`, not a hand-built object.
    const moved: SurfaceDescriptor = {
      ...getSurface("claude-code"),
      stores: getSurface("claude-code").stores.map((store) =>
        store.kind === "instructions" && store.scope === "user"
          ? { ...store, path: ".config/claude/AGENTS.md" }
          : store,
      ),
    };
    const wire = JSON.stringify(toBundle({ surfaces: [moved], capabilityMatrix: {}, bundleNumber: 3 }));
    const resolved = resolveSurfaces(fromBundle(JSON.parse(wire)));
    expect(instructionsPath(resolved)).toBe(".config/claude/AGENTS.md");
  });
});

describe("AC-26: a moved path is read on the next inventory", () => {
  const opts = { projectRoot: null, homeRoot: "/home/u", platform: "darwin" as const };

  it("reads the compiled-in path when no bundle is supplied", async () => {
    const fs = new RecordingFs({}, "/project", "/home/u");
    await buildMachineInventory(fs, opts);
    const compiled = instructionsPath(SURFACES);
    expect(fs.reads.some((path) => path.includes(compiled))).toBe(true);
  });

  it("reads the BUNDLE's path, and stops reading the old one", async () => {
    // The whole point of the feed: a product moves its config file and users
    // pick it up without a release.
    const moved: SurfaceDescriptor = {
      ...getSurface("claude-code"),
      stores: getSurface("claude-code").stores.map((store) =>
        store.kind === "instructions" && store.scope === "user"
          ? { ...store, path: ".config/claude/AGENTS.md" }
          : store,
      ),
    };
    const resolved = resolveSurfaces(
      toBundle({ surfaces: [moved], capabilityMatrix: {}, bundleNumber: 2 }),
    );

    const fs = new RecordingFs({}, "/project", "/home/u");
    await buildMachineInventory(fs, opts, resolved);

    expect(fs.reads.some((path) => path.includes(".config/claude/AGENTS.md"))).toBe(true);
    // Not merely "also reads the new one" — the old path must be abandoned,
    // otherwise a stale file keeps winning after the product moved.
    expect(fs.reads.some((path) => path.endsWith("/.claude/CLAUDE.md"))).toBe(false);
  });

  it("uses the same registry for the GRID as for the read", async () => {
    // Observation and the grid are two consumers of one registry. Threading
    // it to only one would let a bundle move a path for reading while the
    // grid still describes the compiled-in surface — a split that would not
    // show up in either half's own test.
    //
    // The first version of this test seeded an EMPTY filesystem, so no
    // instructions row existed, the assertion loop ran zero times and it
    // passed against a grid that ignored the registry entirely. Codex seeds
    // the row so there is something to assert about.
    const noInstructions: SurfaceDescriptor = {
      ...getSurface("claude-code"),
      stores: getSurface("claude-code").stores.filter((store) => store.kind !== "instructions"),
    };
    const resolved = resolveSurfaces(
      toBundle({ surfaces: [noInstructions], capabilityMatrix: {}, bundleNumber: 2 }),
    );
    const fs = new RecordingFs(
      { "/home/u/.codex/AGENTS.md": "# team instructions" },
      "/project",
      "/home/u",
    );

    const inventory = await buildMachineInventory(fs, opts, resolved);
    const instructionRows = inventory.rows.filter((row) => row.kind === "instructions");
    // Guard the premise: without a row the loop below asserts nothing.
    expect(instructionRows.length).toBeGreaterThan(0);
    for (const row of instructionRows) {
      // claude-code no longer declares an instructions store, so its cell is
      // a descriptor fact. Reading the COMPILED registry here would instead
      // say "absent" — an invitation to close a gap by writing to a store the
      // surface does not have.
      expect(row.cells["claude-code"].status, row.name).not.toBe("absent");
    }
  });

  it("drops a bundle surface whose id this build does not know", () => {
    // `fromBundle` rejects unknown ids, so this is only reachable when a
    // bundle is constructed in-process. Honouring it would inject a surface
    // the rest of the engine has no types for.
    const alien = { ...getSurface("codex"), id: "not-a-surface" } as unknown as SurfaceDescriptor;
    const resolved = resolveSurfaces(
      toBundle({ surfaces: [alien], capabilityMatrix: {}, bundleNumber: 2 }),
    );
    expect(resolved.map((entry) => entry.id)).toEqual(SURFACES.map((entry) => entry.id));
    expect(resolved).toBe(SURFACES);
  });
});

describe("AC-26: the capability matrix follows the bundle", () => {
  // The matrix decides whether a write is OFFERED, and `plan-cell-action`
  // asks it what a target loses (AC-34). A matrix derived from the
  // compiled-in registry while observation reads a bundle's registry would
  // report losses about stores the surface no longer has.

  it("turns a kind unsupported once the bundle drops its only store", () => {
    // copilot-cli, not claude-code: only the three NON-legacy surfaces derive
    // their cells from the registry. See the legacy-surface test below.
    expect(getTargetCapability("copilot-cli", "instructions").operations.capture).not.toBe(
      "unsupported",
    );

    const noInstructions: SurfaceDescriptor = {
      ...getSurface("copilot-cli"),
      stores: getSurface("copilot-cli").stores.filter((store) => store.kind !== "instructions"),
    };
    const resolved = resolveSurfaces(
      toBundle({ surfaces: [noInstructions], capabilityMatrix: {}, bundleNumber: 2 }),
    );

    const cell = getTargetCapability("copilot-cli", "instructions", buildCapabilityMatrix(resolved));
    expect(cell.operations.capture).toBe("unsupported");
    expect(cell.note).toContain("no local store");
  });

  it("does NOT change a legacy compile surface, which is a real AC-26 limit", () => {
    // The 8 compile surfaces (claude-code, cursor, copilot-vscode, codex,
    // opencode, windsurf, gemini, junie) keep their pre-re-key cells verbatim
    // so compile/capture/apply stays byte-identical. A consequence nobody has
    // written down until now: a definitions update CANNOT change capabilities
    // for those 8 — it can move where they are READ, but not what the engine
    // believes they support. Pinned here so the limit is a decision on the
    // record rather than a surprise the first time a bundle tries it.
    const stripped: SurfaceDescriptor = { ...getSurface("claude-code"), stores: [] };
    const resolved = resolveSurfaces(
      toBundle({ surfaces: [stripped], capabilityMatrix: {}, bundleNumber: 2 }),
    );

    const cell = getTargetCapability("claude-code", "instructions", buildCapabilityMatrix(resolved));
    expect(cell.operations.capture).toBe(
      getTargetCapability("claude-code", "instructions").operations.capture,
    );
  });

  it("leaves the compiled-in matrix untouched", () => {
    const dropped: SurfaceDescriptor = { ...getSurface("copilot-cli"), stores: [] };
    buildCapabilityMatrix(
      resolveSurfaces(toBundle({ surfaces: [dropped], capabilityMatrix: {}, bundleNumber: 2 })),
    );
    expect(getTargetCapability("copilot-cli", "instructions").operations.capture).not.toBe(
      "unsupported",
    );
  });

  it("stays exhaustive for a bundle-resolved registry", () => {
    const moved: SurfaceDescriptor = {
      ...getSurface("copilot-cli"),
      stores: getSurface("copilot-cli").stores.filter((store) => store.kind !== "mcp-server"),
    };
    const resolved = resolveSurfaces(
      toBundle({ surfaces: [moved], capabilityMatrix: {}, bundleNumber: 2 }),
    );
    const matrix = buildCapabilityMatrix(resolved);
    expect(matrix).toHaveLength(TARGET_CAPABILITY_MATRIX.length);
    expect(() => assertCapabilityMatrixComplete(matrix, resolved)).not.toThrow();
  });
});

describe("AC-26: the reader and the writer must agree", () => {
  // The defect this block exists for: the resolved registry reached
  // observation and NOTHING else. Every file was internally consistent; the
  // disagreement lived at the seam. `sync` showed a moved file as present and
  // then refused it with "nothing to copy", and the moved path was outside
  // the write allowlist, so the tool could see a config file it could never
  // write.
  const opts = { projectRoot: null, homeRoot: "/home/u", platform: "darwin" as const };
  const MOVED = ".claude/moved-mcp.json";

  function movedRegistry() {
    const moved: SurfaceDescriptor = {
      ...getSurface("claude-code"),
      stores: getSurface("claude-code").stores.map((store) =>
        store.kind === "mcp-server" && store.scope === "user"
          ? { ...store, path: MOVED }
          : store,
      ),
    };
    return resolveSurfaces(
      toBundle({ surfaces: [moved], capabilityMatrix: {}, bundleNumber: 2 }),
    );
  }

  it("plans an action for the row the inventory reported present", async () => {
    const registry = movedRegistry();
    const server = JSON.stringify({ mcpServers: { demo: { command: "demo" } } });
    // The file exists ONLY at the bundle's path.
    const fs = new RecordingFs({ [`/home/u/${MOVED}`]: server }, "/project", "/home/u");

    const inventory = await buildMachineInventory(fs, opts, registry);
    const row = inventory.rows.find((entry) => entry.kind === "mcp-server" && entry.name === "demo");
    expect(row, "premise: the inventory must see the moved file").toBeDefined();
    expect(row!.cells["claude-code"].status).toBe("present");

    const plan = await planCellAction(
      new RecordingFs({ [`/home/u/${MOVED}`]: server }, "/project", "/home/u"),
      { kind: "mcp-server", name: "demo", from: "claude-code", to: "codex", scope: "user" },
      opts,
      registry,
    );
    // Passing the compiled-in registry here returns
    // "'demo' (mcp-server) is absent on claude-code — nothing to copy."
    expect(plan.reason ?? "").not.toContain("nothing to copy");
  });

  it("writes to the TARGET path the bundle moved, not the compiled-in one", async () => {
    // The source side and the target side are separate lookups. A mutation
    // that reverted only the TARGET lookup to the compiled-in table survived
    // the first version of this block, because the fixture only ever moved
    // the SOURCE surface's store.
    const TARGET_MOVED = ".codex/moved-config.toml";
    const base = getSurface("codex");
    const targetStore = base.stores.find((x) => x.kind === "mcp-server" && x.scope === "user");
    if (targetStore === undefined) throw new Error("premise gone: codex has no user mcp store");
    const movedTarget: SurfaceDescriptor = {
      ...base,
      stores: base.stores.map((store) =>
        store === targetStore ? { ...store, path: TARGET_MOVED } : store,
      ),
    };
    const registry = resolveSurfaces(
      toBundle({ surfaces: [movedTarget], capabilityMatrix: {}, bundleNumber: 2 }),
    );

    const server = JSON.stringify({ mcpServers: { demo: { command: "demo" } } });
    const plan = await planCellAction(
      new RecordingFs({ "/home/u/.claude.json": server }, "/project", "/home/u"),
      { kind: "mcp-server", name: "demo", from: "claude-code", to: "codex", scope: "user" },
      opts,
      registry,
    );

    expect(plan.supported, plan.reason).toBe(true);
    // Every planned write lands at the bundle's path, never the compiled-in one.
    expect(plan.changes.length).toBeGreaterThan(0);
    for (const change of plan.changes) {
      expect(change.path).toContain(TARGET_MOVED);
      expect(change.path).not.toContain(targetStore.path);
    }
  });

  it("puts the bundle's path INSIDE the write allowlist", () => {
    const registry = movedRegistry();
    const scope = homeWriteScope("darwin", registry);
    expect(isWritableHomePath(MOVED, scope)).toBe(true);
    // And the path the bundle replaced is no longer writable, so the
    // allowlist tracks the registry rather than accumulating.
    expect(isWritableHomePath(".claude.json", scope)).toBe(false);
    // The compiled-in allowlist is the mirror image, proving the argument
    // is what decides it.
    const compiled = homeWriteScope("darwin");
    expect(isWritableHomePath(MOVED, compiled)).toBe(false);
    expect(isWritableHomePath(".claude.json", compiled)).toBe(true);
  });

  it("runs the installer the bundle names, not the compiled-in one", () => {
    const base = getSurface("claude-code");
    if (base.pluginInstall === undefined) throw new Error("premise gone: no pluginInstall");
    const swapped: SurfaceDescriptor = {
      ...base,
      pluginInstall: { ...base.pluginInstall, binary: "swapped-installer" },
    };
    const registry = resolveSurfaces(
      toBundle({ surfaces: [swapped], capabilityMatrix: {}, bundleNumber: 2 }),
    );

    const planned = planPluginAction(
      { surface: "claude-code", action: "install", identity: "demo@acme", scope: "user" },
      registry,
    );
    expect(JSON.stringify(planned)).toContain("swapped-installer");
    // The compiled-in default still runs the real binary.
    const compiled = planPluginAction({
      surface: "claude-code",
      action: "install",
      identity: "demo@acme",
      scope: "user",
    });
    expect(JSON.stringify(compiled)).not.toContain("swapped-installer");
  });
});
