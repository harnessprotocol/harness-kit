import { describe, expect, it } from "vitest";
import { resolveSurfaces, getSurfaceFrom } from "../src/surfaces/resolve.js";
import { SURFACES, getSurface } from "../src/surfaces/registry.js";
import { toBundle, fromBundle } from "../src/definitions/bundle.js";
import { buildMachineInventory } from "../src/observe/machine-inventory.js";
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
