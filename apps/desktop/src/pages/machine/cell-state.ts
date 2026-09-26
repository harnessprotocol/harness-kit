import type { GridCell, GridRow, MachineGap, SurfaceId } from "@harness-kit/core";

/**
 * Which chip each Machine grid cell shows (AC-13, AC-14). Pure: no React,
 * no Tauri.
 */

export type CellVariant =
  | "present-user"
  | "present-project"
  | "gap"
  | "differs"
  | "absent"
  | "none"
  | "unmanaged"
  | "unknown";

export interface CellVariantInfo {
  /** Text inside the chip; null renders an empty cell. */
  chip: string | null;
  /** Legend / tooltip wording. */
  label: string;
}

export const CELL_VARIANTS: Record<CellVariant, CellVariantInfo> = {
  "present-user": { chip: "user", label: "present at user scope" },
  "present-project": { chip: "project", label: "present in this project" },
  gap: { chip: "+ copy", label: "closable gap" },
  differs: { chip: "differs", label: "same name, different content" },
  absent: { chip: null, label: "not here, and nothing can be copied here" },
  none: { chip: "—", label: "no such concept" },
  unmanaged: { chip: "·", label: "not managed locally" },
  unknown: { chip: "?", label: "unknown, store hidden" },
};

/** Variants shown in the legend, in display order (absent is the blank cell and is not listed). */
export const LEGEND_VARIANTS: readonly CellVariant[] = [
  "present-user",
  "present-project",
  "gap",
  "differs",
  "none",
  "unmanaged",
  "unknown",
];

/** The row's present cells that carry a digest, in `surfaceOrder` first, then
 * any cell keys `surfaceOrder` does not name. */
function presentDigests(row: GridRow, surfaceOrder: SurfaceId[]): Array<[SurfaceId, string]> {
  const keys = Object.keys(row.cells) as SurfaceId[];
  const ordered = [
    ...surfaceOrder.filter((id) => id in row.cells),
    ...keys.filter((id) => !surfaceOrder.includes(id)),
  ];
  const out: Array<[SurfaceId, string]> = [];
  for (const id of ordered) {
    const cell = row.cells[id];
    if (cell.status === "present" && cell.effectiveDigest !== undefined) {
      out.push([id, cell.effectiveDigest]);
    }
  }
  return out;
}

/**
 * The row's reference content: the most frequent effective digest among its
 * present cells. A tie goes to the digest held by the earliest surface in
 * `surfaceOrder`. Undefined when no present cell has a digest.
 */
export function rowBaselineDigest(row: GridRow, surfaceOrder: SurfaceId[]): string | undefined {
  const digests = presentDigests(row, surfaceOrder);
  const counts = new Map<string, number>();
  for (const [, digest] of digests) counts.set(digest, (counts.get(digest) ?? 0) + 1);
  const max = Math.max(0, ...counts.values());
  return digests.find(([, digest]) => counts.get(digest) === max)?.[1];
}

/** The first surface in `surfaceOrder` whose present cell holds the baseline. */
export function rowBaselineSource(row: GridRow, surfaceOrder: SurfaceId[]): SurfaceId | undefined {
  const baseline = rowBaselineDigest(row, surfaceOrder);
  if (baseline === undefined) return undefined;
  return presentDigests(row, surfaceOrder).find(([, digest]) => digest === baseline)?.[0];
}

function presentVariant(cell: GridCell, baseline: string | undefined): CellVariant {
  if (cell.effectiveDigest !== undefined && cell.effectiveDigest !== baseline) return "differs";
  const winner = cell.entries.find((entry) => entry.digest === cell.effectiveDigest) ?? cell.entries[0];
  return winner?.scope === "project" ? "present-project" : "present-user";
}

/**
 * One variant per cell in `row.cells`. "differs" is relative to
 * `rowBaselineDigest`, not to the pairwise `inventory.diffs`. An absent cell
 * is a "gap" only when the row's MachineGap lists its surface in `missingOn`.
 */
export function rowCellVariants(
  row: GridRow,
  gaps: MachineGap[],
  surfaceOrder: SurfaceId[],
): Record<SurfaceId, CellVariant> {
  const baseline = rowBaselineDigest(row, surfaceOrder);
  const missingOn = new Set(gaps.find((gap) => gap.row === row.key)?.missingOn ?? []);
  const variants = {} as Record<SurfaceId, CellVariant>;
  for (const id of Object.keys(row.cells) as SurfaceId[]) {
    const cell = row.cells[id];
    switch (cell.status) {
      case "not-applicable":
        variants[id] = "none";
        break;
      case "unmanaged":
        variants[id] = "unmanaged";
        break;
      case "unknown":
        variants[id] = "unknown";
        break;
      case "absent":
        variants[id] = missingOn.has(id) ? "gap" : "absent";
        break;
      case "present":
        variants[id] = presentVariant(cell, baseline);
        break;
    }
  }
  return variants;
}
