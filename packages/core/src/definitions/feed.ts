import { fromBundle, BundleError } from "./bundle.js";
import type { DefinitionsBundle } from "./bundle.js";
import type { FetchResult, Fetcher, SignatureVerifier } from "./providers.js";

/**
 * The definitions feed (AC-25, AC-26, ADR 0004, design.md §7).
 *
 * ADR 0004 is blunt about why this is signed: "this data tells the tool where
 * to write on users' machines, so it is an attack surface." A bundle names
 * config-store paths and installer binaries. Accepting an unverified one
 * would hand an attacker the write allowlist and the argv of every installer
 * HarnessKit runs.
 *
 * Three rules, in this order, and the order is the point:
 *
 * 1. **Verify the BYTES, then parse.** The signature covers the exact bytes
 *    fetched. Parsing first would run a JSON parser and every validator in
 *    bundle.ts over attacker-controlled input before anything had been
 *    checked, which is a decoder to attack rather than a signature to forge.
 * 2. **Anti-rollback.** A valid signature is not enough: a bundle number
 *    lower than the highest already seen is rejected. Otherwise a network
 *    attacker replays a genuinely-signed OLD bundle to reinstate a path or a
 *    permissive descriptor that a later release fixed.
 * 3. **Fall back, and say so.** Offline, a bad signature and a rollback
 *    attempt all degrade to the release-bundled snapshot, never to nothing
 *    and never silently — AC-25 requires the fallback to be stated.
 *
 * The cache is re-verified on load rather than trusted. It sits in a file any
 * process running as the user can rewrite, so "we verified it when we stored
 * it" says nothing about what is there now.
 *
 * TRUST ANCHOR — compiled-in keys only. The set of keys that can authorise a
 * bundle is fixed at build time; `notAfter` retires one, and only a new
 * binary introduces one. That means key ROTATION still needs a release, and
 * design.md D7 (cross-signed transition statements) is deliberately NOT
 * implemented here. A first attempt at it was written and withdrawn: an
 * attacker could replay the publisher's own statement to resurrect a revoked
 * key, and revoking the outgoing key destroyed the incoming one with it, so
 * rotation could not survive the event it exists for. Both follow from
 * revocation semantics design.md §7 does not yet pin down — expiry and
 * compromise are not the same thing and cannot share one `notAfter` field.
 * That is a design decision to take deliberately, not a patch to land in a
 * review round.
 *
 * Cross-signing, when it is built, proves POSSESSION of the incoming key. It
 * is not theft protection: a thief holding a stolen publisher key generates
 * their own second keypair and counter-signs with it. An earlier draft of
 * this file claimed otherwise.
 *
 * KNOWN RESIDUAL — no freshness bound. `generatedAt` is validated as
 * parseable and then not used, so an attacker who can withhold updates pins a
 * client on the newest bundle it ever saw for as long as they like.
 * Anti-rollback stops movement backwards; nothing here notices standing
 * still. This matters more than it looks: freezing a client also freezes the
 * arrival of a `notAfter`, which is currently the only way to retire a
 * compromised key. Closing it is a prerequisite for rotation, not an
 * independent nicety.
 */

/** Where the definitions in force came from. */
export type DefinitionsSource = "remote" | "cache" | "snapshot";

export interface LoadedDefinitions {
  bundle: DefinitionsBundle;
  source: DefinitionsSource;
  /**
   * The exact bytes that verified, and their detached signature — present
   * only when `source` is "remote".
   *
   * A caller that wants to CACHE what it just fetched needs both, because the
   * cache is re-verified on load rather than trusted. Returning the parsed
   * bundle alone would force the caller to re-serialize it, and a
   * re-serialized bundle is not the byte sequence the signature covers: key
   * order, whitespace and number formatting are all free to differ, so the
   * cached copy would fail its own verification on the next run.
   *
   * Absent for "cache" (the caller already has it) and for "snapshot" (which
   * is compiled in and unsigned).
   */
  artifact?: SignedArtifact;
  /**
   * Why the source is not "remote", phrased for a user. Always present when
   * it is not, because AC-25 requires the fallback to be stated rather than
   * silently taken.
   */
  reason?: string;
}

