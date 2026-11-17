/** The personal profile, as the UI shows it. Matches core's PERSONAL_PROFILE_PATH under `~/`. */
export const PERSONAL_PROFILE_DISPLAY = "~/.harness/harness.yaml";

/** The old personal profile location, read only when the new file is absent. */
export const LEGACY_CLAUDE_PROFILE_DISPLAY = "~/.claude/harness.yaml";

/** Shown by Drift and Profile when the personal file sits where the app no longer reads it. */
export const LEGACY_HARNESS_NOTICE =
  "Found ~/harness.yaml. Harness Kit now reads ~/.harness/harness.yaml; move the file there.";

/** Shown when the profile was read from the legacy ~/.claude/harness.yaml (no ~/.harness/harness.yaml yet). */
export const LEGACY_CLAUDE_PROFILE_NOTICE =
  "Your profile was read from ~/.claude/harness.yaml. Harness Kit now keeps it at ~/.harness/harness.yaml; saving writes it there. The old file is left as is.";

/** Shown when both ~/.harness/harness.yaml and ~/.claude/harness.yaml exist. */
export const LEGACY_CLAUDE_IGNORED_NOTICE =
  "~/.claude/harness.yaml is ignored because ~/.harness/harness.yaml exists.";
