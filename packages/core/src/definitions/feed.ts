import { fromBundle, BundleError } from "./bundle.js";
import type { DefinitionsBundle } from "./bundle.js";
import type { Fetcher, SignatureVerifier } from "./providers.js";

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
 * KNOWN RESIDUAL — no freshness bound. `generatedAt` is validated as
 * parseable and then not used, so an attacker who can withhold updates pins a
 * client on the newest bundle it ever saw for as long as they like.
 * Anti-rollback stops movement backwards; nothing here notices standing
 * still. design.md §7 does not call for a maximum age, so closing it is a
 * deliberate future decision rather than an oversight — but it is the
 * residual risk after anti-rollback, and it is written down here so the next
 * reader does not have to rediscover it.
 */

/** Where the definitions in force came from. */
export type DefinitionsSource = "remote" | "cache" | "snapshot";

export interface LoadedDefinitions {
  bundle: DefinitionsBundle;
  source: DefinitionsSource;
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
   * A cross-signed key-rotation statement, when one has been fetched or
   * cached. Optional: without it only the compiled-in keys are trusted.
   */
  transition?: SignedArtifact & { counterSignature?: Uint8Array };
  /** Injected clock — core never reads the system clock. */
  now: string;
  /** Refuse a body larger than this. */
  maxBytes?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

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
 * Whether a key is still usable at `now`.
 *
 * Both sides go through `Date.parse`. Comparing ISO-8601 as STRINGS looked
 * fine and was not: `2026-09-08T00:00:00+09:00` sorts after a `Z` instant it
 * actually precedes, second precision loses to millisecond precision, and an
 * unpadded `2026-9-8` sorts after everything — that last one kept a revoked
 * key honoured for months. An unparseable `notAfter` is treated as EXPIRED
 * rather than as "no expiry", so a typo in a revocation fails closed.
 */
function keyUsableAt(key: PublisherKey, now: string): boolean {
  if (key.notAfter === undefined) return true;
  const expires = Date.parse(key.notAfter);
  const current = Date.parse(now);
  if (Number.isNaN(expires)) return false;
  if (Number.isNaN(current)) return false;
  return current < expires;
}

/**
 * Verify a detached signature against every key trusted right now — the keys
 * compiled into this release, plus any key a verified transition statement
 * has introduced (see `resolveTrustedKeys`).
 */
async function verifyWithAnyKey(
  artifact: SignedArtifact,
  keys: readonly PublisherKey[],
  options: FeedOptions,
): Promise<boolean> {
  for (const key of keys) {
    if (!keyUsableAt(key, options.now)) continue;
    if (await options.verifier.verifyEd25519(artifact.bytes, artifact.signature, key.publicKey)) {
      return true;
    }
  }
  return false;
}

/**
 * A key-rotation transition statement (design.md D7).
 *
 * The document names the outgoing and incoming keys and is signed by BOTH:
 * the outgoing signature proves the current publisher authorised the
 * handover, and the incoming one proves whoever holds the new key
 * participated, so a stolen outgoing key cannot install a public key its
 * holder does not have the private half of.
 *
 * This is what makes rotation possible WITHOUT an app release, which is the
 * whole reason definitions are remote. A compiled-in key list with expiry
 * dates — which is what this shipped as first — still requires a new binary
 * to introduce a key, and so does not rotate anything.
 */
export interface TransitionStatement {
  /** Base64 of the raw 32-byte outgoing public key. */
  fromKey: string;
  /** Base64 of the raw 32-byte incoming public key. */
  toKey: string;
  /** Identifier for the incoming key. */
  toKeyId: string;
  /** ISO-8601; the statement is ignored before this instant. */
  effectiveFrom: string;
}

function decodeBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/** Byte-compare two keys without leaking a position through early exit. */
function sameKey(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

/**
 * Resolve the keys to trust for this load: the compiled-in set, plus any key
 * a valid transition statement introduces.
 *
 * A statement is accepted only when its `fromKey` is a key this build already
 * trusts AND both signatures verify over the statement's exact bytes. An
 * unverifiable statement is ignored silently — it is an attacker's opening
 * move, not a condition worth reporting to a user.
 */
async function resolveTrustedKeys(options: FeedOptions): Promise<readonly PublisherKey[]> {
  const statement = options.transition;
  if (statement === undefined) return options.publisherKeys;

  let parsed: TransitionStatement;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(statement.bytes);
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object") return options.publisherKeys;
    const candidate = value as Partial<TransitionStatement>;
    if (
      typeof candidate.fromKey !== "string" ||
      typeof candidate.toKey !== "string" ||
      typeof candidate.toKeyId !== "string" ||
      typeof candidate.effectiveFrom !== "string"
    ) {
      return options.publisherKeys;
    }
    parsed = candidate as TransitionStatement;
  } catch {
    return options.publisherKeys;
  }

  const effective = Date.parse(parsed.effectiveFrom);
  const current = Date.parse(options.now);
  if (Number.isNaN(effective) || Number.isNaN(current) || current < effective) {
    return options.publisherKeys;
  }

  const from = decodeBase64(parsed.fromKey);
  const to = decodeBase64(parsed.toKey);
  if (from === null || to === null) return options.publisherKeys;

  // The outgoing key must be one this build already trusts. Without that a
  // statement could bootstrap trust from nothing.
  const outgoing = options.publisherKeys.find(
    (key) => sameKey(key.publicKey, from) && keyUsableAt(key, options.now),
  );
  if (outgoing === undefined) return options.publisherKeys;

  // Cross-signed: BOTH halves must sign the same bytes.
  const byOutgoing = await options.verifier.verifyEd25519(
    statement.bytes,
    statement.signature,
    from,
  );
  const byIncoming =
    statement.counterSignature !== undefined &&
    (await options.verifier.verifyEd25519(statement.bytes, statement.counterSignature, to));
  if (!byOutgoing || !byIncoming) return options.publisherKeys;

  return [...options.publisherKeys, { id: parsed.toKeyId, publicKey: to }];
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

  // Only an integer floor disables nothing by accident. A NaN from a
  // truncated ledger file would otherwise switch anti-rollback off silently,
  // and the persistence that produces this value lands in the next commit.
  const floor = options.highestSeenBundleNumber;
  if (floor !== undefined && Number.isInteger(floor) && decoded.bundle.bundleNumber < floor) {
    return {
      reason:
        `bundle ${decoded.bundle.bundleNumber} is older than ${floor}, which this machine has already accepted ` +
        "— refusing a rollback even though its signature is valid",
    };
  }
  return decoded;
}

/**
 * Load the definitions in force: remote if it verifies, else the last
 * verified cache, else the snapshot that shipped in this release.
 *
 * Never throws. Every failure mode here — offline, forged, rolled back,
 * corrupt — has to end with HarnessKit still running against SOME set of
 * definitions, because the alternative is an app that stops working when a
 * CDN does.
 */
export async function loadDefinitions(options: FeedOptions): Promise<LoadedDefinitions> {
  const snapshot = (reason: string): LoadedDefinitions => ({
    bundle: options.snapshot,
    source: "snapshot",
    reason,
  });

  if (!options.baseUrl.startsWith("https://")) {
    return snapshot(
      `definitions feed ${JSON.stringify(options.baseUrl)} is not https — refusing to fetch definitions over an unauthenticated transport`,
    );
  }

  const limits = {
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  // Resolved once per load, before anything is verified against them.
  const trustedKeys = await resolveTrustedKeys(options);
  const base = options.baseUrl.replace(/\/+$/, "");
  const [body, signature] = await Promise.all([
    options.fetcher.get(`${base}/definitions.json`, limits),
    options.fetcher.get(`${base}/definitions.json.sig`, limits),
  ]);

  let remoteReason: string;
  if (body.status === "ok" && signature.status === "ok") {
    const result = await accept({ bytes: body.bytes, signature: signature.bytes }, trustedKeys, options);
    if ("bundle" in result) return { bundle: result.bundle, source: "remote" };
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
    const result = await accept(options.cached, trustedKeys, options);
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
