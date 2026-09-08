import { createPublicKey, verify as verifyEd } from "node:crypto";
import type { FetchResult, Fetcher, SignatureVerifier } from "./providers.js";

/**
 * Node-backed definitions providers for the CLI.
 *
 * Exported ONLY from the `node` entry point. `node:crypto` imported from a
 * module the desktop's route graph can reach is exactly what broke four
 * packaged routes before; the webview cannot resolve node builtins, and a
 * bare `import "crypto"` in a chunk is unresolvable at load.
 */

/** Ed25519 public keys are 32 raw bytes; SPKI-wrap them for node's verifier. */
const SPKI_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/** Raw Ed25519 public key length, hardcoded into the DER lengths above. */
const ED25519_PUBLIC_KEY_BYTES = 32;

export class NodeSignatureVerifier implements SignatureVerifier {
  async verifyEd25519(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    // The DER lengths in the prefix are fixed for 32 bytes, and OpenSSL
    // ignores trailing data after the SEQUENCE — so a 33-byte or 4 KiB key
    // was silently TRUNCATED to its first 32 and accepted, making infinitely
    // many distinct key values the same key. Short keys already failed on
    // their own; long ones did not. The contract says a malformed key returns
    // false, so check the length rather than relying on the parser to.
    if (publicKey.length !== ED25519_PUBLIC_KEY_BYTES) return false;
    try {
      const der = new Uint8Array(SPKI_ED25519_PREFIX.length + publicKey.length);
      der.set(SPKI_ED25519_PREFIX);
      der.set(publicKey, SPKI_ED25519_PREFIX.length);
      const key = createPublicKey({ key: Buffer.from(der), format: "der", type: "spki" });
      return verifyEd(null, message, key, signature);
    } catch {
      // A malformed key or signature is indistinguishable from a bad one by
      // design: a caller deciding whether to trust bytes must not branch on
      // which kind of wrong they are, and must not handle an exception here.
      return false;
    }
  }
}

/**
 * How many same-origin redirects to follow before giving up.
 *
 * The origin pin bounds redirects to the ORIGIN, not to a single URL: any
 * same-origin target is followed, including relative and port-normalised
 * ones, so a CDN can legitimately hop `/definitions.json` → `/latest/` →
 * `/cdn/v9/definitions.json`. A self-referential `302 Location: <self>` is
 * therefore only the tightest case of a loop the pin permits — one CDN
 * misconfiguration, no attacker required. Recursion without a bound spun
 * 100k hops in 156ms, allocating a timer and an AbortController per hop.
 */
const MAX_REDIRECTS = 5;

/** A duration a person can read: "800ms", "10s". `Math.round(ms/1000)` said
 * "within 0s" for any sub-second timeout. */
function humanDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
}

export class NodeFetcher implements Fetcher {
  async get(
    url: string,
    options: { maxBytes: number; timeoutMs: number },
  ): Promise<FetchResult> {
    // One deadline for the WHOLE call, redirects included. A per-hop timeout
    // bounds no redirect chain: each hop resets it, so N hops take N times as
    // long as the caller asked to wait.
    return this.fetchWithin(url, options, Date.now() + options.timeoutMs, MAX_REDIRECTS);
  }

  private async fetchWithin(
    url: string,
    options: { maxBytes: number; timeoutMs: number },
    deadline: number,
    redirectsLeft: number,
  ): Promise<FetchResult> {
    // Everything that can throw lives inside the try. `new URL()` on a
    // malformed feed URL used to sit above it, so a typo took the process
    // down instead of degrading to the snapshot.
    try {
      if (!url.startsWith("https://")) {
        return { status: "failed", reason: "refusing to fetch definitions over a non-https URL" };
      }
      const origin = new URL(url).origin;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return {
          status: "failed",
          reason: `the feed did not answer within ${humanDuration(options.timeoutMs)}`,
        };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const response = await fetch(url, { signal: controller.signal, redirect: "manual" });
        if (response.status >= 300 && response.status < 400) {
          if (redirectsLeft <= 0) {
            return { status: "failed", reason: "the definitions feed redirected too many times" };
          }
          const location = response.headers.get("location");
          if (location === null) {
            return { status: "failed", reason: "the definitions feed redirected without a target" };
          }
          const target = new URL(location, url);
          // Origin includes the scheme, so this also blocks an https→http
          // downgrade on an otherwise same-host redirect.
          if (target.origin !== origin) {
            return { status: "failed", reason: "the definitions feed redirected off its own origin" };
          }
          return this.fetchWithin(target.toString(), options, deadline, redirectsLeft - 1);
        }
        if (response.status === 404) return { status: "not-found" };
        if (!response.ok) {
          return { status: "failed", reason: `the feed answered ${response.status}` };
        }
        const declared = Number(response.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          return {
            status: "failed",
            reason: "the definitions payload is larger than this build accepts",
          };
        }
        return await readCapped(response, options.maxBytes);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "AbortError"
          ? `the feed did not answer within ${humanDuration(options.timeoutMs)}`
          : error instanceof Error
            ? error.message
            : String(error);
      return { status: "failed", reason };
    }
  }
}

/** Initial read buffer; grows geometrically, never past `maxBytes`. */
const INITIAL_READ_BYTES = 64 * 1024;

/**
 * Read a response body, STOPPING at the cap rather than buffering and then
 * complaining. `arrayBuffer()` reads it all first: a 1.5 GiB response against
 * a 2 MiB cap put 1.5 GiB resident before the check ran, and a response with
 * no content-length skipped the earlier check entirely.
 *
 * Bytes are copied into ONE growing buffer rather than collected in a chunk
 * array, because a cap on total bytes is not a cap on memory. Retaining each
 * chunk let a server drip its response one byte at a time and pay `maxBytes`
 * for orders of magnitude more allocation: 4 MiB of payload across two
 * concurrent fetches reached 2.2 GiB resident, well inside the 10s timeout.
 * Per-chunk overhead is what costs, so the fix is to stop keeping chunks.
 */
async function readCapped(response: Response, maxBytes: number): Promise<FetchResult> {
  const body = response.body;
  if (body === null) return { status: "ok", bytes: new Uint8Array(0) };
  const reader = body.getReader();
  const tooLarge: FetchResult = {
    status: "failed",
    reason: "the definitions payload is larger than this build accepts",
  };
  let buffer = new Uint8Array(Math.min(maxBytes, INITIAL_READ_BYTES));
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Checked BEFORE the copy, so an oversized chunk is never resident.
      if (total + value.byteLength > maxBytes) {
        await reader.cancel();
        return tooLarge;
      }
      if (total + value.byteLength > buffer.length) {
        const grown = new Uint8Array(
          Math.min(maxBytes, Math.max(buffer.length * 2, total + value.byteLength)),
        );
        grown.set(buffer.subarray(0, total));
        buffer = grown;
      }
      buffer.set(value, total);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  // Copy out so the returned array does not retain the grown buffer's slack.
  return { status: "ok", bytes: buffer.slice(0, total) };
}
