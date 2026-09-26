import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, SummaryStrip } from "@harness-kit/ui";
import type { GridRow, MachineInventory, SurfaceId } from "@harness-kit/core";
import { inventoryVariants, type CellVariant } from "./cell-state";
import {
  filterOf,
  filterRows,
  machineSummaryCells,
  withFilter,
  type MachineFilter,
} from "./machine-view-model";

const NO_VARIANTS: Map<string, Record<SurfaceId, CellVariant>> = new Map();
const NO_ROWS: GridRow[] = [];

/**
 * The grid filter behind the summary strip. It lives in the URL (?filter=),
 * so it survives a reload and back/forward; a sidebar link to /machine drops
 * it. Setting it copies every other param: dropping harness= would unfilter
 * the embedded Drift section. Clears the selection when the selected row is
 * filtered out: a drawer for a row the grid no longer shows describes
 * something the user can't see.
 */
export function useMachineFilter(
  inventory: MachineInventory | null,
  selectedRowKey: string | null,
  clearSelection: () => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterOf(searchParams);
  const setFilter = useCallback(
    (next: MachineFilter) => setSearchParams((current) => withFilter(current, next)),
    [setSearchParams],
  );
  const variants = useMemo(
    () => (inventory ? inventoryVariants(inventory) : NO_VARIANTS),
    [inventory],
  );
  const shownRows = useMemo(
    () => (inventory ? filterRows(inventory.rows, variants, filter) : NO_ROWS),
    [inventory, variants, filter],
  );
  useEffect(() => {
    if (selectedRowKey !== null && !shownRows.some((row) => row.key === selectedRowKey)) {
      clearSelection();
    }
  }, [selectedRowKey, shownRows, clearSelection]);
  return { filter, setFilter, variants, shownRows };
}

const FILTER_WORDING: Record<Exclude<MachineFilter, "all">, string> = {
  gaps: "with a closable gap",
  differs: "whose content differs",
};

export interface MachineSummaryProps {
  /** The unfiltered inventory: the strip always counts every row. */
  inventory: MachineInventory;
  variants: Map<string, Record<SurfaceId, CellVariant>>;
  filter: MachineFilter;
  /** Rows the grid is showing under `filter`. */
  shownCount: number;
  onFilterChange: (filter: MachineFilter) => void;
}

/** The Machine summary strip, whose Gaps and Differs cells filter the grid (AC-14). */
export function MachineSummary({
  inventory,
  variants,
  filter,
  shownCount,
  onFilterChange,
}: MachineSummaryProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  // "Show all" unmounts itself. Hand focus to the strip cell it un-presses,
  // which stays mounted while its count is above zero, instead of <body>.
  function showAll() {
    const pressed = stripRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    onFilterChange("all");
    pressed?.focus();
  }
  return (
    <>
      <div ref={stripRef}>
        <SummaryStrip cells={machineSummaryCells(inventory, variants, filter, onFilterChange)} />
      </div>
      {filter !== "all" && (
        <div className="hk-machine-filter-status" data-testid="machine-filter-status">
          <span>
            Showing {shownCount} of {inventory.rows.length} resources {FILTER_WORDING[filter]}
          </span>
          <Button variant="ghost" size="sm" onClick={showAll}>
            Show all
          </Button>
        </div>
      )}
    </>
  );
}
