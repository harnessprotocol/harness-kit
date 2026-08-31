import type { FsProvider } from "../fs-provider.js";
import type { HarnessResourceKind } from "../portability/types.js";
import type { StoreFormatId, SurfaceId, SurfaceScope } from "../surfaces/types.js";
import { getSurface } from "../surfaces/registry.js";
import { isRecord } from "../utils/is-record.js";
import type { ObserveOptions, SurfaceObservation } from "./observe-surface.js";
import { observeAllSurfaces } from "./observe-surface.js";
import type { NormalizedResource } from "./normalize.js";
import { normalizeObservation } from "./normalize.js";
import type { SkippedEntry } from "./read-store.js";

/**
 * Machine inventory engine (design.md §3, Task 10): fold normalized
 * per-surface observations into one cross-surface grid, plus derived gaps
 * (AC-9) and structural diffs (AC-8). This is the single engine call both
 * the CLI machine view (Task 13) and the desktop Machine grid (Task 14)
 * render — the output is pure, JSON-serializable data with no options echo,
 * so Task 12 can persist it verbatim.
 *
 * Contracts:
 * - computeMachineInventory is PURE: no IO, no clock, no platform reads.
 *   buildMachineInventory is the only async wrapper (observe → compute).
 * - Diffs are computed from canonicalForm ONLY — raw files are never
 *   re-read, so secret placeholders can never leak back via provenance.
 * - Determinism: rows are sorted lexicographically by identityKey. Since
 *   an identityKey is `${kind}:${name}`, this yields kind-alphabetical
 *   then name-alphabetical ordering. PINNED — CLI/desktop snapshots and
 *   Task 12 persistence rely on this exact order.
 */

/**
 * Cell status semantics (AC-2 three-state distinction):
 * - "not-applicable": the surface's registry descriptor lists the row's
 *   kind in `notApplicable` — the harness lacks the concept entirely
 *   (e.g. pi × mcp-server). Applies regardless of detection.
 * - "present": ≥1 entry observed for this identity on this surface.
 * - "unknown": zero entries, but the surface is DETECTED and has a
 *   needsConfirmation store for the kind (e.g. copilot-vscode user MCP,
 *   where VS Code profiles may hide config) — we genuinely can't say.
 * - "absent": everything else, including undetected surfaces (an
 *   undetected surface with a needsConfirmation store is still "absent":
 *   there is no installation whose hidden config could surprise us).
 */
export type CellStatus = "present" | "absent" | "not-applicable" | "unknown";

export interface GridCellEntry {
  scope: SurfaceScope;
  digest: string;
  provenance: { file: string; formatId: StoreFormatId };
  needsConfirmation?: true;
}

export interface GridCell {
  status: CellStatus;
  /** ALL observed entries for this identity on this surface — every scope
   * and every colliding store — in observation (descriptor-store) order. */
  entries: GridCellEntry[];
  /**
   * Digest of the entry that wins precedence:
   * - across scopes, project beats user (nearest-wins, matching the layers
   *   model) — even when the project-scope store comes later in the
   *   descriptor's store list;
   * - within a scope, descriptor-store order is precedence: the FIRST
   *   store's entry wins a colliding identity (e.g. cursor's
   *   `.cursor/skills` beats `.agents/skills`).
   * Only set when the cell is "present".
   */
  effectiveDigest?: string;
}

export interface GridRow {
  /** identityKey (`${kind}:${lowercased name}`) — the cross-surface join key. */
  key: string;
  kind: HarnessResourceKind;
  /** Display name: the first-observed resource's original (case-preserved) name. */
  name: string;
  /** One cell per observed surface. Undetected surfaces are included —
   * the UI greys their columns rather than the engine dropping them. */
  cells: Record<SurfaceId, GridCell>;
}

/**
 * AC-9 gap: a row present somewhere and absent on surfaces that could hold
 * it. `missingOn` lists only surfaces that are DETECTED, have ≥1 store for
 * the row's kind (kind-supporting: a surface with the concept but no
 * locally managed store — e.g. windsurf MCP — is unmanaged locally, not a
 * gap), and whose cell is "absent". Undetected surfaces never appear
 * (installing a tool is not a config gap); "unknown" and "not-applicable"
 * cells are excluded from both lists.
 */
