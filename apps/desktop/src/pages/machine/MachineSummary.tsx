import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, SummaryStrip } from "@harness-kit/ui";
import type { GridRow, MachineInventory, SurfaceId } from "@harness-kit/core";
import { inventoryVariants, type CellVariant } from "./cell-state";
import {
  filterOf,
  filterRows,
  machineSummaryCells,
  withFilter,
  withView,
  type DriftCellState,
  type MachineFilter,
} from "./machine-view-model";

const NO_VARIANTS: Map<string, Record<SurfaceId, CellVariant>> = new Map();
const NO_ROWS: GridRow[] = [];

/**
 * The grid filter behind the summary strip. It lives in the URL (?filter=),
 * so it survives a reload and back/forward; a sidebar link to /machine drops
 * it. Setting it copies every other param (dropping harness= would unfilter
 * Drift the next time it is shown) and selects the grid view in the same URL
 * update: a filter is a request to see the grid. Clears the selection when
 * the selected row is filtered out: a drawer for a row the grid no longer
 * shows describes something the user can't see.
 */
export function useMachineFilter(
  inventory: MachineInventory | null,
  selectedRowKey: string | null,
  clearSelection: () => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterOf(searchParams);
  const setFilter = useCallback(
    (next: MachineFilter) =>
      setSearchParams((current) => withFilter(withView(current, "grid"), next)),
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

/**
 * Keeps focus off <body> when a filter change unmounts the focused control:
 * "Show all" (MachineFilterStatus) always removes itself, and a pressed
 * zero-count cell turns back into plain text. When that happens, focus goes
 * to the cell that was pressed, or else to the strip. Focus that is still
 * connected (a cell that stays a button, or the strip itself, which WebKit
 * focuses on a mouse click since it does not focus buttons) is left alone,
 * and with nothing focused there is nothing to hand off.
 *
 * `filter` is the filter the strip shows. Pass the returned `stripRef` to
 * MachineSummary and route every filter change, the strip's and "Show all",
 * through `changeFilter`.
 */
export function useFilterFocusHandoff(
  filter: MachineFilter,
  onFilterChange: (filter: MachineFilter) => void,
) {
  const stripRef = useRef<HTMLDivElement>(null);
  const handoff = useRef<{ from: Element; pressed: HTMLElement | null } | null>(null);
  const changeFilter = useCallback(
    (next: MachineFilter) => {
      const from = document.activeElement;
      handoff.current =
        from && from !== document.body
          ? {
              from,
              pressed:
                stripRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? null,
            }
          : null;
      onFilterChange(next);
    },
    [onFilterChange],
  );
  useEffect(() => {
    const pending = handoff.current;
    handoff.current = null;
    if (!pending || pending.from.isConnected) return;
    if (pending.pressed?.isConnected && pending.pressed.tagName === "BUTTON") pending.pressed.focus();
    else stripRef.current?.focus();
  }, [filter]);
  return { stripRef, changeFilter };
}

export interface MachineSummaryProps {
  /** The unfiltered inventory: the strip always counts every row. */
  inventory: MachineInventory;
  variants: Map<string, Record<SurfaceId, CellVariant>>;
  filter: MachineFilter;
  /** `changeFilter` from useFilterFocusHandoff. */
  onFilterChange: (filter: MachineFilter) => void;
  /** `stripRef` from useFilterFocusHandoff: the focus fallback. */
  stripRef: RefObject<HTMLDivElement | null>;
  /** The "Drift vs harness.yaml" cell (AC-18); omitted, the strip has none. */
  drift?: DriftCellState;
}

/**
 * The Machine summary strip, whose Gaps and Differs cells filter the grid
 * (AC-14) and whose Drift cell selects the Drift view (AC-18). Just the
 * strip: the view tabs and the filter status line are the page's to place,
 * so the tabs keep one tree position whether or not the strip has rendered
 * yet (a remount would drop focus to <body> when the first scan lands).
 */
export function MachineSummary({
  inventory,
  variants,
  filter,
  onFilterChange,
  stripRef,
  drift,
}: MachineSummaryProps) {
  return (
    <div
      ref={stripRef}
      className="hk-machine-summary"
      role="group"
      aria-label="Summary"
      tabIndex={-1}
    >
      <SummaryStrip cells={machineSummaryCells(inventory, variants, filter, onFilterChange, drift)} />
    </div>
  );
}

export interface MachineFilterStatusProps {
  filter: MachineFilter;
  /** Rows the grid is showing under `filter`. */
  shownCount: number;
  /** Every row in the inventory. */
  totalCount: number;
  /** `changeFilter` from useFilterFocusHandoff, so "Show all" hands focus back. */
  onFilterChange: (filter: MachineFilter) => void;
}

/** One line over the grid while a Gaps or Differs filter is on; nothing otherwise. */
export function MachineFilterStatus({ filter, shownCount, totalCount, onFilterChange }: MachineFilterStatusProps) {
  if (filter === "all") return null;
  return (
    <div className="hk-machine-filter-status" data-testid="machine-filter-status">
      <span>
        Showing {shownCount} of {totalCount} resources {FILTER_WORDING[filter]}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onFilterChange("all")}>
        Show all
      </Button>
    </div>
  );
}
