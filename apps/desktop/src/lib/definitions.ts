import { invoke } from "@tauri-apps/api/core";
import { PUBLISHER_KEYS, HttpsFetcher, resolveDefinitions as resolve } from "@harness-kit/core";
import type {
  CachedDefinitionsEntry,
  DefinitionsStore,
  ResolvedDefinitions,
  SignatureVerifier,
} from "@harness-kit/core";

/** Where the published feed lives (design.md §7). */
const FEED_URL = "https://harnesskit.ai/definitions/v1";

/**
 * The desktop's drivers for the shared definitions resolver (AC-25, AC-26).
 *
 * Every step — fetch, verify, re-verify the cache, TTL, raise the floor — is
 * core's, the same code the CLI runs. Only two things differ here:
 *
 * 1. **The verifier is a Tauri command.** `node:crypto` is exactly what the
 *    webview cannot load; a bare import of it in a core module already shipped
 *    four broken routes in a packaged build. Rust does the Ed25519.
 * 2. **State goes through commands too**, because the webview has no sqlite.
 *
 * The TRANSPORT is shared: `HttpsFetcher` uses only web standards, so the
 * webview runs the same hardened redirect/cap/deadline logic the CLI does
 * rather than a second implementation nobody reviewed.
 */

/** Base64 ↔ bytes across the IPC boundary, matching the column encoding. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Ed25519 verification in Rust.
 *
 * Returns false rather than throwing on ANY failure, including the invoke
 * itself rejecting. `invoke` rejects whenever the Rust side returns `Err`, and
 * a rejected promise on the path that decides whether to trust bytes is
 * precisely what used to crash `loadDefinitions` — core wraps this now, but
 * the driver should not be the thing relying on that.
 */
export const tauriVerifier: SignatureVerifier = {
  async verifyEd25519(message, signature, publicKey) {
    try {
      return await invoke<boolean>("verify_definitions_signature", {
        message: Array.from(message),
        signature: Array.from(signature),
        publicKey: Array.from(publicKey),
      });
    } catch {
      return false;
    }
  },
};

/** Definitions cache and rollback floor, via the Rust state commands. */
export const tauriDefinitionsStore: DefinitionsStore = {
  async getCachedDefinitions() {
    const row = await invoke<{
      bundleNumber: number;
      fetchedAt: string;
      payloadB64: string;
      signatureB64: string;
    } | null>("get_cached_definitions");
    if (!row) return null;
    try {
      return {
        bundleNumber: row.bundleNumber,
        fetchedAt: row.fetchedAt,
        payload: fromBase64(row.payloadB64),
        signature: fromBase64(row.signatureB64),
      };
    } catch {
      // Undecodable base64 is a corrupt row, which re-verification would
      // reject anyway. "No cache" is the honest answer, and it degrades.
      return null;
    }
  },

  async putCachedDefinitions(entry: CachedDefinitionsEntry) {
    await invoke("put_cached_definitions", {
      entry: {
        bundleNumber: entry.bundleNumber,
        fetchedAt: entry.fetchedAt,
        payloadB64: toBase64(entry.payload),
        signatureB64: toBase64(entry.signature),
      },
    });
  },

  async getHighestBundleNumber() {
    return await invoke<number | null>("get_highest_bundle_number");
  },

  async recordBundleNumber(bundleNumber: number, at: string) {
    await invoke("record_bundle_number", { bundleNumber, at });
  },
};

/**
 * Resolve the surface registry for this app session.
 *
 * Never throws: a definitions failure must not stop the Machine view from
 * rendering. With no publisher key compiled in it returns the release
 * snapshot without touching the network, which is today's behaviour.
 */
export async function resolveDesktopDefinitions(
  now: string = new Date().toISOString(),
): Promise<ResolvedDefinitions> {
  return resolve({
    fetcher: new HttpsFetcher(),
    verifier: tauriVerifier,
    publisherKeys: PUBLISHER_KEYS,
    baseUrl: FEED_URL,
    store: tauriDefinitionsStore,
    now,
  });
}
