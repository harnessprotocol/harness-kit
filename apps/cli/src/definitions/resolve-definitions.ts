import { PUBLISHER_KEYS, loadDefinitions, releaseSnapshot, resolveSurfaces } from "@harness-kit/core";
// The Node-only drivers live behind the `node` entry point: core imports no
// crypto or network driver, because a bare `node:crypto` in a webview-reachable
// module already shipped four broken routes in a packaged build.
import { NodeFetcher, NodeSignatureVerifier } from "@harness-kit/core/node";
import type { CachedDefinitions, StateStore, SurfaceDescriptor } from "@harness-kit/core";

/** Where the published feed lives (design.md §7). */
const DEFAULT_FEED_URL = "https://harnesskit.ai/definitions/v1";

/** Opt out for offline or air-gapped runs. */
const DISABLE_ENV = "HARNESS_NO_DEFINITIONS_FETCH";
/** Point a test or a staging build at another feed. */
const URL_ENV = "HARNESS_DEFINITIONS_URL";

export interface ResolvedDefinitions {
  /** The registry to observe and render with. */
  surfaces: SurfaceDescriptor[];
  /** Where the definitions came from, for `--verbose` and diagnostics. */
  source: "remote" | "cache" | "snapshot";
  /** Why it is not "remote". Present whenever `source` is not "remote". */
  reason?: string;
}

/**
 * Resolve the surface registry for one CLI run (AC-25, AC-26).
 *
 * The whole feed hangs off this one function: fetch, verify, re-verify the
 * cache, fall back to the snapshot, then hand back a registry the caller
 * threads into `buildMachineInventory`.
 *
 * WHAT THIS DOES TODAY. `PUBLISHER_KEYS` is empty, because no publisher
 * keypair exists and key custody is unsettled. Verification against an empty
 * key list fails for every artifact, so every run currently ends on the
 * snapshot — which is byte-identical to the compiled-in registry, so
 * behaviour is exactly what it was before this existed. That is the intended
 * safe state, not a bug: the plumbing is exercised end to end while trusting
 * nothing, and adding a real key to `PUBLISHER_KEYS` turns it on with no
 * other change.
 *
 * NEVER THROWS, and never lets a definitions problem take down the command
 * the user actually ran. A broken feed, a corrupt cache or an unwritable
 * database all degrade to the compiled-in registry.
 */
export async function resolveDefinitions(
  store: StateStore | undefined,
  now: string = new Date().toISOString(),
): Promise<ResolvedDefinitions> {
  const snapshotOnly = (reason: string): ResolvedDefinitions => ({
    surfaces: resolveSurfaces(),
    source: "snapshot",
    reason,
  });

  if (process.env[DISABLE_ENV]) {
    return snapshotOnly(`${DISABLE_ENV} is set; using the definitions that shipped with this release`);
  }

  // No keys means no bundle can ever verify, so fetching is pure cost: two
  // requests and up to a 10s timeout on every single command, for a result
  // that is guaranteed to be the snapshot. Skipping is not an optimisation
  // that changes behaviour — the outcome is identical — it just declines to
  // pay for it. Measured before adding this: `resolveDefinitions` issued 2
  // requests to harnesskit.ai per invocation, which also made the CLI test
  // suite depend on the network.
  if (PUBLISHER_KEYS.length === 0) {
    return snapshotOnly(
      "this build has no publisher key, so remote definitions cannot be verified; using the definitions that shipped with this release",
    );
  }

  try {
    // Reading state is best-effort: a missing or locked database means we
    // fetch without a cache and without a floor, not that we refuse to run.
    let cached: CachedDefinitions | null = null;
    let floor: number | null = null;
    if (store) {
      cached = await store.getCachedDefinitions().catch(() => null);
      floor = await store.getHighestBundleNumber().catch(() => null);
    }

    const loaded = await loadDefinitions({
      fetcher: new NodeFetcher(),
      verifier: new NodeSignatureVerifier(),
      baseUrl: process.env[URL_ENV] ?? DEFAULT_FEED_URL,
      publisherKeys: PUBLISHER_KEYS,
      snapshot: releaseSnapshot(),
      ...(cached ? { cached: { bytes: cached.payload, signature: cached.signature } } : {}),
      ...(floor === null ? {} : { highestSeenBundleNumber: floor }),
      now,
    });

    // Persist only what came off the wire and verified. A cache hit is
    // already in the cache, and the snapshot is not a fetch result.
    if (loaded.source === "remote" && loaded.artifact && store) {
      // Order matters. Raise the floor BEFORE storing the payload: if the
      // process dies between the two, a raised floor with a stale cache is
      // safe — the old cache simply fails anti-rollback and we re-fetch —
      // whereas a stored payload with an unraised floor leaves the rollback
      // defence behind the data it is meant to be defending.
      //
      // Both are best-effort. A read-only or locked database must cost a
      // cache, never the command the user actually ran.
      await store.recordBundleNumber(loaded.bundle.bundleNumber, now).catch(() => undefined);
      await store
        .putCachedDefinitions({
          bundleNumber: loaded.bundle.bundleNumber,
          fetchedAt: now,
          // The exact bytes that verified, NOT a re-serialization of the
          // parsed bundle: the signature covers a byte sequence, and
          // JSON.stringify is free to differ from it in key order and
          // whitespace, which would make the cache fail its own
          // re-verification on the next run.
          payload: loaded.artifact.bytes,
          signature: loaded.artifact.signature,
        })
        .catch(() => undefined);
    }

    return {
      surfaces: resolveSurfaces(loaded.bundle),
      source: loaded.source,
      ...(loaded.reason === undefined ? {} : { reason: loaded.reason }),
    };
  } catch (error) {
    // `loadDefinitions` documents that it never throws on anything the
    // outside world can cause, but this wrapper also touches the state
    // database and the environment. A definitions failure must never be the
    // reason `harness-kit diff` does not run.
    const message = error instanceof Error ? error.message : String(error);
    return snapshotOnly(`the definitions feed could not be resolved (${message})`);
  }
}
