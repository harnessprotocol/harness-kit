import type { HarnessResourceKind } from "../portability/types.js";
import type { StoreFormatId, SurfaceId, SurfaceScope } from "../surfaces/types.js";

/**
 * Machine state persistence interface (design.md §4, D3/D4, Task 12).
 *
 * Core defines the CONTRACT only — no driver, no `node:sqlite`, no `node:fs`,
 * nothing runtime at all (this file must contain type-only imports). The
 * desktop webview loads core and cannot resolve node builtins (the node:crypto
 * production crash institutionalized this rule), so implementations live with
 * their hosts: the CLI backs this with `node:sqlite`
 * (apps/cli/src/state/sqlite-store.ts); the desktop bridges via Tauri in M2.
 *
 * Implementation contract:
 * - The backing store is SHARED between the CLI and the desktop app
 *   (`~/.harness/harness.db`). Implementations MUST be safe for concurrent
 *   access from both processes — for SQLite that means WAL journal mode plus
 *   a busy timeout, and keeping every write transaction short.
 * - `canonicalForm` arrives PRE-SANITIZED (normalize.ts replaces
 *   secret-looking values with a fixed placeholder before anything reaches
 *   this layer), so persisting it verbatim is safe by design. Raw
 *   StoreEntry/file values must NEVER be persisted through this interface.
 * - `recordObservation` is atomic: either the snapshot row and ALL of its
 *   resource rows are persisted, or nothing is.
 */

/** Metadata describing one observation snapshot of the whole machine. */
export interface ObservationSnapshotMeta {
  /** ISO-8601 timestamp supplied by the caller — implementations never read the clock. */
  observedAt: string;
  /** Host platform identifier (e.g. "darwin", "linux", "win32"). */
  platform: string;
  /** Project root the observation ran against, or null for a home-only observation. */
  projectRoot: string | null;
  /** Home directory root the observation ran against. */
  homeRoot: string;
}

/**
 * The persistable subset of NormalizedResource (observe/normalize.ts).
 * Field-for-field JSON-serializable; `canonicalForm` is already
 * secret-sanitized upstream.
 */
export interface StoredResource {
  surface: SurfaceId;
  kind: HarnessResourceKind;
  /** `${kind}:${lowercased name}` — the cross-surface join key. */
  identityKey: string;
  /** Original, case-preserved display name. */
  name: string;
  scope: SurfaceScope;
  /** digestValue(canonicalForm) — equal iff logical content is equal. */
  digest: string;
  /** Kind-specific, secret-sanitized, JSON-serializable canonical shape. */
  canonicalForm: unknown;
  provenance: { file: string; formatId: StoreFormatId };
  needsConfirmation?: true;
}

/** One persisted observation snapshot, as returned by `latestObservation`. */
export interface ObservationSnapshot {
  id: number;
  meta: ObservationSnapshotMeta;
  /** Resources in insertion order (the order passed to `recordObservation`). */
  resources: StoredResource[];
}

/**
 * Durable machine state store. M1 uses only the observation-related methods;
 * transactions / plugin installs / definitions cache land in later milestones
 * behind the same interface.
 */
export interface StateStore {
  /**
   * Persist one observation snapshot with its resources in a single atomic
   * transaction. Returns the new snapshot's id.
   */
  recordObservation(meta: ObservationSnapshotMeta, resources: StoredResource[]): Promise<number>;

  /** The newest snapshot with its resources, or null when none exist. */
  latestObservation(): Promise<ObservationSnapshot | null>;

  /** Last recorded digest for a surface × scope pair, or null if never set. */
  getFingerprint(surface: SurfaceId, scope: SurfaceScope): Promise<string | null>;

  /** Upsert the digest for a surface × scope pair. */
  setFingerprint(surface: SurfaceId, scope: SurfaceScope, digest: string): Promise<void>;

  /** Release the underlying store. Further calls after close are invalid. */
  close(): Promise<void>;
}
