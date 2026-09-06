import type { FsProvider } from "../fs-provider.js";
import type { HarnessResourceKind } from "../portability/types.js";
import type {
  ConfigStore,
  DetectProbe,
  MarketplaceStore,
  StoreFormatId,
  SurfaceDescriptor,
  SurfaceId,
  SurfaceScope,
} from "../surfaces/types.js";
import { SURFACES } from "../surfaces/registry.js";
import { readMarketplaceStore, readStore } from "./read-store.js";
import type { MarketplaceEntry, SkippedEntry } from "./read-store.js";

/**
 * Descriptor-driven surface observation (design.md §3, Task 8): walk a
 * SurfaceDescriptor's detect probes and config stores, resolve each path
 * for the injected platform and scope roots, and read every store through
 * readStore into a flat list of raw ObservedResources.
 *
 * This layer is thin and lossless by design — no normalization, no digests,
 * no cross-scope dedup (two scopes may both define mcp "postgres"; both
 * appear). Task 9 normalizes/digests and Task 10 resolves precedence.
 *
 * Detection here is independent of the legacy compile-flow detection in
 * detect-platforms.ts; consolidating the two is a flagged post-M1 task.
 */

export interface ObserveOptions {
  /** Project root to resolve project-scope paths against; null = machine-only observation (no project context). */
  projectRoot: string | null;
  /** Home directory to resolve user-scope paths against. */
  homeRoot: string;
  /** Injected platform — core NEVER reads process.platform. */
  platform: "darwin" | "win32" | "linux";
}

/** One raw resource observed from a surface's config store. */
export interface ObservedResource {
  surface: SurfaceId;
  kind: HarnessResourceKind;
  scope: SurfaceScope;
  name: string;
  /** Untouched StoreEntry value — normalization is Task 9. */
  value: unknown;
  provenance: { file: string; formatId: StoreFormatId };
  /** Stamped from the store: inventory may be incomplete or ambiguous. */
  needsConfirmation?: true;
}

export interface SurfaceObservation {
  surface: SurfaceId;
  /** Any detect probe's resolved path exists (scope-aware, platform-resolved). */
  detected: boolean;
  resources: ObservedResource[];
  /**
   * Registered plugin marketplaces (AC-4). Empty both when a surface
   * registers none and when HarnessKit could not read them —
   * `marketplacesReadable` is what distinguishes the two.
   */
  marketplaces: MarketplaceEntry[];
  /**
   * Whether this observation actually READ the surface's marketplaces:
   * the descriptor declares at least one marketplace store AND every
   * declared store was read without a diagnostic. Deliberately not just
   * "the descriptor declares one" — a store that exists but is unreadable
   * (permission denied, unparseable) yields an empty list that would
   * otherwise be reported as "none registered", which is the absent/unknown
   * conflation AC-2 exists to prevent.
   */
  marketplacesReadable: boolean;
  /** Aggregated readStore diagnostics, file paths as returned. */
  skipped: SkippedEntry[];
}

/**
 * Resolve a store's or probe's path for the current platform and scope:
 * the platform override wins, else `path`; user scope joins against
 * homeRoot, project scope against projectRoot. Returns null when the item
 * is project-scoped and there is no project context — machine-only mode
 * simply has no project, so such stores/probes are skipped entirely.
 */
function resolveStorePath(
  fs: FsProvider,
  item: ConfigStore | DetectProbe | MarketplaceStore,
  opts: ObserveOptions,
): string | null {
  const relativePath = item.pathByPlatform?.[opts.platform] ?? item.path;
  if (item.scope === "user") return fs.joinPath(opts.homeRoot, relativePath);
  if (opts.projectRoot === null) return null;
  return fs.joinPath(opts.projectRoot, relativePath);
}

/**
 * Observe one surface: detection via its probes, resources via readStore
 * over each of its stores. Deterministic ordering: resources follow
 * descriptor-store order, then entry order from readStore. Degrades, never
 * throws — readStore reports problems via skipped[].
 */
export async function observeSurface(
  fs: FsProvider,
  descriptor: SurfaceDescriptor,
  opts: ObserveOptions,
): Promise<SurfaceObservation> {
  let detected = false;
  for (const probe of descriptor.detect) {
    const probePath = resolveStorePath(fs, probe, opts);
    if (probePath === null) continue;
    if (await fs.exists(probePath)) {
      detected = true;
      break;
    }
  }

  const resources: ObservedResource[] = [];
  const skipped: SkippedEntry[] = [];
  for (const store of descriptor.stores) {
    const storePath = resolveStorePath(fs, store, opts);
    if (storePath === null) continue;
    const result = await readStore(fs, store, storePath, {
      projectRoot: opts.projectRoot,
      homeRoot: opts.homeRoot,
    });
    for (const entry of result.entries) {
      resources.push({
        surface: descriptor.id,
        kind: entry.kind,
        // A format whose single file records both scopes stamps its own
        // (Claude Code's user-scoped installed_plugins.json holds project
        // installs); every other format takes the store's declared scope.
        scope: entry.scope ?? store.scope,
        name: entry.name,
        value: entry.value,
        provenance: entry.provenance,
        ...(store.needsConfirmation ? { needsConfirmation: true as const } : {}),
      });
    }
    skipped.push(...result.skipped);
  }

  const marketplaces: MarketplaceEntry[] = [];
  const declaredMarketplaceStores = descriptor.marketplaces ?? [];
  let marketplacesReadable = declaredMarketplaceStores.length > 0;
  for (const store of declaredMarketplaceStores) {
    const storePath = resolveStorePath(fs, store, opts);
    // A project-scope marketplace store with no project context is not a
    // failed read — there is simply no project to read one from.
    if (storePath === null) continue;
    const result = await readMarketplaceStore(fs, store, storePath, {
      projectRoot: opts.projectRoot,
      homeRoot: opts.homeRoot,
    });
    marketplaces.push(...result.entries);
    skipped.push(...result.skipped);
    if (result.skipped.length > 0) marketplacesReadable = false;
  }

  return {
    surface: descriptor.id,
    detected,
    resources,
    marketplaces,
    marketplacesReadable,
    skipped,
  };
}

/**
 * Observe every surface (defaults to the full registry), in registry order,
 * with unconditional per-surface isolation — one surface's diagnostics (or
 * even a thrown error, e.g. an FsProvider whose probes throw) never affect
 * another's observation. A throw degrades that surface to an undetected,
 * empty observation carrying the error as a skipped diagnostic.
 */
export async function observeAllSurfaces(
  fs: FsProvider,
  opts: ObserveOptions,
  surfaces: SurfaceDescriptor[] = SURFACES,
): Promise<SurfaceObservation[]> {
  const observations: SurfaceObservation[] = [];
  // Deliberately sequential: output order must be registry (input) order,
  // never completion order. If this is ever parallelized, use
  // Promise.all over the mapped array — its by-index results preserve
  // input order regardless of completion timing.
  for (const descriptor of surfaces) {
    try {
      observations.push(await observeSurface(fs, descriptor, opts));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      observations.push({
        surface: descriptor.id,
        detected: false,
        resources: [],
        marketplaces: [],
        // The surface could not be observed at all, so nothing was read.
        marketplacesReadable: false,
        skipped: [
          {
            file: "<observation>",
            reason: `surface '${descriptor.id}' could not be observed: ${message}`,
          },
        ],
      });
    }
  }
  return observations;
}
