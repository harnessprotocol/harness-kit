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
 * Verify a detached signature against every key still valid at `now`.
 *
 * Trying each key is what makes rotation work: a bundle signed by the
 * outgoing key still verifies until that key's `notAfter` passes.
 */
async function verifyWithAnyKey(
  artifact: SignedArtifact,
  options: FeedOptions,
): Promise<boolean> {
  for (const key of options.publisherKeys) {
    if (key.notAfter !== undefined && key.notAfter <= options.now) continue;
    if (await options.verifier.verifyEd25519(artifact.bytes, artifact.signature, key.publicKey)) {
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
  options: FeedOptions,
): Promise<{ bundle: DefinitionsBundle } | { reason: string }> {
  if (!(await verifyWithAnyKey(artifact, options))) {
    return { reason: "the signature did not verify against any known publisher key" };
  }
  const decoded = decode(artifact.bytes);
  if ("reason" in decoded) return decoded;

  const floor = options.highestSeenBundleNumber;
  if (floor !== undefined && decoded.bundle.bundleNumber < floor) {
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
  const base = options.baseUrl.replace(/\/+$/, "");
  const [body, signature] = await Promise.all([
    options.fetcher.get(`${base}/definitions.json`, limits),
    options.fetcher.get(`${base}/definitions.json.sig`, limits),
  ]);

  let remoteReason: string;
  if (body.status === "ok" && signature.status === "ok") {
    const result = await accept({ bytes: body.bytes, signature: signature.bytes }, options);
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
    const result = await accept(options.cached, options);
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
