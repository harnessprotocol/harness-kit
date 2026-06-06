/**
 * Shared fingerprint utility — extracted to avoid a circular dependency
 * between keypair.ts and envelope.ts.
 */

import { blake2b } from "@noble/hashes/blake2b.js";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Compute the canonical Exchange fingerprint for a public key (hex).
 *
 * Format: "blake2b:" + first 16 hex chars of BLAKE2b-256(pubKeyBytes),
 * displayed in groups of 4: "blake2b:a3f1:e2b4:c5d6:e7f8"
 */
export function fingerprint(publicKeyHex: string): string {
  const pubBytes = hexToBytes(publicKeyHex);
  const hash = blake2b(pubBytes, { dkLen: 32 });
  const hex16 = Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  const grouped = hex16.match(/.{4}/g)!.join(":");
  return `blake2b:${grouped}`;
}
