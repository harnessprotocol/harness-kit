import { useEffect } from "react";
import { Button } from "@harness-kit/ui";
import type { GridRow, MachineDiff } from "@harness-kit/core";
import { surfaceLabel } from "../../lib/surface-labels";
import { KIND_LABELS, shortDigest } from "./machine-view-model";

/**
 * Side drawer for one grid row: per-surface entries (scope + provenance),
 * cross-surface FieldDeltas rendered verbatim (paths are display-only per
 * core's contract), and the M2 sync actions rendered disabled.
 */

const M2_TOOLTIP = "Sync arrives in M2";

function renderValue(value: unknown): string {
  if (value === undefined) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface RowDrawerProps {
  row: GridRow;
  diffs: MachineDiff[];
  onClose: () => void;
}

export function RowDrawer({ row, diffs, onClose }: RowDrawerProps) {
  const presentSurfaces = Object.entries(row.cells).filter(
    ([, cell]) => cell.status === "present",
  );

  // Escape closes the drawer.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside
      data-testid="machine-row-drawer"
      aria-label={`${row.name} details`}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-surface)",
        boxShadow: "-12px 0 32px rgba(0,0,0,0.28)",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 18px 12px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 650,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--fg-subtle)",
            }}
          >
            {KIND_LABELS[row.kind] ?? row.kind}
          </div>
          <h2
            style={{
              margin: "2px 0 0",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.2px",
              color: "var(--fg-base)",
              overflowWrap: "anywhere",
            }}
          >
            {row.name}
          </h2>
        </div>
        <button
          type="button"
          className="hk-reset-btn"
          onClick={onClose}
          aria-label="Close details"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-elevated)",
            color: "var(--fg-muted)",
            cursor: "pointer",
            flexShrink: 0,
            fontSize: 13,
          }}
        >
          ×
        </button>
      </div>

      {/* Per-surface entries */}
      <div style={{ padding: "0 18px 14px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 650,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--fg-subtle)",
            marginBottom: 6,
          }}
        >
          Where it lives
        </div>
        {presentSurfaces.length === 0 && (
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--fg-muted)" }}>
            Not present on any detected surface.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {presentSurfaces.map(([surfaceId, cell]) => (
            <div
              key={surfaceId}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                background: "var(--bg-elevated)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-base)" }}>
                {surfaceLabel(surfaceId as Parameters<typeof surfaceLabel>[0])}
              </div>
              {cell.entries.map((entry, entryIndex) => (
                <div
                  key={entryIndex}
                  style={{
                    marginTop: 3,
                    fontSize: 10.5,
                    color: "var(--fg-muted)",
                    display: "flex",
                    gap: 6,
                    alignItems: "baseline",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="hk-table-mono"
                    style={{ color: "var(--accent-text)", fontSize: 9.5 }}
                  >
                    {entry.scope}
                  </span>
                  <span
                    className="hk-table-mono"
                    style={{ overflowWrap: "anywhere", fontSize: 10 }}
                  >
                    {entry.provenance.file}
                  </span>
                  <span className="hk-table-mono" style={{ color: "var(--fg-subtle)", fontSize: 9.5 }}>
                    {shortDigest(entry.digest)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Cross-surface differences */}
      {diffs.length > 0 && (
        <div style={{ padding: "0 18px 14px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 650,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--fg-subtle)",
              marginBottom: 6,
            }}
          >
            Differences
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {diffs.map((diff, diffIndex) => (
              <div
                key={diffIndex}
                data-testid="machine-diff"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--bg-elevated)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-base)" }}>
                  {surfaceLabel(diff.surfaces[0])} vs {surfaceLabel(diff.surfaces[1])}
                </div>
                <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                  {diff.delta.map((delta, deltaIndex) => (
                    <div key={deltaIndex} style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                      <span className="hk-table-mono" style={{ color: "var(--fg-base)" }}>
                        {delta.path}
                      </span>{" "}
                      <span style={{ color: "var(--fg-subtle)" }}>({delta.kind})</span>
                      <div
                        className="hk-table-mono"
                        style={{ color: "var(--fg-muted)", fontSize: 10, overflowWrap: "anywhere" }}
                      >
                        {renderValue(delta.left)} → {renderValue(delta.right)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* M2 actions — rendered disabled */}
      <div
        style={{
          marginTop: "auto",
          padding: "14px 18px 18px",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span title={M2_TOOLTIP}>
          <Button variant="primary" size="sm" disabled>
            Apply
          </Button>
        </span>
        <span title={M2_TOOLTIP}>
          <Button variant="ghost" size="sm" disabled>
            Copy CLI command
          </Button>
        </span>
        <span title={M2_TOOLTIP}>
          <Button variant="ghost" size="sm" disabled>
            Copy prompt
          </Button>
        </span>
      </div>
    </aside>
  );
}
