import { getSurface } from "@harness-kit/core";
import type { SummaryCell } from "@harness-kit/ui";
import type { CellVariant } from "./cell-state";
import type {
  GridRow,
  HarnessResourceKind,
  MachineInventory,
  ProductFamily,
  SurfaceId,
} from "@harness-kit/core";

/**
 * Display labels for resource kinds (row-section headers, NA tooltips).
 * Exhaustive over HARNESS_RESOURCE_KINDS — the Record type fails to compile
 * if core adds a kind, so headers/tooltips never fall back to raw ids.
 */
export const KIND_LABELS: Record<HarnessResourceKind, string> = {
  plugin: "Plugins",
  skill: "Skills",
  "mcp-server": "MCP servers",
  env: "Environment variables",
  instructions: "Instructions",
  permissions: "Permissions",
  "architectural-constraints": "Architectural constraints",
  policy: "Policies",
  extends: "Extends",
  "native-extension": "Native extensions",
};

/** `sha256:abcdef…` → `abcdef12` (short-hash for tooltips/drawer). */
export function shortDigest(digest: string): string {
  const raw = digest.includes(":") ? digest.slice(digest.indexOf(":") + 1) : digest;
  return raw.slice(0, 8);
}

export interface FamilyGroup {
  family: ProductFamily;
  surfaces: SurfaceId[];
}

/**
 * Group the inventory's surfaces (registry order — families are contiguous
 * there) into consecutive product-family column groups.
 */
export function familyGroups(surfaces: MachineInventory["surfaces"]): FamilyGroup[] {
  const groups: FamilyGroup[] = [];
  for (const surface of surfaces) {
    const family = getSurface(surface.id).family;
    const last = groups[groups.length - 1];
    if (last && last.family === family) {
      last.surfaces.push(surface.id);
    } else {
      groups.push({ family, surfaces: [surface.id] });
    }
  }
  return groups;
}

/** Which rows the grid shows, from the summary strip (AC-14). */
export type MachineFilter = "all" | "gaps" | "differs";

/** The chip a filter selects rows by. */
const FILTER_VARIANT: Record<Exclude<MachineFilter, "all">, CellVariant> = {
  gaps: "gap",
  differs: "differs",
};

/** `?filter=gaps|differs`; anything else, including no param, is "all". */
export function filterOf(searchParams: URLSearchParams): MachineFilter {
  const value = searchParams.get("filter");
  return value === "gaps" || value === "differs" ? value : "all";
}

/** A copy of `searchParams` with the filter set, or removed for "all". Other params are kept. */
export function withFilter(searchParams: URLSearchParams, filter: MachineFilter): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (filter === "all") next.delete("filter");
  else next.set("filter", filter);
  return next;
}

/**
 * What Machine shows under the strip (spec AC-18, design D6): the surface
 * grid, or Drift against harness.yaml.
 */
export type MachineView = "grid" | "drift";

/**
 * `?view=drift` selects Drift; `?view=grid`, no param or anything else is the
 * grid. The legacy `?drift=1` (links and redirects from before the view
 * existed) still selects Drift unless an explicit `view` says otherwise.
 */
export function viewOf(searchParams: URLSearchParams): MachineView {
  const value = searchParams.get("view");
  if (value === "drift") return "drift";
  if (value === "grid") return "grid";
  return searchParams.get("drift") === "1" ? "drift" : "grid";
}

/**
 * A copy of `searchParams` with the view set, or removed for the default
 * grid. Every other param is kept (`harness=` filters Drift, `filter=` the
 * grid), except the legacy `drift=1`, which `view` replaces: left behind it
 * would select Drift again once `view` is removed.
 */
export function withView(searchParams: URLSearchParams, view: MachineView): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete("drift");
  if (view === "grid") next.delete("view");
  else next.set("view", view);
  return next;
}

/** The rows the filter keeps: those with at least one cell of the filter's variant. */
export function filterRows(
  rows: GridRow[],
  variants: Map<string, Record<SurfaceId, CellVariant>>,
  filter: MachineFilter,
): GridRow[] {
  if (filter === "all") return rows;
  const wanted = FILTER_VARIANT[filter];
  return rows.filter((row) => Object.values(variants.get(row.key) ?? {}).includes(wanted));
}

/** The strip's Drift cell: whether the Drift view is showing, and its last count. */
export interface DriftCellState {
  active: boolean;
  /**
   * Drift items from the last scan Drift itself ran in this visit to Machine,
   * or null before one. Machine never scans for drift on its own: the scan
   * asks for project-directory access, which only opening Drift may do.
   */
  count: number | null;
  onSelect: () => void;
}

/**
 * The Machine summary strip. Gaps and Differs count ROWS with at least one
 * such chip, the unit the filter reveals; `inventory.diffs` is pairwise and
 * would overcount. A non-zero Gaps or Differs cell toggles its filter. The
 * active cell stays a pressed button even at zero (a stale ?filter= link, or
 * a rescan that closed every gap), so the empty grid has a visible cause and
 * a way back.
 *
 * With `drift`, a "Drift vs harness.yaml" cell selects the Drift view. It is
 * always a button, since Drift is reachable whatever its count, and reads "—"
 * until Drift has scanned: not "…", which would claim a scan is running.
 */
export function machineSummaryCells(
  inventory: MachineInventory,
  variants: Map<string, Record<SurfaceId, CellVariant>>,
  filter: MachineFilter,
  onFilterChange: (filter: MachineFilter) => void,
  drift?: DriftCellState,
): SummaryCell[] {
  const filterCell = (id: "gaps" | "differs", label: string): SummaryCell => {
    const count = filterRows(inventory.rows, variants, id).length;
    return {
      id,
      label,
      value: String(count),
      tone: count > 0 ? "warning" : "default",
      ...((count > 0 || filter === id) && {
        active: filter === id,
        onSelect: () => onFilterChange(filter === id ? "all" : id),
      }),
    };
  };
  return [
    { id: "rows", label: "Resources", value: String(inventory.rows.length) },
    filterCell("gaps", "Gaps"),
    filterCell("differs", "Differs"),
    ...(drift
      ? [
          {
            id: "drift",
            label: "Drift vs harness.yaml",
            value: drift.count === null ? "—" : String(drift.count),
            valueLabel: drift.count === null ? "not scanned" : undefined,
            tone: drift.count !== null && drift.count > 0 ? ("warning" as const) : ("default" as const),
            active: drift.active,
            onSelect: drift.onSelect,
          },
        ]
      : []),
    {
      id: "detected",
      label: "Surfaces detected",
      value: `${inventory.surfaces.filter((surface) => surface.detected).length}/${inventory.surfaces.length}`,
    },
  ];
}
