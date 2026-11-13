/**
 * Test-only credential-shaped strings. NOT real credentials.
 *
 * Fixtures for the secret scrubber need values shaped like real tokens. Writing
 * them whole puts key-shaped text in a public repo: secret scanners raise
 * alerts, and anyone scanning the repo sees what looks like a leak. Building
 * each one from a prefix and a body at run time keeps the source free of whole
 * tokens while the test sees the exact same string.
 *
 * `scripts/check-token-literals.mjs` (repo root) fails CI when a whole token is written
 * into a file instead.
 */
export function fakeSecret(prefix: string, body: string): string {
  return prefix + body;
}
