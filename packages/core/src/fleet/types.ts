import type { AdapterId } from "../adapters/adapter.js";
import type { TargetPlatform } from "../types.js";

// ── Fleet report ──────────────────────────────────────────────────
//
// Aggregates detect() + detectDrift() across every registered adapter, for
// one or more "scopes" (a project root, or the user's global/home config).
// This is the stable, serializable contract the CLI's `status` command and
// (later) the desktop Fleet page consume unmodified — design changes here
// are a breaking change to that contract, so keep it additive.

export type FleetScopeKind = "project" | "global";

export interface FleetScope {
  kind: FleetScopeKind;
  /** Absolute path this scope was scanned at. */
  root: string;
  /** Human-readable label for display (e.g. project dir name, or "global"). */
  label: string;
}

export type FleetStatus =
  | "in-sync"
  | "drift"
  | "not-configured"
  | "not-installed";

/**
 * One harness/adapter's status within one scope. `driftCount` is only
 * meaningful when `status === "drift"`. `harnessName` is the harness.yaml
 * metadata.name this scope was checked against, when a harness.yaml was
 * found and parsed for this scope (undefined for `not-configured` scopes
 * with no harness.yaml at all).
 */
export interface FleetCell {
  adapter: AdapterId;
  /** Legacy per-tool targets this adapter covers, restricted to what was actually checked for this scope. */
  targets: TargetPlatform[];
  status: FleetStatus;
  /** Number of DriftItems, only non-zero when status === "drift". */
  driftCount: number;
  /** Version string for the underlying tool, when discoverable. Undefined when not detected/unknown. */
  version?: string;
  detail: string;
}

/** One row: an adapter, and its FleetCell per scope. */
export interface FleetRow {
  adapter: AdapterId;
  cells: Record<string /* scope root */, FleetCell>;
}

export interface FleetSummaryCounts {
  inSync: number;
  drift: number;
  notConfigured: number;
  notInstalled: number;
}

export interface FleetReport {
  scopes: FleetScope[];
  rows: FleetRow[];
  summary: FleetSummaryCounts;
}
