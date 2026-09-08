import { verify as verifyEd } from "node:crypto";
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

export class NodeSignatureVerifier implements SignatureVerifier {
  async verifyEd25519(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    try {
      const { createPublicKey } = await import("node:crypto");
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

export class NodeFetcher implements Fetcher {
  async get(
    url: string,
    options: { maxBytes: number; timeoutMs: number },
  ): Promise<FetchResult> {
    if (!url.startsWith("https://")) {
      return { status: "failed", reason: "refusing to fetch definitions over a non-https URL" };
    }
    const origin = new URL(url).origin;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      // `redirect: "manual"` rather than following: a redirect that leaves the
      // original origin would let a compromised CDN point verification at
      // another host, and the signature check alone would not notice, since
      // the attacker would be serving a bundle they also signed for.
      const response = await fetch(url, { signal: controller.signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        const target = location === null ? null : new URL(location, url);
        return target !== null && target.origin === origin
          ? this.get(target.toString(), options)
          : { status: "failed", reason: "the definitions feed redirected off its own origin" };
      }
      if (response.status === 404) return { status: "not-found" };
      if (!response.ok) {
        return { status: "failed", reason: `the feed answered ${response.status}` };
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > options.maxBytes) {
        return { status: "failed", reason: "the definitions payload is larger than this build accepts" };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Checked again after reading: content-length is a claim, not a limit.
      if (bytes.byteLength > options.maxBytes) {
        return { status: "failed", reason: "the definitions payload is larger than this build accepts" };
      }
      return { status: "ok", bytes };
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "AbortError"
          ? `the feed did not answer within ${Math.round(options.timeoutMs / 1000)}s`
          : error instanceof Error
            ? error.message
            : String(error);
      return { status: "failed", reason };
    } finally {
      clearTimeout(timer);
    }
  }
}
