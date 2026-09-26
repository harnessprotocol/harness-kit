import { useCallback, useState } from "react";
import type { GridRow } from "@harness-kit/core";
import { MachineGrid } from "../machine/MachineGrid";
import { MachineSummary, useMachineFilter } from "../machine/MachineSummary";
import { RowDrawer } from "../machine/RowDrawer";
import { MACHINE_FIXTURE_INVENTORY } from "./machine-fixture-data";

/**
 * Dev-only screenshot harness for the Machine grid — renders the grid,
 * totals strip, and row drawer with static fixture data so Playwright can
 * capture layout/CSS without a live Tauri/core backend. Not linked from any
 * nav; reachable only by direct URL, and only in dev builds (see App.tsx).
 */
export default function MachineFixture() {
  const inventory = MACHINE_FIXTURE_INVENTORY;
  const [selectedRow, setSelectedRow] = useState<GridRow | null>(
    inventory.rows.find((row) => row.key === "mcp-server:github") ?? null,
  );

  const clearSelection = useCallback(() => setSelectedRow(null), []);
  const { filter, setFilter, variants, shownRows } = useMachineFilter(
    inventory,
    selectedRow?.key ?? null,
    clearSelection,
  );

  return (
    <div className="hk-page" data-drawer-open={selectedRow ? "" : undefined}>
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Machine</h1>
          <p className="hk-page-subtitle">
            Every AI-harness resource on this machine, across all supported surfaces — read-only.
          </p>
        </div>
      </div>
      <MachineSummary
        inventory={inventory}
        variants={variants}
        filter={filter}
        shownCount={shownRows.length}
        onFilterChange={setFilter}
      />
      <div style={{ marginTop: 20 }}>
        <MachineGrid
          inventory={{ ...inventory, rows: shownRows }}
          variants={variants}
          selectedRowKey={selectedRow?.key ?? null}
          onRowClick={(row) => setSelectedRow(row)}
        />
      </div>
      {selectedRow && (
        <RowDrawer
          row={selectedRow}
          diffs={inventory.diffs.filter((diff) => diff.row === selectedRow.key)}
          gaps={inventory.gaps}
          surfaceOrder={inventory.surfaces.map((surface) => surface.id)}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