export interface MachineGap {
  row: string;
  presentOn: SurfaceId[];
  missingOn: SurfaceId[];
}

/**
 * AC-8 diff: one pair of present cells whose effective canonicalForms
 * differ (detected via differing effectiveDigests — equal digests mean
 * equal sanitized content, so a rotated secret is NOT a diff). Pairwise
 * across ≤11 surfaces is at most 55 pairs per row — no cap needed.
 */
export interface MachineDiff {
  row: string;
  /** In observation (registry) order; deltas read left→right. */
  surfaces: [SurfaceId, SurfaceId];
  delta: FieldDelta[];
}

/** One structural difference between two canonicalForms. Values come from
 * canonicalForm, which is already secret-sanitized. */
export interface FieldDelta {
  path: string;
  kind: "added" | "removed" | "changed";
  left?: unknown;
  right?: unknown;
}

export interface MachineInventory {
  /** All observed surfaces in input (registry) order, detected or not. */
  surfaces: Array<{
    id: SurfaceId;
    detected: boolean;
    resourceCount: number;
    skipped: SkippedEntry[];
  }>;
  /** Sorted lexicographically by `key` (kind then name) — pinned. */
  rows: GridRow[];
  gaps: MachineGap[];
  diffs: MachineDiff[];
}

// ── diff walk ───────────────────────────────────────────────────

/**
 * Deep-walk two canonicalForms and emit leaf-level FieldDeltas. Objects are
 * compared by sorted key union (`env.PORT`); arrays index-wise
 * (`args[2]`) — length differences become added/removed at the trailing
 * indices; primitives (and type-mismatched nodes) leaf-compare into
 * "changed". Root-level primitive mismatch reports path "$".
 */
function diffForms(left: unknown, right: unknown, path: string, deltas: FieldDelta[]): void {
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index++) {
      const childPath = `${path}[${index}]`;
      if (index >= left.length) {
        deltas.push({ path: childPath, kind: "added", right: right[index] });
      } else if (index >= right.length) {
        deltas.push({ path: childPath, kind: "removed", left: left[index] });
      } else {
        diffForms(left[index], right[index], childPath, deltas);
      }
    }
    return;
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const childPath = path === "" ? key : `${path}.${key}`;
      if (!(key in left)) {
        deltas.push({ path: childPath, kind: "added", right: right[key] });
      } else if (!(key in right)) {
        deltas.push({ path: childPath, kind: "removed", left: left[key] });
      } else {
        diffForms(left[key], right[key], childPath, deltas);
      }
    }
    return;
  }
  if (!Object.is(left, right)) {
    deltas.push({ path: path === "" ? "$" : path, kind: "changed", left, right });
  }
}

// ── engine ──────────────────────────────────────────────────────

/** Per-cell working state: normalized resources in observation order. */
interface CellAccumulator {
  resources: NormalizedResource[];
}

interface RowAccumulator {
  kind: HarnessResourceKind;
  name: string;
  cells: Map<SurfaceId, CellAccumulator>;
}

/**
 * The winning resource for a cell: first project-scope entry if any
 * (cross-scope nearest-wins), else the first entry outright (within-scope
 * store-order precedence — resources arrive in descriptor-store order).
 */
function effectiveResource(resources: NormalizedResource[]): NormalizedResource {
  return resources.find((resource) => resource.scope === "project") ?? resources[0];
}

/**
 * Fold observations into the grid + gaps + diffs. Pure: consults only its
 * input and the static surface registry (notApplicable / store metadata).
 * Rows exist for every identity observed on ANY surface; each row carries
 * a cell for EVERY observed surface (including undetected ones — the grid
 * lists all 11 columns and the UI greys undetected ones).
 *
 * Note on instructions rows: identity is file-based (Task 9) — CLAUDE.md
 * and AGENTS.md have different identityKeys and land in separate rows even
 * when their content overlaps. Content-level cross-file instruction
 * comparison is post-M1.
 */
