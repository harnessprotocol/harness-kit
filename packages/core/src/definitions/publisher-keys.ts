import { SURFACES } from "../surfaces/registry.js";
import { TARGET_CAPABILITY_MATRIX } from "../portability/capabilities.js";
import { toBundle } from "./bundle.js";
import type { DefinitionsBundle } from "./bundle.js";
import type { PublisherKey } from "./feed.js";

/**
 * The publisher keys compiled into this release — the entire trust anchor for
 * the definitions feed. Nothing at runtime can add to this list; see the
 * trust-anchor note in `feed.ts`.
 *
 * DELIBERATELY EMPTY. No publisher keypair exists yet, and where its private
 * half will live is an open question: design.md §7 and ADR 0004 both specify
 * the signing scheme and neither says anything about key custody. Signing in
 * CI means a private key in CI, and that decision has not been made.
 *
 * The consequence is intended and is the safe direction. `verifyWithAnyKey`
 * over an empty list returns false for every artifact, so `loadDefinitions`
 * refuses every remote and cached bundle and returns the release snapshot
 * with a stated reason. The feed is therefore fully wired and inert: it makes
 * exactly the requests it would make in production, and trusts nothing. When
 * a real key exists, adding it here turns the feed on with no other change.
 *
 * Do NOT add a placeholder or self-signed key to "make it work" in
 * development. A key in this array is a key that can rewrite the user-scope
 * write allowlist and the argv of every installer HarnessKit runs.
 */
export const PUBLISHER_KEYS: readonly PublisherKey[] = [];

/**
 * The release-bundled snapshot: the definitions this binary shipped with.
 *
 * Built from the compiled-in registry rather than stored as a JSON asset, so
 * it cannot drift from the code that would be used if the feed were removed
 * tomorrow. `bundleNumber` is 0 — the snapshot is by definition the oldest
 * thing this build knows, so any genuine remote bundle outranks it, and it
 * can never win the anti-rollback comparison against real published data.
 *
 * `generatedAt` is fixed rather than `new Date()`: it is not a fetch time,
 * and a snapshot whose timestamp moved every call would make two inventories
 * in the same process disagree about the definitions in force.
 */
export function releaseSnapshot(): DefinitionsBundle {
  return toBundle({
    surfaces: SURFACES,
    capabilityMatrix: TARGET_CAPABILITY_MATRIX,
    bundleNumber: 0,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });
}
