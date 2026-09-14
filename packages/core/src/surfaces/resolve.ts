import { SURFACES } from "./registry.js";
import { SURFACE_IDS } from "./types.js";
import type { SurfaceDescriptor, SurfaceId } from "./types.js";
import type { DefinitionsBundle } from "../definitions/bundle.js";

/**
 * Resolve the surface registry in force for one run (AC-26).
 *
 * `SURFACES` is the registry compiled into this binary. A verified
 * definitions bundle may carry replacement descriptors, which is the whole
 * point of the feed: when a product moves its config file, the new path
 * reaches users on the next inventory rather than the next release.
 *
 * WHY THIS IS A VALUE AND NOT A MUTATED GLOBAL. The obvious shortcut is an
 * `applyDefinitions()` that overwrites the `SURFACES` array at startup, and
 * every existing consumer then needs no change at all. It is the wrong trade:
 * anything that reads the registry BEFORE that call silently gets the stale
 * table, and nothing in the type system or the tests would show it. This repo
 * has already shipped that exact failure twice — a `?drift=1` read in a
 * `useState` initializer that was correct on a cold load and wrong on
 * navigation, and a bundler rewrite that was invisible from source. A
 * resolved registry passed as an argument cannot be read too early, and a
 * test does not have to reset global state between cases.
 *
 * MERGE RULE: a bundle may carry a SUBSET of surfaces (`bundle.ts` says so).
 * A bundle entry replaces the compiled-in entry for the same id WHOLESALE —
 * it is not a field-level patch, because a partial descriptor merged over a
 * complete one produces a shape neither side ever validated. Ids the bundle
 * omits keep their compiled-in descriptor, and ids the bundle carries that
 * this build does not know are dropped: `fromBundle` already rejects unknown
 * surface ids, so reaching that case means the bundle was constructed
 * in-process rather than parsed, and honouring it would let a caller inject a
 * surface the rest of the engine has no types for.
 *
 * Order is always `SURFACE_IDS` order, never bundle order. Observation output
 * order is registry order by contract (`observeAllSurfaces`), and a remote
 * document must not be able to reorder the grid.
 */
export function resolveSurfaces(bundle?: DefinitionsBundle): SurfaceDescriptor[] {
  if (bundle === undefined) return SURFACES;
  const overrides = new Map<SurfaceId, SurfaceDescriptor>();
  for (const surface of bundle.surfaces) {
    // Last one wins on a duplicated id, matching object-literal semantics.
    if (SURFACE_IDS.includes(surface.id)) overrides.set(surface.id, surface);
  }
  if (overrides.size === 0) return SURFACES;
  return SURFACES.map((compiled) => overrides.get(compiled.id) ?? compiled);
}

/**
 * Look up one surface in a resolved registry.
 *
 * Mirrors `getSurface` from the registry module, but reads the registry it is
 * given rather than the compiled-in constant. Callers that hold a resolved
 * registry MUST use this: calling the module-level `getSurface` from a code
 * path that was handed a registry silently ignores the bundle, which is the
 * bug this whole module exists to make impossible.
 */
export function getSurfaceFrom(
  surfaces: readonly SurfaceDescriptor[],
  id: SurfaceId,
): SurfaceDescriptor {
  const surface = surfaces.find((entry) => entry.id === id);
  if (!surface) {
    const valid = surfaces.map((entry) => entry.id).join(", ");
    throw new Error(`Unknown surface: ${id}. Valid surface ids: ${valid}`);
  }
  return surface;
}
