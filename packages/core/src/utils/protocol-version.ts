/**
 * The Harness Protocol version writers emit. Readers accept the whole v2
 * family (see `isProtocolV2` in legacy.ts); every code path that CREATES or
 * RECONSTRUCTS a profile document must stamp this constant instead of a
 * hardcoded literal, so a future version bump is a one-line change.
 *
 * Deliberate exception: `migrateHarnessV1ToV2` keeps its own `"2"` literal —
 * it migrates v1 → v2 specifically, and the parser chains v2 → v2.1 on top.
 */
export const CURRENT_PROTOCOL_VERSION = "2.1";
