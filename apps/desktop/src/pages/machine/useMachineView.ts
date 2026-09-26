import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AdapterId } from "@harness-kit/core";
import type { DriftSummary } from "../drift/drift-data";
import { ADAPTER_META } from "../fleet/adapter-meta";
import { driftCountFor, viewOf, withView, type DriftCellState, type MachineView } from "./machine-view-model";

/**
 * How much of the view region, from its top, must be on screen to count as
 * visible: the tabs plus the first lines of the view under them.
 */
const VIEW_TOP_PX = 120;

export interface UseMachineViewOptions<Row> {
  /** The grid's selected row. The drawer belongs to the grid, so Drift closes it. */
  selectedRow: Row | null;
  clearSelection: () => void;
  /**
   * False while something above the view region is still to render (Machine's
   * first scan, which brings the summary strip): bringing the view into sight
   * waits for it, or the strip would push it back down.
   */
  layoutSettled?: boolean;
  /** Drift's summary before Drift reports one (the fixture's static entries). */
  initialDriftSummary?: DriftSummary | null;
}

/**
 * Which of Machine's two views shows (spec AC-18, design D6), shared by
 * MachinePage and its dev fixture so the two cannot disagree.
 *
 * - `view` is read from the URL on every render, never copied into state:
 *   React Router does not remount the page when only the search string
 *   changes, so a sidebar or palette link to Drift while already on Machine
 *   must still switch views. `setView` keeps every other param and pushes
 *   a history entry, so Back returns to the other view; re-selecting the
 *   current tab adds no entry, since the toggle does not call it then.
 * - `drift` is the strip's Drift cell, counting what the Drift list shows
 *   under `harness=` from the summary Drift last reported (`onDriftSummary`).
 * - Switching to Drift closes the row drawer; `drawerRow` is null outside the
 *   grid so the drawer does not flash for a frame first.
 * - AC-7: whenever the view becomes Drift, on arrival or on a switch, or
 *   `harness=` changes while it shows, the top of the view region (the tabs
 *   and the start of Drift) is brought on screen. The app's scroll container
 *   keeps its offset across routes and views, so without this a user who was
 *   scrolled down lands below the thing they asked for. It scrolls only when
 *   that top is not already visible, so someone looking at it is not moved,
 *   and not at all if the page scrolled between the request and the moment
 *   it could be served (the first scan), so a late jump never undoes a
 *   scroll the user made.
 *   Attach `regionRef` to the element holding the tabs and the view.
 */
export function useMachineView<Row>({
  selectedRow,
  clearSelection,
  layoutSettled = true,
  initialDriftSummary = null,
}: UseMachineViewOptions<Row>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewOf(searchParams);
  const harness = searchParams.get("harness");
  const setView = useCallback(
    (next: MachineView) => setSearchParams((current) => withView(current, next)),
    [setSearchParams],
  );

  // Null until Drift has scanned: Machine never scans for drift itself, since
  // the scan asks for project-directory access.
  const [driftSummary, setDriftSummary] = useState<DriftSummary | null>(initialDriftSummary);
  const drift: DriftCellState = {
    active: view === "drift",
    count: driftCountFor(driftSummary, harness),
    harness: harness ? (ADAPTER_META[harness as AdapterId]?.name ?? harness) : null,
    onSelect: () => setView(view === "drift" ? "grid" : "drift"),
  };

  useEffect(() => {
    if (view === "drift") clearSelection();
  }, [view, clearSelection]);
  const drawerRow = view === "grid" ? selectedRow : null;

  const regionRef = useRef<HTMLDivElement>(null);
  // The scroll offset when the request was made, or null for no request.
  const revealFrom = useRef<number | null>(null);
  useEffect(() => {
    const region = regionRef.current;
    revealFrom.current = view === "drift" && region ? scrollOffsetOf(region) : null;
  }, [view, harness]);
  useEffect(() => {
    // Keyed on the request as well as on layoutSettled: a ref write schedules
    // nothing, so this must run on the render the request arrived in.
    // Consumed once, so a later Refresh does not pull the page back here.
    const from = revealFrom.current;
    if (from === null || !layoutSettled) return;
    revealFrom.current = null;
    const region = regionRef.current;
    if (!region) return;
    // On a cold load Drift renders before the first scan lands. Someone who
    // scrolled in the meantime has found what they wanted: a late jump would
    // pull them away from it.
    if (scrollOffsetOf(region) !== from) return;
    if (!viewTopVisible(region)) region.scrollIntoView?.({ block: "start" });
  }, [view, harness, layoutSettled]);

  return { view, setView, harness, drift, onDriftSummary: setDriftSummary, drawerRow, regionRef };
}

/** Whether the top VIEW_TOP_PX of `element` sits inside its scroll container and the window. */
function viewTopVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  let top = 0;
  let bottom = window.innerHeight;
  const container = scrollContainerOf(element);
  if (container) {
    const bounds = container.getBoundingClientRect();
    top = Math.max(top, bounds.top);
    bottom = Math.min(bottom, bounds.bottom);
  }
  return rect.top >= top && rect.top + Math.min(rect.height, VIEW_TOP_PX) <= bottom;
}

/** How far `element`'s scroll container (or the document) is scrolled. */
function scrollOffsetOf(element: HTMLElement): number {
  const container = scrollContainerOf(element);
  return container ? container.scrollTop : window.scrollY;
}

function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return parent;
  }
  return null;
}
