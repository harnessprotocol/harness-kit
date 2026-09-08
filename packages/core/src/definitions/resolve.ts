import { loadDefinitions } from "./feed.js";
import { releaseSnapshot } from "./publisher-keys.js";
import { resolveSurfaces } from "../surfaces/resolve.js";
import type { PublisherKey } from "./feed.js";
import type { Fetcher, SignatureVerifier } from "./providers.js";
import type { SurfaceDescriptor } from "../surfaces/types.js";

/** One cached definitions bundle: the verified bytes and their signature. */
export interface CachedDefinitions {
  bundleNumber: number;
  fetchedAt: string;
  /** The exact bytes the signature covers. */
  payload: Uint8Array;
  /** Detached Ed25519 signature over `payload`. */
  signature: Uint8Array;
}

/**
 * The slice of machine state the feed needs.
 *
 * Narrower than `StateStore` on purpose: the desktop reaches its database
 * through Tauri commands rather than the full store interface, and asking it
 * to implement observations and the rollback ledger just to cache a bundle
 * would be absurd.
 */
export interface DefinitionsStore {
  getCachedDefinitions(): Promise<CachedDefinitions | null>;
  putCachedDefinitions(entry: CachedDefinitions): Promise<void>;
  getHighestBundleNumber(): Promise<number | null>;
  recordBundleNumber(bundleNumber: number, at: string): Promise<void>;
}

export interface ResolveDefinitionsOptions {
  fetcher: Fetcher;
  verifier: SignatureVerifier;
  /** Keys compiled into this release. An empty list disables fetching. */
  publisherKeys: readonly PublisherKey[];
  baseUrl: string;
  now: string;
  store?: DefinitionsStore;
  /**
   * How long a cached bundle stays fresh. Past it, a fetch is attempted; the
   * cache is still the fallback when that fetch fails.
   */
  ttlMs?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface ResolvedDefinitions {
  /** The registry to observe and render with. */
  surfaces: SurfaceDescriptor[];
  source: "remote" | "cache" | "snapshot";
  /** Why the source is not "remote". Present whenever it is not. */
  reason?: string;
}

/** Default freshness window: one fetch a day, not one per command. */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve the surface registry in force (AC-25, AC-26) — shared by every
 * platform.
 *
 * Lives in core rather than in the CLI because the desktop needs the same
 * sequence (fetch, verify, re-verify the cache, raise the floor, fall back)
 * and only the DRIVERS differ: the CLI verifies with `node:crypto`, the
 * desktop with a Rust command, and both use the same `HttpsFetcher`. Two
 * copies of this sequence would be two places for the anti-rollback ordering
 * to drift.
 *
 * NEVER THROWS. A broken feed, a corrupt cache, an unwritable database or a
 * provider that rejects all degrade to the compiled-in registry, because a
 * definitions problem must never be the reason the command the user actually
 * ran does not run.
 */
export async function resolveDefinitions(
  options: ResolveDefinitionsOptions,
): Promise<ResolvedDefinitions> {
  const snapshotOnly = (reason: string): ResolvedDefinitions => ({
    surfaces: resolveSurfaces(),
    source: "snapshot",
    reason,
  });

  // No keys means nothing can ever verify, so a fetch is pure cost: two
  // requests and a timeout per call for a guaranteed snapshot. This is not an
  // optimisation that changes behaviour — the outcome is identical — it just
  // declines to pay for it. Measured before it existed: every CLI command
  // issued 2 real requests, which also made the test suite need the network.
  if (options.publisherKeys.length === 0) {
    return snapshotOnly(
      "this build has no publisher key, so remote definitions cannot be verified; using the definitions that shipped with this release",
    );
  }

  try {
    let cached: CachedDefinitions | null = null;
    let floor: number | null = null;
    if (options.store) {
      // Best-effort: a locked or missing database means we proceed without a
      // cache and without a floor, not that we refuse to run.
      cached = await options.store.getCachedDefinitions().catch(() => null);
      floor = await options.store.getHighestBundleNumber().catch(() => null);
    }

    // A fresh cache short-circuits the network entirely. It is still
    // RE-VERIFIED below rather than trusted — it sits in a file any process
    // running as this user can rewrite — so skipping the fetch skips the
    // request, never the signature check.
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    if (cached && isFresh(cached, options.now, ttlMs)) {
      const offline = await loadDefinitions({
        fetcher: refusingFetcher(),
        verifier: options.verifier,
        baseUrl: options.baseUrl,
        publisherKeys: options.publisherKeys,
        snapshot: releaseSnapshot(),
        cached: { bytes: cached.payload, signature: cached.signature },
        ...(floor === null ? {} : { highestSeenBundleNumber: floor }),
        now: options.now,
        ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      });
      if (offline.source === "cache") {
        return {
          surfaces: resolveSurfaces(offline.bundle),
          source: "cache",
          reason: "using the last verified definitions; they are still fresh",
        };
      }
      // A cache that no longer verifies (rewritten, or signed by a key this
      // build has since retired) falls through to a real fetch rather than
      // pinning the user on the snapshot until the TTL expires.
    }

    const loaded = await loadDefinitions({
      fetcher: options.fetcher,
      verifier: options.verifier,
      baseUrl: options.baseUrl,
      publisherKeys: options.publisherKeys,
      snapshot: releaseSnapshot(),
      ...(cached ? { cached: { bytes: cached.payload, signature: cached.signature } } : {}),
      ...(floor === null ? {} : { highestSeenBundleNumber: floor }),
      now: options.now,
      ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });

    if (loaded.source === "remote" && loaded.artifact && options.store) {
      // Order matters. Raise the floor BEFORE storing the payload: if the
      // process dies between the two, a raised floor with a stale cache is
      // safe — the old cache simply fails anti-rollback and we re-fetch —
      // whereas a stored payload with an unraised floor leaves the rollback
      // defence behind the data it is meant to be defending.
      await options.store
        .recordBundleNumber(loaded.bundle.bundleNumber, options.now)
        .catch(() => undefined);
      await options.store
        .putCachedDefinitions({
          bundleNumber: loaded.bundle.bundleNumber,
          fetchedAt: options.now,
          // The exact bytes that verified, NOT a re-serialization: the
          // signature covers a byte sequence, and JSON.stringify is free to
          // differ in key order and whitespace, which would make the cache
          // fail its own re-verification on the next run.
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
    const message = error instanceof Error ? error.message : String(error);
    return snapshotOnly(`the definitions feed could not be resolved (${message})`);
  }
}

/**
 * Whether a cached bundle is still inside its freshness window.
 *
 * Unparseable or future-dated timestamps count as STALE. A `fetchedAt` this
 * build cannot read is a reason to re-fetch, and a clock that jumped backwards
 * must not pin a client on a cache for however long the skew lasts.
 */
function isFresh(cached: CachedDefinitions, now: string, ttlMs: number): boolean {
  const fetched = Date.parse(cached.fetchedAt);
  const current = Date.parse(now);
  if (Number.isNaN(fetched) || Number.isNaN(current)) return false;
  const age = current - fetched;
  return age >= 0 && age < ttlMs;
}

/**
 * A fetcher that answers nothing, used to drive `loadDefinitions` down its
 * cache path without a request.
 *
 * Reusing `loadDefinitions` rather than verifying the cache here directly is
 * deliberate: the cache must go through the SAME verify-then-parse and
 * anti-rollback checks as a remote bundle. A second, simpler cache path is
 * exactly where those checks would quietly diverge.
 */
function refusingFetcher(): Fetcher {
  return { async get() { return { status: "not-found" }; } };
}
