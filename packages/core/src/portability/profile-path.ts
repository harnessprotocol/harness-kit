/**
 * Where the personal profile lives, relative to the home directory. One path
 * for the CLI and the desktop app (spec AC-55, 2026-11-16 note).
 */
export const PERSONAL_PROFILE_PATH = ".harness/harness.yaml";

/**
 * Where older builds kept it. Read only as a fallback when the file at
 * `PERSONAL_PROFILE_PATH` is absent; never written or deleted.
 */
export const LEGACY_PERSONAL_PROFILE_PATH = ".claude/harness.yaml";

/** Warning printed when the profile is read from the legacy path. */
export const LEGACY_PERSONAL_PROFILE_WARNING =
  "Using ~/.claude/harness.yaml. harness-kit now keeps your personal profile at ~/.harness/harness.yaml; move it there.";
