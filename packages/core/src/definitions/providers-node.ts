import { createPublicKey, verify as verifyEd } from "node:crypto";
import type { SignatureVerifier } from "./providers.js";

/**
 * The Node-backed signature verifier.
 *
 * Exported ONLY from the `node` entry point, and the ONLY thing in this file:
 * `node:crypto` imported from a module the desktop's route graph can reach is
 * exactly what broke four packaged routes before. The webview cannot resolve
 * node builtins, and a bare `import "crypto"` in a chunk is unresolvable at
 * load.
 *
 * The transport used to live here too. It moved to `fetcher.ts` once it was
 * clear it used no node builtin at all — see that file for why keeping it
 * here was about to cost a second implementation.
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
