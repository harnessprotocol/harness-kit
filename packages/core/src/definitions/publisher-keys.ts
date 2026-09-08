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
 * DELIBERATELY EMPTY. No publisher keypair has been generated yet. Custody IS
 * now decided (design.md §7, ADR 0004 amendment 2026-09-08): the private half
 * lives offline on the maintainer's machine and never in CI, which signs
 * nothing and only publishes a pre-signed artifact. Generating the keypair and
 * adding its public half here is what turns the feed on.
 *
 * The consequence is intended and is the safe direction. An empty list means
 * nothing can ever verify, so `resolveDefinitions` returns the release
 * snapshot with a stated reason — and skips the fetch entirely, since two
 * requests and a timeout to reach a guaranteed snapshot is pure cost. The
 * feed is wired end to end and inert: every caller runs the real code path
 * and trusts nothing.
 *
 * (An earlier version of this note claimed the feed "makes exactly the
 * requests it would make in production". That stopped being true the moment
 * the no-keys gate was added, which is the whole point of re-reading a
 * neighbour's comment when you add a case beside it.)
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
