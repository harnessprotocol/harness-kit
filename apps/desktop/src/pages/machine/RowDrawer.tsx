import { useCallback, useEffect, useState } from "react";
import { Button } from "@harness-kit/ui";
import type { GridRow, MachineDiff, SurfaceId } from "@harness-kit/core";
import { surfaceLabel } from "../../lib/surface-labels";
import { KIND_LABELS, shortDigest } from "./machine-view-model";
import {
  applyCellActionViaTauri,
  buildCellAction,
  missingTargets,
  presentSources,
} from "./cell-actions";
import type { CellActionView } from "./cell-actions";

/**
 * Side drawer for one grid row: per-surface entries (scope + provenance),
 * cross-surface FieldDeltas rendered verbatim (paths are display-only per
 * core's contract), and the three sync actions (AC-11).
 */

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
  /** Re-scan after a successful apply so the grid reflects the write. */
  onApplied?: () => void;
}

export function RowDrawer({ row, diffs, onClose, onApplied }: RowDrawerProps) {
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

      <RowActions row={row} onApplied={onApplied} />
    </aside>
  );
}

/**
 * The three action surfaces for one row (AC-11, AC-28). The displayed CLI
 * string comes from core's own builder, so it is literally the string the CLI
 * parses rather than a second hand-written formatter that could drift.
 */
function RowActions({ row, onApplied }: { row: GridRow; onApplied?: () => void }) {
  const sources = presentSources(row);
  const targets = missingTargets(row);
  const [target, setTarget] = useState<SurfaceId | "">(targets[0] ?? "");
  const [view, setView] = useState<CellActionView | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmedLoss, setConfirmedLoss] = useState(false);

  const source = sources[0];

  useEffect(() => {
    setConfirmedLoss(false);
    setStatus(null);
    if (!source || !target) {
      setView(null);
      return;
    }
    let cancelled = false;
    buildCellAction(row, source, target as SurfaceId)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [row, source, target]);

  const copy = useCallback(async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setStatus(`${label} copied.`);
  }, []);

  const apply = useCallback(async () => {
    if (!view) return;
    setBusy(true);
    try {
      await applyCellActionViaTauri(view, confirmedLoss);
      setStatus("Applied.");
      onApplied?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [view, onApplied, confirmedLoss]);

  if (targets.length === 0 || !source) {
    return (
      <div style={{ marginTop: "auto", padding: "14px 18px 18px", fontSize: 12, opacity: 0.7 }}>
        {targets.length === 0
          ? "Present on every surface that supports it — nothing to sync."
          : "Not present on any surface — nothing to copy from."}
      </div>
    );
  }

  const lossBlocked = view?.plan.requiresConfirmation === true && !confirmedLoss;

  return (
    <div style={{ marginTop: "auto", padding: "14px 18px 18px", display: "grid", gap: 10 }}>
      <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
        <span style={{ opacity: 0.7 }}>Copy to</span>
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value as SurfaceId)}
          aria-label="Target surface"
        >
          {targets.map((id) => (
            <option key={id} value={id}>
              {surfaceLabel(id)}
            </option>
          ))}
        </select>
      </label>

      {view?.plan.carriesSecret && (
        <p style={{ fontSize: 12, margin: 0 }} data-testid="secret-badge">
          Contains a secret value, copied literally to this machine only.
        </p>
      )}

      {view?.plan.requiresConfirmation && (
        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={confirmedLoss}
            onChange={(event) => setConfirmedLoss(event.target.checked)}
            aria-label="Acknowledge capability loss"
          />
          <span>
            {surfaceLabel(target as SurfaceId)} cannot fully express this:{" "}
            {view.plan.loss?.losses.map((item) => item.detail).join("; ")}
          </span>
        </label>
      )}

      {view && !view.plan.supported && (
        <p style={{ fontSize: 12, margin: 0 }}>{view.plan.reason}</p>
      )}

      {view && (
        <code style={{ fontSize: 11, opacity: 0.8, wordBreak: "break-all" }}>{view.cli}</code>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button
          variant="primary"
          size="sm"
          disabled={!view || !view.plan.supported || view.plan.noop || lossBlocked || busy}
          onClick={apply}
        >
          {view?.plan.noop ? "Up to date" : "Apply"}
        </Button>
        <Button variant="ghost" size="sm" disabled={!view} onClick={() => view && copy(view.cli, "CLI command")}>
          Copy CLI command
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!view}
          onClick={() => view && copy(view.prompt, "Agent prompt")}
        >
          Copy prompt
        </Button>
      </div>

      {status && (
        <p style={{ fontSize: 12, margin: 0 }} role="status">
          {status}
        </p>
      )}
    </div>
  );
}
