/** Offer envelope format version (the Exchange layer's own version, distinct from harness.yaml version). */
export const ENVELOPE_VERSION = "1" as const;

/** Envelope types defined in this spec version. */
export type EnvelopeType = "offer";

/** Plaintext offer envelope (no recipient, no encrypted-fragment). */
export interface PlaintextOfferEnvelope {
  version: typeof ENVELOPE_VERSION;
  type: EnvelopeType;
  sender: SenderIdentity;
  message?: string;
  fragment: Record<string, unknown>;
  "suggested-import-mode"?: ImportModeHint;
  expires: string; // ISO 8601
  signature: string; // 128-char lowercase hex
  [key: `x-${string}`]: unknown;
}

/** Sender's self-sovereign identity. Only `key` is authenticated. */
export interface SenderIdentity {
  key: string; // 64-char lowercase hex (ed25519 public key)
  display?: string; // UNVERIFIED hint only
}

export type ImportModeHint = "merge" | "replace" | "skip";

/** Result of verifyOffer(). Any failure is hard — no proceed-anyway. */
export type VerifyResult =
  | { ok: true; fingerprint: string }
  | { ok: false; fingerprint?: string; reasons: string[] };

/** Keypair stored on disk. */
export interface ExchangeKeypair {
  /** ed25519 private key, 32 bytes, hex-encoded. */
  privateKey: string;
  /** ed25519 public key, 32 bytes, hex-encoded. */
  publicKey: string;
}

/** Provenance sidecar written alongside a received fragment. */
export interface ExchangeProvenance {
  receivedFrom: string; // blake2b fingerprint of sender key
  receivedAt: string; // ISO 8601
  edited: boolean;
}

/** Options for buildOffer(). */
export interface BuildOfferOptions {
  sender: ExchangeKeypair;
  /** ISO 8601 expiry. Defaults to +7 days from now if omitted. */
  expires?: string;
  suggestedImportMode?: ImportModeHint;
  message?: string;
}