/** A signed artifact: the exact bytes, and a detached signature over them. */
export interface SignedArtifact {
  bytes: Uint8Array;
  signature: Uint8Array;
}

/**
 * A publisher key. `notAfter` lets a rotated key keep verifying bundles
 * published before the rotation without being usable for new ones.
 */
export interface PublisherKey {
  id: string;
  publicKey: Uint8Array;
  /** ISO-8601. Absent means currently active. */
  notAfter?: string;
}

export interface FeedOptions {
  fetcher: Fetcher;
  verifier: SignatureVerifier;
  /** Base URL, e.g. `https://harnesskit.ai/definitions/v1`. Must be https. */
  baseUrl: string;
  /** Keys compiled into this release. */
  publisherKeys: readonly PublisherKey[];
  /** The release-bundled fallback. Trusted: it shipped inside the binary. */
  snapshot: DefinitionsBundle;
  /** Previously accepted bundle, if any, with the bytes that were verified. */
  cached?: SignedArtifact;
  /**
   * Highest bundle number ever accepted on this machine. Anti-rollback
   * compares against this, NOT against the cache — a cache an attacker can
   * delete must not also reset the floor.
   */
  highestSeenBundleNumber?: number;
  /**
   * Injected clock — core never reads the system clock. MUST carry a UTC
   * offset (`Z` or `±HH:MM`); see `keyUsableAt`.
   */
  now: string;
  /**
   * Refuse a body larger than this. A non-finite or non-positive value is
   * refused rather than substituted: the one option whose whole purpose is
   * bounding a hostile response must not be disarmed by a bad number.
   */
  maxBytes?: number;
  /** Deadline for the whole fetch. Same fail-closed rule as `maxBytes`. */
  timeoutMs?: number;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * Largest value `setTimeout` honours. Past this it wraps to ~1 ms, so a
 * caller asking for "effectively no timeout" gets the tightest possible
 * deadline instead of the loosest.
 */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Call an injected provider without letting it throw.
 *
 * `Fetcher` and `SignatureVerifier` are interfaces the CALLER implements, so
 * a non-conforming one is the ordinary case rather than the exotic one — the
 * planned desktop verifier is a Tauri `invoke`, and `invoke` rejects whenever
 * the Rust side returns `Err`. Nothing else in this module has a throwing
 * path, so without these wrappers the single function documented to degrade
 * instead of crashing is the one that takes the app down.
 */
async function fetchOrFail(
  options: FeedOptions,
  url: string,
  limits: { maxBytes: number; timeoutMs: number },
): Promise<FetchResult> {
  try {
    return await options.fetcher.get(url, limits);
  } catch (error) {
    return { status: "failed", reason: `the fetcher threw (${errorText(error)})` };
  }
}

/** A verifier that throws is a verifier that failed: no signature, no trust. */
async function verifyOrFalse(
  options: FeedOptions,
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  try {
    return await options.verifier.verifyEd25519(message, signature, publicKey);
  } catch {
    return false;
  }
}

/** Decode verified bytes into a bundle, or explain why they are unusable. */
function decode(bytes: Uint8Array): { bundle: DefinitionsBundle } | { reason: string } {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { reason: "the signed payload is not valid UTF-8" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { reason: `the signed payload is not valid JSON (${errorText(error)})` };
  }
  try {
    return { bundle: fromBundle(parsed) };
  } catch (error) {
    // A validation failure on a SIGNED payload means the publisher shipped
    // something this build cannot use — a real condition worth naming, not a
    // security event.
    return {
      reason:
        error instanceof BundleError
          ? `the signed definitions are not usable by this build (${error.message})`
          : `the signed definitions could not be read (${errorText(error)})`,
    };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether an instant string is absolute — ISO-8601 carrying a UTC offset.
 *
 * `Date.parse` resolves an offset-less `2026-09-08T00:00:00` in the HOST's
 * timezone, so the same `notAfter` expired in Tokyo and was still honoured in
 * Honolulu 26 hours later, and a bundle verified on one machine and not its
 * neighbour. Refusing the ambiguous form is the only way to keep this
 * decision independent of where the user happens to be: core does not read
 * the system clock, and it must not read the system timezone either.
 */
function isAbsoluteInstant(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Whether a key is still usable at `now`.
 *
 * Every ambiguous or unparseable input fails CLOSED — treated as expired
 * rather than as "no expiry" — so a typo in a revocation, a bad clock, or a
 * timezone-dependent timestamp cannot keep a revoked key alive. Comparing
 * ISO-8601 as STRINGS looked fine and was not: an unpadded `2026-9-8` sorts
 * after everything, which kept a revoked key honoured for months.
 *
 * The boundary is EXCLUSIVE: a key is unusable at exactly its `notAfter`.
 * That is stricter than RFC 5280, where `notAfter` is inclusive, and is
 * pinned by test rather than left to be rediscovered.
 */
function keyUsableAt(key: PublisherKey, now: string): boolean {
  if (!isAbsoluteInstant(now)) return false;
  if (key.notAfter === undefined) return true;
  if (!isAbsoluteInstant(key.notAfter)) return false;
  return Date.parse(now) < Date.parse(key.notAfter);
}

/**
 * Verify a detached signature against every key compiled into this release
 * that is still usable at `options.now`. That set is the whole trust anchor:
 * nothing at runtime can add a key to it.
 */
async function verifyWithAnyKey(
  artifact: SignedArtifact,
  keys: readonly PublisherKey[],
  options: FeedOptions,
): Promise<boolean> {
  for (const key of keys) {
    if (!keyUsableAt(key, options.now)) continue;
    if (await verifyOrFalse(options, artifact.bytes, artifact.signature, key.publicKey)) {
      return true;
    }
  }
  return false;
}

/**
 * Accept a signed artifact, or explain why not. Verification comes before
 * decoding, and the rollback check before the result is usable.
 */
async function accept(
  artifact: SignedArtifact,
  trustedKeys: readonly PublisherKey[],
  options: FeedOptions,
): Promise<{ bundle: DefinitionsBundle } | { reason: string }> {
  if (!(await verifyWithAnyKey(artifact, trustedKeys, options))) {
    return { reason: "the signature did not verify against any known publisher key" };
  }
  const decoded = decode(artifact.bytes);
  if ("reason" in decoded) return decoded;

  // A floor that is PRESENT but not a usable integer means the machine
  // history is corrupt, and a corrupt history must not silently mean "no
  // protection". The previous shape here — skipping the comparison unless
  // `Number.isInteger(floor)` — was worse than no guard at all: `n < NaN` is
  // already false, so it did nothing for the truncated-ledger case it was
  // written for, while turning `"30"` and `30.5` from REFUSED into ACCEPTED.
  // Fail closed instead: an unreadable floor rejects every remote bundle and
  // says why, which surfaces the corruption rather than disarming quietly.
  const floor = options.highestSeenBundleNumber;
  if (floor !== undefined) {
    if (!Number.isInteger(floor) || floor < 0) {
      return {
        reason:
          `this machine's rollback floor is unreadable (${JSON.stringify(floor)}), so a replayed old bundle ` +
          "could not be ruled out — refusing the remote definitions until the machine history is repaired",
      };
    }
    if (decoded.bundle.bundleNumber < floor) {
      return {
        reason:
          `bundle ${decoded.bundle.bundleNumber} is older than ${floor}, which this machine has already accepted ` +
          "— refusing a rollback even though its signature is valid",
      };
    }
  }
  return decoded;
}

/**
 * Load the definitions in force: remote if it verifies, else the last
 * verified cache, else the snapshot that shipped in this release.
 *
 * Never throws on anything the outside world can cause. Offline, forged,
 * rolled back, corrupt, a hostile CDN, a clock this build cannot read, or an
 * injected provider that rejects instead of returning — all of them end with
 * HarnessKit still running against SOME set of definitions, because the
 * alternative is an app that stops working when a CDN does.
 *
 * The single exception is a caller that supplies no `snapshot`. That is a
 * type violation and a bug in the caller, not a condition to degrade on:
 * there is nothing left to fall back TO, and returning a `LoadedDefinitions`
 * with an undefined bundle would push the crash into whichever consumer
 * touched it first.
 */
export async function loadDefinitions(options: FeedOptions): Promise<LoadedDefinitions> {
  const snapshot = (reason: string): LoadedDefinitions => ({
    bundle: options.snapshot,
    source: "snapshot",
    reason,
  });

  // "Never to nothing" is the contract, and TypeScript does not enforce it at
  // a JS call site. A caller that hands over no snapshot gets a stated
  // failure, not a `LoadedDefinitions` whose bundle is undefined.
  if (options.snapshot === undefined || options.snapshot === null) {
    throw new TypeError("loadDefinitions requires a snapshot bundle to fall back to");
  }

  if (!options.baseUrl.startsWith("https://")) {
    return snapshot(
      `definitions feed ${JSON.stringify(options.baseUrl)} is not https — refusing to fetch definitions over an unauthenticated transport`,
    );
  }
  if (!isAbsoluteInstant(options.now)) {
    return snapshot(
      `the current time ${JSON.stringify(options.now)} is not an ISO-8601 instant with a UTC offset, so key expiry ` +
        "could not be judged — using the definitions that shipped with this release",
    );
  }

  // Both limits fail closed. Substituting a default for a caller's nonsense
  // would disarm the two controls that bound a hostile response: `NaN`
  // compares false against every size, so `maxBytes: NaN` read an unbounded
  // body, and a `timeoutMs` outside 32-bit range collapses to a ~1 ms
  // deadline rather than the long one the caller asked for.
  const limits = {
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  for (const [name, value] of [
    ["maxBytes", limits.maxBytes],
    ["timeoutMs", limits.timeoutMs],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_MS) {
      return snapshot(
        `the definitions feed was given an unusable ${name} (${JSON.stringify(value)}) — refusing to fetch with a ` +
          "limit that would not bound the response",
      );
    }
  }

  // Trailing slashes are stripped by scanning, not by `/\/+$/`. That regex
  // backtracks quadratically on a run of slashes: 80k of them took 3s.
  let base = options.baseUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);

  const [body, signature] = await Promise.all([
    fetchOrFail(options, `${base}/definitions.json`, limits),
    fetchOrFail(options, `${base}/definitions.json.sig`, limits),
  ]);

  let remoteReason: string;
  if (body.status === "ok" && signature.status === "ok") {
    const result = await accept(
      { bytes: body.bytes, signature: signature.bytes },
      options.publisherKeys,
      options,
    );
    if ("bundle" in result) {
      return {
        bundle: result.bundle,
        source: "remote",
        artifact: { bytes: body.bytes, signature: signature.bytes },
      };
    }
    remoteReason = result.reason;
  } else {
    const failed = body.status === "ok" ? signature : body;
    remoteReason =
      failed.status === "not-found"
        ? "the definitions feed returned nothing"
        : `the definitions feed could not be reached (${failed.status === "failed" ? failed.reason : "unknown"})`;
  }

  // The cache is re-verified, not trusted: it lives in a file any process
  // running as this user can rewrite.
  if (options.cached !== undefined) {
    const result = await accept(options.cached, options.publisherKeys, options);
    if ("bundle" in result) {
      return {
        bundle: result.bundle,
        source: "cache",
        reason: `${remoteReason}; using the last verified definitions instead`,
      };
    }
    return snapshot(
      `${remoteReason}, and the cached definitions are unusable (${result.reason}); using the definitions that shipped with this release`,
    );
  }

  return snapshot(`${remoteReason}; using the definitions that shipped with this release`);
}
