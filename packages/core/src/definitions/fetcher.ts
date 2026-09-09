import type { FetchResult, Fetcher } from "./providers.js";

/**
 * The definitions transport, shared by every platform.
 *
 * Deliberately NOT in the `node` entry point: this class uses only web
 * standards — `fetch`, `AbortController`, `ReadableStream`, `URL` — so the
 * Tauri webview runs it unchanged. It lived beside `NodeSignatureVerifier`
 * only because they arrived together, and that placement was about to cost a
 * SECOND hardened fetcher written in Rust for the desktop. Two
 * implementations of "refuse non-https, pin the origin, bound redirects, cap
 * the body, apply one deadline" is two places to get it wrong, and review
 * already found three defects in this one.
 *
 * `NodeSignatureVerifier` genuinely cannot move: it needs `node:crypto`,
 * which is exactly what the webview cannot load.
 */

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

export class HttpsFetcher implements Fetcher {
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
        // `redirect: "manual"` means different things in the two runtimes this
        // class now serves. Under Node/undici it yields a real 3xx with a
        // readable `Location`. In a browser engine — which is what the Tauri
        // webview is — it yields an OPAQUE REDIRECT: `type` is
        // "opaqueredirect", `status` is 0 and the headers are empty. Without
        // this branch that falls through to `!response.ok` and reports "the
        // feed answered 0", so any CDN redirect on the feed URL would break
        // the desktop while working in the CLI. That is precisely the
        // dev/prod split this file exists to avoid, so it is named rather
        // than left to be rediscovered.
        if (response.type === "opaqueredirect" || (response.status === 0 && !response.ok)) {
          return {
            status: "failed",
            reason:
              "the definitions feed redirected, and this runtime does not expose the target — " +
              "the feed must be served without redirects",
          };
        }
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
