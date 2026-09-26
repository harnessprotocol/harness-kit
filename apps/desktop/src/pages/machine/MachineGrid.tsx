import { Fragment } from "react";
import { Store } from "lucide-react";
import type { GridCell, GridRow, MachineInventory, SurfaceId } from "@harness-kit/core";
import { surfaceLabel } from "../../lib/surface-labels";
import { KIND_LABELS, familyGroups, shortDigest } from "./machine-view-model";
import { CELL_VARIANTS, LEGEND_VARIANTS, rowCellVariants, type CellVariant } from "./cell-state";

/**
 * The cross-surface Machine grid: 11 surface columns grouped by product
 * family, resource rows grouped by kind, engine emission order preserved.
 * Pure presentational — all data comes from core's MachineInventory.
 */

/** Tooltip for a cell: provenance for present copies, an explanation otherwise. */
function cellTitle(cell: GridCell, kind: GridRow["kind"], variant: CellVariant): string {
  switch (variant) {
    case "present-user":
    case "present-project":
    case "differs":
      return cell.entries
        .map((entry) => `${shortDigest(entry.digest)} · ${entry.provenance.file} (${entry.scope})`)
        .join("\n");
    case "none":
      return `No concept of ${KIND_LABELS[kind] ?? kind}`;
    case "unmanaged":
      // Distinct from both "—" (no such concept) and blank (could hold this,
      // does not): the harness HAS the concept, but keeps no store HarnessKit
      // reads or writes here, so nothing can be copied in either direction.
      return `${KIND_LABELS[kind] ?? kind} are not managed locally on this surface — Harness Kit reads no store for them here, so this is not a gap.`;
    case "unknown":
      return "Needs confirmation — this surface is installed but its config store may be hidden (e.g. editor profiles), so presence can't be determined.";
    default:
      return CELL_VARIANTS[variant].label;
  }
}

function CellChip({
  cell,
  kind,
  variant,
}: {
  cell: GridCell;
  kind: GridRow["kind"];
  variant: CellVariant;
}) {
  const chip = CELL_VARIANTS[variant].chip;
  // absent — deliberately empty: the surface could hold this and does not.
  if (chip === null) return null;
  return (
    <span
      className="hk-cell"
      data-variant={variant}
      title={cellTitle(cell, kind, variant)}
      aria-label={variant === "unmanaged" ? "unmanaged locally" : undefined}
    >
      {chip}
    </span>
  );
}

/** Key to the chips, under the grid (AC-14). */
function GridLegend() {
  return (
    <div className="hk-grid-legend" data-testid="machine-grid-legend">
      {LEGEND_VARIANTS.map((variant) => (
        <span key={variant} className="hk-grid-legend-item">
          <span className="hk-cell" data-variant={variant} aria-hidden="true">
            {CELL_VARIANTS[variant].chip}
          </span>
          {CELL_VARIANTS[variant].label}
        </span>
      ))}
    </div>
  );
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
  // Registered plugin marketplaces per surface (AC-4). The badge is present
  // iff HarnessKit can READ this surface's marketplaces — so a badge reading
  // "0" means "we looked and there are none", while no badge at all means
  // "we cannot say". Collapsing those two into an absent badge would repeat
  // the absent/unknown mistake AC-2 exists to prevent.
  const marketplacesById = new Map(
    inventory.surfaces.map((surface) => [
      surface.id,
      surface.marketplacesReadable
        ? [...new Set(surface.marketplaces.map((m) => m.id))]
        : null,
    ]),
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
    <div>
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
                const marketplaces = marketplacesById.get(id) ?? null;
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
                      {marketplaces !== null && (
                        <span
                          data-testid={`surface-marketplaces-${id}`}
                          title={
                            marketplaces.length === 0
                              ? "no plugin marketplaces registered"
                              : `${marketplaces.length} plugin ${marketplaces.length === 1 ? "marketplace" : "marketplaces"}: ${marketplaces.join(", ")}`
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 14,
                            height: 14,
                            gap: 2,
                            padding: "0 3px",
                            borderRadius: 7,
                            background: "var(--bg-elevated)",
                            color: "var(--fg-muted)",
                            fontSize: 9,
                            fontWeight: 650,
                          }}
                        >
                          <Store size={11} strokeWidth={1.7} aria-hidden="true" />
                          {marketplaces.length}
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
              const variants = rowCellVariants(row, inventory.gaps, surfaceOrder);
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
                    role="button"
                    tabIndex={0}
                    aria-label={`${row.name} details`}
                    onClick={() => onRowClick(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }}
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
                          data-variant={variants[id]}
                          style={{
                            padding: "6px 8px",
                            textAlign: "center",
                            ...(detected ? {} : { opacity: 0.45 }),
                          }}
                        >
                          {row.cells[id] && (
                            <CellChip cell={row.cells[id]} kind={row.kind} variant={variants[id]} />
                          )}
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
      <GridLegend />
    </div>
  );
}
