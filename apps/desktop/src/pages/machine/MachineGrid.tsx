import { Fragment } from "react";
import type { GridCell, GridRow, MachineInventory, SurfaceId } from "@harness-kit/core";
import { surfaceLabel } from "../../lib/surface-labels";
import { KIND_LABELS, familyGroups, shortDigest } from "./machine-view-model";

/**
 * The cross-surface Machine grid: 11 surface columns grouped by product
 * family, resource rows grouped by kind, engine emission order preserved.
 * Pure presentational — all data comes from core's MachineInventory.
 */

function CellContent({ cell, kind }: { cell: GridCell; kind: GridRow["kind"] }) {
  if (cell.status === "not-applicable") {
    return (
      <span
        title={`No concept of ${KIND_LABELS[kind] ?? kind}`}
        style={{ color: "var(--fg-subtle)", opacity: 0.55, fontSize: 12 }}
      >
        —
      </span>
    );
  }
  if (cell.status === "unknown") {
    return (
      <span
        title="Needs confirmation — this surface is installed but its config store may be hidden (e.g. editor profiles), so presence can't be determined."
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: 5,
          background: "var(--bg-elevated)",
          color: "var(--fg-muted)",
          fontSize: 10,
          fontWeight: 650,
        }}
      >
        ?
      </span>
    );
  }
  if (cell.status === "present") {
    const winner =
      cell.entries.find((entry) => entry.digest === cell.effectiveDigest) ?? cell.entries[0];
    const tooltip = cell.entries
      .map((entry) => `${shortDigest(entry.digest)} · ${entry.provenance.file} (${entry.scope})`)
      .join("\n");
    return (
      <span
        title={tooltip}
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 5px color-mix(in srgb, var(--accent) 55%, transparent)",
            flexShrink: 0,
          }}
        />
        <span
          className="hk-table-mono"
          style={{ fontSize: 9.5, color: "var(--fg-subtle)", lineHeight: 1 }}
        >
          {winner?.scope === "project" ? "p" : "u"}
        </span>
      </span>
    );
  }
  // absent — deliberately empty
  return null;
}

export interface MachineGridProps {
  inventory: MachineInventory;
  selectedRowKey: string | null;
  onRowClick: (row: GridRow) => void;
}

export function MachineGrid({ inventory, selectedRowKey, onRowClick }: MachineGridProps) {
  const groups = familyGroups(inventory.surfaces);
  const surfaceOrder: SurfaceId[] = inventory.surfaces.map((surface) => surface.id);
  const detectedById = new Map(inventory.surfaces.map((surface) => [surface.id, surface.detected]));
  const skippedById = new Map(
    inventory.surfaces.map((surface) => [surface.id, surface.skipped.length]),
  );

  const headCellStyle: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: 10.5,
    fontWeight: 600,
    color: "var(--fg-muted)",
    textAlign: "center",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        data-testid="machine-grid"
        style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}
      >
        <thead>
          {/* Product-family group header row */}
          <tr>
            <th aria-hidden="true" style={{ padding: 0 }} />
            {groups.map((group) => (
              <th
                key={group.family}
                colSpan={group.surfaces.length}
                scope="colgroup"
                data-testid={`family-group-${group.family}`}
                style={{
                  padding: "4px 8px",
                  fontSize: 9.5,
                  fontWeight: 650,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--fg-subtle)",
                  textAlign: "center",
                }}
              >
                {group.family}
              </th>
            ))}
          </tr>
          {/* Surface column header row */}
          <tr>
            <th
              scope="col"
              style={{ ...headCellStyle, textAlign: "left", minWidth: 180 }}
            >
              Resource
            </th>
            {surfaceOrder.map((id) => {
              const detected = detectedById.get(id) ?? false;
              const skipped = skippedById.get(id) ?? 0;
              return (
                <th
                  key={id}
                  scope="col"
                  data-testid={`surface-col-${id}`}
                  data-detected={detected ? "true" : "false"}
                  style={{ ...headCellStyle, ...(detected ? {} : { opacity: 0.45 }) }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {surfaceLabel(id)}
                    {skipped > 0 && (
                      <span
                        title={`${skipped} skipped ${skipped === 1 ? "entry" : "entries"} — see diagnostics below`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 14,
                          height: 14,
                          padding: "0 3px",
                          borderRadius: 7,
                          background: "var(--bg-elevated)",
                          color: "var(--warning, var(--fg-muted))",
                          fontSize: 9,
                          fontWeight: 650,
                        }}
                      >
                        {skipped}
                      </span>
                    )}
                  </span>
                  {!detected && (
                    <div
                      style={{
                        fontSize: 8.5,
                        fontWeight: 500,
                        color: "var(--fg-subtle)",
                        marginTop: 1,
                      }}
                    >
                      not installed
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {inventory.rows.map((row, index) => {
            const previous = index > 0 ? inventory.rows[index - 1] : null;
            const newKind = !previous || previous.kind !== row.kind;
            const selected = row.key === selectedRowKey;
            return (
              <Fragment key={row.key}>
                {newKind && (
                  <tr>
                    <td
                      colSpan={surfaceOrder.length + 1}
                      style={{
                        padding: "12px 8px 4px",
                        fontSize: 10,
                        fontWeight: 650,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "var(--fg-subtle)",
                      }}
                    >
                      {KIND_LABELS[row.kind] ?? row.kind}
                    </td>
                  </tr>
                )}
                <tr
                  data-testid={`machine-row-${row.key}`}
                  onClick={() => onRowClick(row)}
                  style={{
                    cursor: "pointer",
                    background: selected ? "var(--bg-elevated)" : "transparent",
                    borderRadius: 6,
                  }}
                >
                  <td
                    style={{
                      padding: "6px 8px",
                      fontSize: 12.5,
                      color: "var(--fg-base)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 260,
                    }}
                  >
                    {row.name}
                  </td>
                  {surfaceOrder.map((id) => {
                    const detected = detectedById.get(id) ?? false;
                    return (
                      <td
                        key={id}
                        data-testid={`cell-${row.key}-${id}`}
                        data-status={row.cells[id]?.status}
                        style={{
                          padding: "6px 8px",
                          textAlign: "center",
                          ...(detected ? {} : { opacity: 0.45 }),
                        }}
                      >
                        {row.cells[id] && <CellContent cell={row.cells[id]} kind={row.kind} />}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
