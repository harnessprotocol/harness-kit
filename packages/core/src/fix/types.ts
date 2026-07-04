import type { AdapterId } from "../adapters/adapter.js";
import type { TargetPlatform } from "../types.js";

// ── Drift classification ───────────────────────────────────────
//
// Exactly four classes. See CLAUDE.md / the WP-2.3 spec for the definitions.
// The safety line: only `missing`, `modified-inside-markers`, and `orphaned`
// are ever repairable. `user-modified-outside` is NEVER touched by a fix.

export type DriftClass =
  | "missing"
  | "modified-inside-markers"
  | "user-modified-outside"
  | "orphaned";

/**
 * One deployed file/slot's drift status relative to harness.yaml.
 *
 * `path` is project-relative (matches `FileAction.path` / the existing
 * compile pipeline's convention).
 */
export interface DriftItem {
  /** Which class this item falls into. Only the first three are repairable. */
  class: DriftClass;
  /** Project-relative path to the deployed file. */
  path: string;
  /** The adapter that owns this file/slot. */
  adapter: AdapterId;
  /** The legacy per-tool target this item belongs to (for multi-target adapters like agents-md). */
  target: TargetPlatform;
  /** harness.yaml `metadata.name` — the marker block's `name` component. */
  harnessName: string;
  /**
   * Instruction slot name ("operational"/"behavioral"/"identity") for
   * instruction drift, or a synthetic domain label ("mcp-servers",
   * "permissions") for non-marker structured files. `orphaned` items carry
   * the orphaned block's own slot name (which may not exist in harness.yaml
   * at all — that's the point).
   */
  slot: string;
  /**
   * What compile() would currently produce for this slot's marker content.
   * Present for `missing` and `modified-inside-markers` (the two classes
   * where "expected" is well-defined). Undefined for `orphaned` (nothing is
   * expected — the slot doesn't exist in harness.yaml) and for
   * `user-modified-outside` (out-of-marker content has no "expected" value;
   * it belongs to the user).
   */
  expectedContent?: string;
  /** Human-readable detail for reports/CLI/desktop rendering. */
  detail: string;
}

export interface DriftReport {
  items: DriftItem[];
  hasDrift: boolean;
  /** Convenience: items grouped by class. */
  byClass: Record<DriftClass, DriftItem[]>;
}

// ── Fix plan ────────────────────────────────────────────────────
//
// A dry-run object describing exactly which files will change and what
// their new full content will be. `user-modified-outside` items NEVER
// appear here — see buildFixPlan().

export type FixOperation = "restore-marker" | "remove-orphan" | "create-file";

export interface FixFileChange {
  /** Project-relative path. */
  path: string;
  operation: FixOperation;
  /**
   * Full current on-disk content (or "" if the file does not exist yet —
   * only true for `create-file`). Recorded so applyFix's backup step and any
   * verification tooling doesn't need to re-read the file mid-flight.
   */
  before: string;
  /** Full new content this operation will write. Byte-exact outside the touched marker region. */
  after: string;
  /** The DriftItem(s) this change repairs (a file can have >1 slot repaired in one change). */
  repairs: DriftItem[];
}

export interface FixPlan {
  /** One entry per file that will be written. Files are never duplicated. */
  changes: FixFileChange[];
  /** Items acknowledged but intentionally excluded (always `user-modified-outside`). */
  acknowledged: DriftItem[];
}

// ── Apply context ───────────────────────────────────────────────
//
// `timestamp` is supplied by the caller (CLI/desktop) — core never calls
// Date.now()/Math.random() so output is deterministic and testable.

export interface ApplyFixResult {
  /** Paths written, in the order they were written. */
  written: string[];
  /** Backup directory used for this run: `.harness/backups/<timestamp>/`. */
  backupDir: string;
  /** Project-relative backup file paths written, one per touched file. */
  backups: string[];
}
