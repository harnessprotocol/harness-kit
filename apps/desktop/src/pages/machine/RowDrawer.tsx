import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@harness-kit/ui";
import { ArrowRight, X } from "lucide-react";
import type { GridRow, MachineDiff, MachineGap, SurfaceId } from "@harness-kit/core";
import { surfaceLabel } from "../../lib/surface-labels";
import { useToast } from "../../components/ToastProvider";
import { KIND_LABELS, shortDigest } from "./machine-view-model";
import {
  applyCellActionViaTauri,
  buildCellAction,
  divergentTargets,
  missingTargets,
  presentSources,
} from "./cell-actions";
import type { CellActionView } from "./cell-actions";
import { rowBaselineSource } from "./cell-state";

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
  /** The engine's gaps for this inventory — what is actually closable. */
  gaps: MachineGap[];
  /** The grid's column order: orders the selects and breaks baseline ties. */
  surfaceOrder: SurfaceId[];
  onClose: () => void;
  /** Re-scan after a successful apply so the grid reflects the write. */
  onApplied?: () => void;
}

export function RowDrawer({ row, diffs, gaps, surfaceOrder, onClose, onApplied }: RowDrawerProps) {
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
        width: "var(--hk-drawer-width)",
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
          }}
        >
          <X size={13} strokeWidth={1.7} aria-hidden="true" />
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

      {/* Keyed by row: another row's source and target choices must not carry over. */}
      <RowActions
        key={row.key}
        row={row}
        gaps={gaps}
        surfaceOrder={surfaceOrder}
        onApplied={onApplied}
      />
    </aside>
  );
}

