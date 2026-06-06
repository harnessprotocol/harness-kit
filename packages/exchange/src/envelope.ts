/**
 * Build and verify Exchange offer envelopes.
 *
 * buildOffer   — assembles and signs a plaintext offer (Phase 1; no encryption)
 * verifyOffer  — validates schema, signature, expiry, and embedded fragment
 *
 * Both functions import crypto-init.ts for its side-effect (sha512 hook for
 * @noble/ed25519 v2 sync methods). Never remove that import.
 */

// REQUIRED: wires sha512 into @noble/ed25519 sync methods.
import "./crypto-init.js";

import * as ed from "@noble/ed25519";
import { validateHarness } from "@harness-kit/core";
import { validateOffer } from "./validate.js";
import { canonicalBytes } from "./canonical.js";
import { fingerprint } from "./fingerprint.js";
import {
  ENVELOPE_VERSION,
  type BuildOfferOptions,
  type PlaintextOfferEnvelope,
  type VerifyResult,
} from "./types.js";

/** Default offer expiry: 7 days from now. */
function defaultExpires(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Build and sign a plaintext offer envelope.
 *
 * Phase 1 only: unaddressed (no recipient), plaintext (no encrypted-fragment).
 * The fragment MUST already be validated as kind: fragment before calling this.
 * Expires defaults to +7 days from now if not supplied.
 */
export function buildOffer(
  fragment: Record<string, unknown>,
  options: BuildOfferOptions
): PlaintextOfferEnvelope {
  const expires = options.expires ?? defaultExpires();
  const signedBytes = canonicalBytes(fragment);
  const privBytes = hexToBytes(options.sender.privateKey);
  const sigBytes = ed.sign(signedBytes, privBytes);

  const envelope: PlaintextOfferEnvelope = {
    version: ENVELOPE_VERSION,
    type: "offer",
    sender: {
      key: options.sender.publicKey,
    },
    fragment,
    expires,
    signature: bytesToHex(sigBytes),
  };

  if (options.suggestedImportMode) {
    envelope["suggested-import-mode"] = options.suggestedImportMode;
  }
  if (options.message) {
    envelope.message = options.message;
    envelope.sender.display = undefined; // display is set by caller via sender object if needed
  }

  return envelope;
}

/**
 * Verify an offer envelope. Four checks in order — any failure is terminal:
 *
 *   1. Schema validation against exchange.schema.json
 *   2. ed25519 signature over RFC 8785 canonical JSON of the fragment
 *   3. Expiry check (expires must be in the future)
 *   4. Fragment validation against harness schema (kind: fragment semantics)
 *
 * Returns { ok: true, fingerprint } or { ok: false, fingerprint?, reasons[] }.
 * Callers MUST NOT apply an offer whose ok is false.
 */
export function verifyOffer(doc: unknown): VerifyResult {
  // 1. Schema validation
  const schemaResult = validateOffer(doc);
  if (!schemaResult.valid) {
    return {
      ok: false,
      reasons: ["Schema validation failed: " + schemaResult.errors.join("; ")],
    };
  }

  const envelope = doc as PlaintextOfferEnvelope;
  const fp = fingerprint(envelope.sender.key);

  // 2. Signature verification — covers canonical JSON bytes of the fragment.
  const signedBytes = canonicalBytes(envelope.fragment);
  const pubBytes = hexToBytes(envelope.sender.key);
  const sigBytes = hexToBytes(envelope.signature);

  let sigValid: boolean;
  try {
    sigValid = ed.verify(sigBytes, signedBytes, pubBytes);
  } catch {
    sigValid = false;
  }

  if (!sigValid) {
    return {
      ok: false,
      fingerprint: fp,
      reasons: [
        "Signature verification failed. " +
          "This offer may have been tampered with in transit. " +
          `Sender key: ${fp}`,
      ],
    };
  }

  // 3. Expiry — relay implementations MUST also enforce against their own
  // clock (the expires field is not signed and could be extended by an
  // attacker with relay write access). Receivers SHOULD also reject implausibly
  // distant expiry.
  const now = new Date();
  const expiresAt = new Date(envelope.expires);
  if (isNaN(expiresAt.getTime()) || expiresAt <= now) {
    return {
      ok: false,
      fingerprint: fp,
      reasons: [
        `Offer has expired (expires: ${envelope.expires}, now: ${now.toISOString()})`,
      ],
    };
  }

  // 4. Fragment validation (harness schema, fragment semantics).
  // This is the second, independent validation required by HEP-7 — the
  // envelope schema treats the fragment as opaque.
  const fragmentResult = validateHarness(envelope.fragment);
  if (!fragmentResult.valid) {
    return {
      ok: false,
      fingerprint: fp,
      reasons: [
        "Embedded fragment failed harness schema validation: " +
          fragmentResult.errors.map((e) => e.message).join("; "),
      ],
    };
  }

  return { ok: true, fingerprint: fp };
}
