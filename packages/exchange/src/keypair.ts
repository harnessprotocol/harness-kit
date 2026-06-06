/**
 * Exchange keypair generation, storage, and fingerprinting.
 *
 * Key files use node:fs directly (not FsProvider) because:
 * 1. FsProvider has no chmod — mode 0o600 on the private key requires raw fs.
 * 2. Keypair management is a distinct concern from harness-config I/O.
 *
 * Note: mode bits are advisory on Windows; 0o600 is still passed for
 * POSIX/macOS correctness but does not enforce access control on Windows.
 */

// REQUIRED: wires sha512 into @noble/ed25519 sync methods.
import "./crypto-init.js";

import * as ed from "@noble/ed25519";
import { randomBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { fingerprint } from "./fingerprint.js";
import { canonicalJson } from "./canonical.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExchangeKeypair } from "./types.js";

export { fingerprint } from "./fingerprint.js";

const KEY_DIR = path.join(os.homedir(), ".harness", "exchange");
const PRIV_PATH = path.join(KEY_DIR, "identity.key");
const PUB_PATH = path.join(KEY_DIR, "identity.pub");

/** Generate a fresh ed25519 keypair. Does NOT save to disk. */
export function generate(): ExchangeKeypair {
  const privateKeyBytes = randomBytes(32);
  const publicKeyBytes = ed.getPublicKey(privateKeyBytes);
  return {
    privateKey: bytesToHex(privateKeyBytes),
    publicKey: bytesToHex(publicKeyBytes),
  };
}

/**
 * Save a keypair to ~/.harness/exchange/.
 * Private key is written with mode 0o600 (user-read/write only).
 * WARNING: the key is stored unencrypted in Phase 1 MVP.
 */
export function save(keypair: ExchangeKeypair): void {
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(PUB_PATH, keypair.publicKey + "\n", { encoding: "utf-8" });
  fs.writeFileSync(PRIV_PATH, keypair.privateKey + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/**
 * Load the keypair from ~/.harness/exchange/.
 * Warns if the private key file has permissions wider than 0o600 (POSIX only).
 */
export function load(): ExchangeKeypair {
  if (!fs.existsSync(PRIV_PATH) || !fs.existsSync(PUB_PATH)) {
    throw new Error(
      "No Exchange keypair found. Run `harness exchange keygen` first."
    );
  }
  warnIfInsecurePerms(PRIV_PATH);
  return {
    privateKey: fs.readFileSync(PRIV_PATH, "utf-8").trim(),
    publicKey: fs.readFileSync(PUB_PATH, "utf-8").trim(),
  };
}

/** Returns true if a keypair exists on disk. */
export function exists(): boolean {
  return fs.existsSync(PRIV_PATH) && fs.existsSync(PUB_PATH);
}

/**
 * Derive a short content-based id for a fragment object — used as the
 * filename when metadata.name is absent. Returns first 8 hex chars of
 * SHA-256 of the canonical JSON.
 */
export function fragmentContentId(fragmentObj: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(canonicalJson(fragmentObj));
  return bytesToHex(sha256(bytes)).slice(0, 8);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function warnIfInsecurePerms(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    const mode = stat.mode & 0o777;
    if (mode !== 0o600) {
      console.warn(
        `Warning: Exchange private key at ${filePath} has permissions ${mode.toString(8)}. ` +
          `Expected 0600. Run: chmod 600 "${filePath}"`
      );
    }
  } catch {
    // stat failed; ignore (file existence already confirmed above)
  }
}