/** `ids` in `order`; ids `order` does not name keep their relative order at the end. */
function inSurfaceOrder(ids: SurfaceId[], order: SurfaceId[]): SurfaceId[] {
  const rank = (id: SurfaceId) => {
    const index = order.indexOf(id);
    return index === -1 ? order.length : index;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

const selectStyle = { minWidth: 0 } as const;

/**
 * The three action surfaces for one row (AC-11, AC-28). The displayed CLI
 * string comes from core's own builder, so it is literally the string the CLI
 * parses rather than a second hand-written formatter that could drift.
 */
function RowActions({
  row,
  gaps,
  surfaceOrder,
  onApplied,
}: {
  row: GridRow;
  gaps: MachineGap[];
  surfaceOrder: SurfaceId[];
  onApplied?: () => void;
}) {
  const sources = inSurfaceOrder(presentSources(row), surfaceOrder);
  // AC-15: default to the copy holding the row's baseline digest, the one the
  // grid does NOT mark "differs". The first present surface can be the odd
  // one out, and copying from it would spread the outlier.
  const defaultSource = rowBaselineSource(row, surfaceOrder) ?? sources[0];
  // Choices are derived, not synced by effects: a stored pick that is no
  // longer valid (a rescan changed the row, or a new source changed the
  // target list) falls back to the default on the same render.
  const [chosenSource, setSource] = useState<SurfaceId | null>(null);
  const source =
    chosenSource !== null && sources.includes(chosenSource) ? chosenSource : defaultSource;
  // Engine gaps, not raw "absent" cells: a target that cannot receive this
  // resource (a plugin from a marketplace it has not registered) is absent
  // but not offerable.
  // Gap targets (nothing there) and diff targets (something different there)
  // are different actions: the second replaces content, so it is listed
  // separately and gated on an explicit acknowledgement below.
  const gapTargets = inSurfaceOrder(missingTargets(row, gaps), surfaceOrder);
  const diffTargets =
    source === undefined ? [] : inSurfaceOrder(divergentTargets(row, source), surfaceOrder);
  const targets = [...gapTargets, ...diffTargets];
  const [chosenTarget, setTarget] = useState<SurfaceId | null>(null);
  const target: SurfaceId | "" =
    chosenTarget !== null && targets.includes(chosenTarget) ? chosenTarget : (targets[0] ?? "");
  // Whether ANY source has something to copy. A source whose digest is
  // unknown has no diff targets of its own; picking it must not replace the
  // selects with "nothing to sync" and strand the user without a way back.
  const anyTargets =
    gapTargets.length > 0 || sources.some((id) => divergentTargets(row, id).length > 0);
  const [view, setView] = useState<CellActionView | null>(null);
  const sourceId = useId();
  const targetId = useId();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmedLoss, setConfirmedLoss] = useState(false);
  const [spent, setSpent] = useState(false);

  useEffect(() => {
    setConfirmedLoss(false);
    setStatus(null);
    // Drop the old plan first: planning does file I/O, and until it resolves
    // Apply must not run the previous from → to pair under the new selects.
    setView(null);
    setSpent(false);
    if (!source || !target) return;
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

  const toast = useToast();
  const apply = useCallback(async () => {
    if (!view) return;
    setBusy(true);
    try {
      const applied = await applyCellActionViaTauri(view, confirmedLoss);
      setStatus(
        applied.ledgerError
          ? `Applied, but this change was not added to the rollback list (${applied.ledgerError}). The backup is still on disk.`
          : "Applied.",
      );
      // The rescan below replaces this row and clears the status line, so
      // the toast is what the user sees (AC-16). Named from the request that
      // ran, not the selects, which the rescan may re-default.
      const title = `Copied ${view.request.name} to ${surfaceLabel(view.request.to)}`;
      toast(
        applied.ledgerError
          ? {
              title,
              message: `Not added to the rollback list (${applied.ledgerError}). The backup is still on disk.`,
              variant: "warning",
            }
          : { title, variant: "success" },
      );
      // Spent: the drawer stays open through the rescan, and a second click
      // on this plan would write again. Apply stays off until the rescanned
      // row rebuilds the plan; the CLI and prompt stay usable, including when
      // the rescan fails and the row never changes.
      setSpent(true);
      setConfirmedLoss(false);
      onApplied?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [view, onApplied, confirmedLoss, toast]);

  if (!anyTargets || !source) {
    return (
      <div style={{ marginTop: "auto", padding: "14px 18px 18px", fontSize: 12, opacity: 0.7 }}>
        {!anyTargets
          ? "Present on every surface that supports it — nothing to sync."
          : "Not present on any surface — nothing to copy from."}
      </div>
    );
  }

  const lossBlocked = view?.plan.requiresConfirmation === true && !confirmedLoss;
  /**
   * A plugin plan is `supported: true` — core CAN plan it, and the CLI can run
   * it. The APP cannot: driving an installer needs a process-spawn bridge the
   * webview does not have. Without this the button was live, threw on click,
   * and showed its reason only after failing.
   */
  const appCannotRun = view?.plan.plugin !== undefined;

  return (
    <div style={{ marginTop: "auto", padding: "14px 18px 18px", display: "grid", gap: 10 }}>
      {/* AC-15: from → to. The source stays a select (disabled) when there is
          only one, so the row does not change shape between rows. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          alignItems: "end",
          gap: 8,
          fontSize: 12,
        }}
      >
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <label className="hk-label" htmlFor={sourceId}>
            From
          </label>
          <select
            id={sourceId}
            value={source}
            onChange={(event) => setSource(event.target.value as SurfaceId)}
            disabled={sources.length < 2}
            className="hk-select"
            style={selectStyle}
          >
            {sources.map((id) => (
              <option key={id} value={id}>
                {surfaceLabel(id)}
              </option>
            ))}
          </select>
        </div>
        <ArrowRight
          size={13}
          strokeWidth={1.7}
          aria-hidden="true"
          style={{ color: "var(--fg-subtle)", marginBottom: 10 }}
        />
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <label className="hk-label" htmlFor={targetId}>
            To
          </label>
          <select
            id={targetId}
            value={target}
            onChange={(event) => setTarget(event.target.value as SurfaceId)}
            disabled={targets.length === 0}
            className="hk-select"
            style={selectStyle}
          >
            {targets.length === 0 && <option value="">Nothing differs from this source</option>}
            {gapTargets.length > 0 && diffTargets.length > 0 ? (
              <>
                <optgroup label="Missing">
                  {gapTargets.map((id) => (
                    <option key={id} value={id}>
                      {surfaceLabel(id)}
                    </option>
                  ))}
                </optgroup>
                {/* Replaces content: the overwrite acknowledgement below applies. */}
                <optgroup label="Has a different version">
                  {diffTargets.map((id) => (
                    <option key={id} value={id}>
                      {surfaceLabel(id)}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              targets.map((id) => (
                <option key={id} value={id}>
                  {surfaceLabel(id)}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

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
            aria-label={
              view.plan.overwrites === undefined
                ? "Acknowledge capability loss"
                : "Acknowledge overwriting the target's version"
            }
          />
          {view.plan.overwrites === undefined ? (
            <span>
              {surfaceLabel(target as SurfaceId)} cannot fully express this:{" "}
              {view.plan.loss?.losses.map((item) => item.detail).join("; ")}
            </span>
          ) : (
            // AC-11 diff case. The target already has this resource with
            // different content; naming each field is the whole point — the
            // action was deferred from M2 because a one-click copy would
            // silently pick a winner.
            <span data-testid="overwrite-warning">
              {surfaceLabel(target as SurfaceId)} already has this. Applying replaces its
              version:{" "}
              {view.plan.overwrites
                .map((delta) => `${delta.path} (${delta.kind})`)
                .join(", ")}
            </span>
          )}
        </label>
      )}

      {view && !view.plan.supported && (
        <p style={{ fontSize: 12, margin: 0 }}>{view.plan.reason}</p>
      )}

      {view && view.plan.supported && appCannotRun && (
        <p style={{ fontSize: 12, margin: 0 }} data-testid="app-cannot-run">
          Installing a plugin runs {surfaceLabel(target as SurfaceId)}&apos;s own installer, which
          the app cannot do yet. Copy the CLI command below, or use the agent prompt.
        </p>
      )}

      {view && (
        <code style={{ fontSize: 11, opacity: 0.8, wordBreak: "break-all" }}>{view.cli}</code>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button
          variant="primary"
          size="sm"
          disabled={
            !view ||
            !view.plan.supported ||
            view.plan.noop ||
            lossBlocked ||
            busy ||
            spent ||
            appCannotRun
          }
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