export function computeMachineInventory(observations: SurfaceObservation[]): MachineInventory {
  const surfaces = observations.map((observation) => ({
    id: observation.surface,
    detected: observation.detected,
    resourceCount: observation.resources.length,
    skipped: observation.skipped.map((entry) => ({ ...entry })),
  }));
  const detectedById = new Map(observations.map((o) => [o.surface, o.detected]));
  const surfaceOrder = observations.map((o) => o.surface);

  // Group normalized resources by identityKey × surface.
  const rowsByKey = new Map<string, RowAccumulator>();
  for (const observation of observations) {
    const normalized = normalizeObservation(observation);
    for (let index = 0; index < normalized.length; index++) {
      const resource = normalized[index];
      let row = rowsByKey.get(resource.identityKey);
      if (!row) {
        // Display name: first-observed original (case-preserved) name.
        row = { kind: resource.kind, name: observation.resources[index].name, cells: new Map() };
        rowsByKey.set(resource.identityKey, row);
      }
      let cell = row.cells.get(resource.surface);
      if (!cell) {
        cell = { resources: [] };
        row.cells.set(resource.surface, cell);
      }
      cell.resources.push(resource);
    }
  }

  // PINNED sort: lexicographic by identityKey = kind-alpha then name-alpha.
  const sortedKeys = [...rowsByKey.keys()].sort();

  const rows: GridRow[] = [];
  const gaps: MachineGap[] = [];
  const diffs: MachineDiff[] = [];

  for (const key of sortedKeys) {
    const accumulator = rowsByKey.get(key)!;
    const cells = {} as Record<SurfaceId, GridCell>;
    /** Effective canonicalForm per present surface — diff input. NEVER
     * sourced from raw files: canonicalForm only (secret-safe). */
    const effectiveForms = new Map<SurfaceId, { digest: string; form: unknown }>();
    const presentOn: SurfaceId[] = [];
    const missingOn: SurfaceId[] = [];

    for (const surfaceId of surfaceOrder) {
      const descriptor = getSurface(surfaceId);
      const cellResources = accumulator.cells.get(surfaceId)?.resources ?? [];
      const detected = detectedById.get(surfaceId) ?? false;

      let status: CellStatus;
      if (descriptor.notApplicable.includes(accumulator.kind)) {
        // Concept-unsupported beats everything, detection included (AC-2).
        status = "not-applicable";
      } else if (cellResources.length > 0) {
        status = "present";
      } else if (
        detected &&
        descriptor.stores.some(
          (store) => store.kind === accumulator.kind && store.needsConfirmation,
        )
      ) {
        status = "unknown";
      } else {
        status = "absent";
      }

      const cell: GridCell = {
        status,
        entries: cellResources.map((resource) => ({
          scope: resource.scope,
          digest: resource.digest,
          provenance: { ...resource.provenance },
          ...(resource.needsConfirmation ? { needsConfirmation: true as const } : {}),
        })),
      };
      if (status === "present") {
        const winner = effectiveResource(cellResources);
        cell.effectiveDigest = winner.digest;
        effectiveForms.set(surfaceId, { digest: winner.digest, form: winner.canonicalForm });
        presentOn.push(surfaceId);
      } else if (
        status === "absent" &&
        detected &&
        // Kind-supporting: the surface manages ≥1 local store for the kind.
        descriptor.stores.some((store) => store.kind === accumulator.kind)
      ) {
        missingOn.push(surfaceId);
      }
      cells[surfaceId] = cell;
    }

    rows.push({ key, kind: accumulator.kind, name: accumulator.name, cells });

    if (presentOn.length > 0 && missingOn.length > 0) {
      gaps.push({ row: key, presentOn, missingOn });
    }

    // Pairwise diffs among present cells with differing effective digests,
    // in surface (registry) order. ≤11 surfaces ⇒ ≤55 pairs per row.
    for (let i = 0; i < presentOn.length; i++) {
      for (let j = i + 1; j < presentOn.length; j++) {
        const left = effectiveForms.get(presentOn[i])!;
        const right = effectiveForms.get(presentOn[j])!;
        if (left.digest === right.digest) continue;
        const delta: FieldDelta[] = [];
        diffForms(left.form, right.form, "", delta);
        diffs.push({ row: key, surfaces: [presentOn[i], presentOn[j]], delta });
      }
    }
  }

  return { surfaces, rows, gaps, diffs };
}

/** Observe every surface, normalize, and compute — the one IO entry point. */
export async function buildMachineInventory(
  fs: FsProvider,
  opts: ObserveOptions,
): Promise<MachineInventory> {
  const observations = await observeAllSurfaces(fs, opts);
  return computeMachineInventory(observations);
}
