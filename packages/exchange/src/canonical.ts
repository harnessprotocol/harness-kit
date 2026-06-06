/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) for producing the bytes that
 * are signed and verified in the Exchange offer envelope.
 *
 * Both sender and receiver MUST canonicalize the same object (the parsed
 * fragment, not re-serialized YAML) using this function to get identical
 * bytes. The `canonicalize` package implements RFC 8785 exactly, including
 * IEEE 754 float encoding rules that naive JSON.stringify does not guarantee.
 *
 * Usage contract:
 *   - Pass the fragment as the plain JS object produced by parseHarness().
 *   - Do NOT modify the object between canonicalize calls.
 *   - Returns a UTF-8 string; sign/verify the bytes via TextEncoder.
 */

import canonicalize from "canonicalize";

/**
 * Return the RFC 8785 canonical JSON string for `value`.
 * Throws if the value contains non-serializable types.
 */
export function canonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) {
    throw new Error("canonicalize: input contains non-serializable value");
  }
  return result;
}

/** Encode the canonical JSON string to UTF-8 bytes for signing. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
