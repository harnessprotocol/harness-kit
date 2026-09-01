import { useState } from "react";
import { SummaryStrip, type SummaryCell } from "@harness-kit/ui";
import type { GridRow } from "@harness-kit/core";
import { MachineGrid } from "../machine/MachineGrid";
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

  const summaryCells: SummaryCell[] = [
    { id: "rows", label: "Resources", value: String(inventory.rows.length) },
    { id: "gaps", label: "Gaps", value: String(inventory.gaps.length), tone: "warning" },
    { id: "diffs", label: "Diffs", value: String(inventory.diffs.length), tone: "warning" },
    {
      id: "detected",
      label: "Surfaces detected",
      value: `${inventory.surfaces.filter((surface) => surface.detected).length}/${inventory.surfaces.length}`,
    },
  ];

  return (
    <div className="hk-page">
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Machine</h1>
          <p className="hk-page-subtitle">
            Every AI-harness resource on this machine, across all supported surfaces — read-only.
          </p>
        </div>
      </div>
      <SummaryStrip cells={summaryCells} />
      <div style={{ marginTop: 20 }}>
        <MachineGrid
          inventory={inventory}
          selectedRowKey={selectedRow?.key ?? null}
          onRowClick={(row) => setSelectedRow(row)}
        />
      </div>
      {selectedRow && (
        <RowDrawer
          row={selectedRow}
          diffs={inventory.diffs.filter((diff) => diff.row === selectedRow.key)}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
