import { useCallback, useState } from "react";
import type { GridRow } from "@harness-kit/core";
import { MachineGrid } from "../machine/MachineGrid";
import {
  MachineFilterStatus,
  MachineSummary,
  useFilterFocusHandoff,
  useMachineFilter,
} from "../machine/MachineSummary";
import { MACHINE_VIEW_PANEL_ID, MachineViewToggle, machineViewTabId } from "../machine/MachineViewToggle";
import { useMachineView } from "../machine/useMachineView";
import { RowDrawer } from "../machine/RowDrawer";
import { DriftView } from "../drift/DriftView";
import { summarizeDrift } from "../drift/drift-data";
import { DRIFT_FIXTURE_ENTRIES } from "./drift-fixture-data";
import { MACHINE_FIXTURE_INVENTORY } from "./machine-fixture-data";

/** The Drift fixture's entries, summarised as if Drift had scanned them. */
const DRIFT_FIXTURE_SUMMARY = summarizeDrift(DRIFT_FIXTURE_ENTRIES, new Set());

/**
 * Dev-only screenshot harness for the Machine grid — renders the grid,
 * totals strip, and row drawer with static fixture data so Playwright can
 * capture layout/CSS without a live Tauri/core backend. `?view=drift` shows
 * the Drift view instead, from the Drift fixture's entries (the strip's
 * Drift cell counts them, as if Drift had scanned; `harness=` narrows both).
 * View switching, the Drift cell and the drawer rules come from
 * useMachineView, the page's own hook. Not linked from any nav; reachable
 * only by direct URL, and only in dev builds (see App.tsx).
 */
export default function MachineFixture() {
  const inventory = MACHINE_FIXTURE_INVENTORY;
  const [selectedRow, setSelectedRow] = useState<GridRow | null>(
    inventory.rows.find((row) => row.key === "mcp-server:github") ?? null,
  );
  const clearSelection = useCallback(() => setSelectedRow(null), []);
  const { view, setView, drift, drawerRow, regionRef, harness } = useMachineView({
    selectedRow,
    clearSelection,
    initialDriftSummary: DRIFT_FIXTURE_SUMMARY,
  });
  const { filter, setFilter, variants, shownRows } = useMachineFilter(
    inventory,
    selectedRow?.key ?? null,
    clearSelection,
  );
  const shownFilter = view === "grid" ? filter : "all";
  const { stripRef, changeFilter } = useFilterFocusHandoff(shownFilter, setFilter);
  const driftEntries = harness
    ? DRIFT_FIXTURE_ENTRIES.filter((entry) => entry.item.adapter === harness)
    : DRIFT_FIXTURE_ENTRIES;

  return (
    <div className="hk-page" data-drawer-open={drawerRow ? "" : undefined}>
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Machine</h1>
          <p className="hk-page-subtitle">
            Every AI-harness resource on this machine, across all supported surfaces.
          </p>
        </div>
      </div>
      <MachineSummary
        inventory={inventory}
        variants={variants}
        filter={shownFilter}
        onFilterChange={changeFilter}
        stripRef={stripRef}
        drift={drift}
      />
      <div ref={regionRef} data-testid="machine-view-region">
        <MachineViewToggle view={view} onChange={setView} />
        <section role="tabpanel" id={MACHINE_VIEW_PANEL_ID} aria-labelledby={machineViewTabId(view)}>
          {view === "drift" ? (
            <div style={{ marginTop: 20 }} data-testid="machine-drift-view">
              <DriftView
                embedded
                entries={DRIFT_FIXTURE_ENTRIES}
                filteredEntries={driftEntries}
                acknowledged={new Set()}
                loading={false}
                error={null}
                harnessFilter={harness}
                showAcknowledged={false}
                toasts={[]}
                onToggleShowAcknowledged={() => {}}
                onFixAll={() => {}}
                onFixOne={() => {}}
                onAcknowledge={() => {}}
                onUnacknowledge={() => {}}
                onRescan={() => {}}
                onDismissToast={() => {}}
              />
            </div>
          ) : (
            <>
              <MachineFilterStatus
                filter={shownFilter}
                shownCount={shownRows.length}
                totalCount={inventory.rows.length}
                onFilterChange={changeFilter}
              />
              <div style={{ marginTop: 20 }}>
                <MachineGrid
                  inventory={{ ...inventory, rows: shownRows }}
                  variants={variants}
                  selectedRowKey={selectedRow?.key ?? null}
                  onRowClick={(row) => setSelectedRow(row)}
                />
              </div>
            </>
          )}
        </section>
      </div>
      {drawerRow && (
        <RowDrawer
          row={drawerRow}
          diffs={inventory.diffs.filter((diff) => diff.row === drawerRow.key)}
          gaps={inventory.gaps}
          surfaceOrder={inventory.surfaces.map((surface) => surface.id)}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
