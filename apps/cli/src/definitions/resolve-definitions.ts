import { PUBLISHER_KEYS, HttpsFetcher, resolveDefinitions as resolve } from "@harness-kit/core";
// Only the VERIFIER is node-only: it needs `node:crypto`, which is exactly
// what the webview cannot load. The transport is platform-neutral and shared
// with the desktop.
import { NodeSignatureVerifier } from "@harness-kit/core/node";
import type { DefinitionsStore, ResolvedDefinitions } from "@harness-kit/core";

/** Where the published feed lives (design.md §7). */
const DEFAULT_FEED_URL = "https://harnesskit.ai/definitions/v1";

/** Opt out for offline or air-gapped runs. */
const DISABLE_ENV = "HARNESS_NO_DEFINITIONS_FETCH";
/** Point a test or a staging build at another feed. */
const URL_ENV = "HARNESS_DEFINITIONS_URL";

export type { ResolvedDefinitions };

/**
 * The CLI's drivers for the shared resolver (AC-25, AC-26).
 *
 * All the sequencing — fetch, verify, re-verify the cache, TTL, raise the
 * floor — lives in core so the desktop runs exactly the same steps. This file
 * supplies only what differs: a `node:crypto` verifier, the environment
 * overrides, and the feed URL.
 *
 * `PUBLISHER_KEYS` is empty today because key custody is unsettled, so every
 * run ends on the snapshot without touching the network. That is the intended
 * safe state: the plumbing runs end to end while trusting nothing, and adding
 * a real key turns the feed on with no other change.
 */
export async function resolveDefinitions(
  store: DefinitionsStore | undefined,
  now: string = new Date().toISOString(),
): Promise<ResolvedDefinitions> {
  // The opt-out is expressed by withholding the keys, which routes through
  // the same no-keys branch as a keyless build rather than adding a second
  // way to reach the snapshot.
  const disabled = Boolean(process.env[DISABLE_ENV]);
  const resolved = await resolve({
    fetcher: new HttpsFetcher(),
    verifier: new NodeSignatureVerifier(),
    publisherKeys: disabled ? [] : PUBLISHER_KEYS,
    baseUrl: process.env[URL_ENV] ?? DEFAULT_FEED_URL,
    now,
    ...(store && !disabled ? { store } : {}),
  });

  return disabled
    ? {
        ...resolved,
        reason: `${DISABLE_ENV} is set; using the definitions that shipped with this release`,
      }
    : resolved;
}
