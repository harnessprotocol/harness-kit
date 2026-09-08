/**
 * Injected effects the definitions feed needs (design.md §7, ADR 0004).
 *
 * Core imports no driver for either. The CLI backs them with `fetch` and
 * `node:crypto`; the desktop must NOT use `node:crypto` — a bare import of it
 * in a core module already shipped four broken routes in a packaged build,
 * because the webview cannot resolve node builtins. That incident is why
 * these are interfaces rather than functions.
 */

/** The bytes of one fetched artifact, or a stated reason there are none. */
export type FetchResult =
  | { status: "ok"; bytes: Uint8Array }
  | { status: "not-found" }
  | { status: "failed"; reason: string };

export interface Fetcher {
  /**
   * Retrieve one URL. Implementations MUST:
   * - refuse a non-https URL;
   * - refuse a redirect that leaves the original origin, since following one
   *   would let a compromised CDN point verification at another host;
   * - stop reading past `maxBytes` rather than buffering a hostile response;
   * - apply a timeout, and report it as `failed` rather than hanging.
   *
   * Never throws: offline is an ordinary answer this feed must degrade on.
   */
  get(url: string, options: { maxBytes: number; timeoutMs: number }): Promise<FetchResult>;
}

export interface SignatureVerifier {
  /**
   * Verify a detached Ed25519 signature over `message`.
   *
   * Returns false for a bad signature AND for a malformed key or signature —
   * a caller must not be able to tell those apart, and must not have to
   * handle an exception on a path whose whole purpose is deciding whether to
   * trust bytes.
   */
  verifyEd25519(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<boolean>;
}
