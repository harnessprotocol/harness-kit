import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, EmptyState } from "@harness-kit/ui";
import { ChevronRight, ScanSearch } from "lucide-react";
import type { GridRow, MachineInventory } from "@harness-kit/core";
import { surfaceLabel } from "../../lib/surface-labels";
import { loadMachineInventory } from "./machine-data";
import { MachineGrid } from "./MachineGrid";
import {
  MachineFilterStatus,
  MachineSummary,
  useFilterFocusHandoff,
  useMachineFilter,
} from "./MachineSummary";
import { MACHINE_VIEW_PANEL_ID, MachineViewToggle, machineViewTabId } from "./MachineViewToggle";
import { useMachineView } from "./useMachineView";
import { RowDrawer } from "./RowDrawer";
import DriftPage from "../drift/DriftPage";

/**
 * Machine (Task 14): cross-surface inventory of this machine, whose row
 * drawer applies changes between surfaces. Defaults to machine-only
 * observation (no project directory) — picking a directory adds
 * project-scope stores to the scan.
 *
 * Two views share the page head and summary strip (spec AC-18, design D6):
 * the surface grid and Drift against harness.yaml, chosen by `?view=`
 * (legacy `?drift=1` still selects Drift). See useMachineView.
 */
export default function MachinePage() {
  const [inventory, setInventory] = useState<MachineInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectDir, setProjectDir] = useState("");
  const [selectedRow, setSelectedRow] = useState<GridRow | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [projectDegraded, setProjectDegraded] = useState(false);

  /**
   * `keepSelection` (after an apply) refreshes whatever row is selected WHEN
   * THE SCAN LANDS to the new inventory's row with the same key, closing the
   * drawer if that row is gone. Read at landing, not at the call: the user may
   * have closed the drawer or picked another row while the scan ran. Every
   * other caller starts over with nothing selected.
   *
   * Only the latest scan lands. Scans can overlap (Enter, Browse and Clear are
   * live while one runs, and an apply starts its own), and a slow older one
   * must not overwrite a newer result.
   */
  const loadSeq = useRef(0);
  const load = useCallback(async (dir: string, keepSelection = false) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    if (!keepSelection) setSelectedRow(null);
    try {
      const result = await loadMachineInventory(dir.trim() ? dir.trim() : null);
      if (seq !== loadSeq.current) return;
      setInventory(result.inventory);
      setProjectDegraded(result.projectDegraded);
      if (keepSelection) {
        setSelectedRow((current) =>
          current ? (result.inventory.rows.find((row) => row.key === current.key) ?? null) : null,
        );
      }
    } catch (err) {
      if (seq === loadSeq.current) setError(String(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDirectoryPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Select project directory" });
      if (selected && typeof selected === "string") {
        setProjectDir(selected);
        load(selected);
      }
    } catch {
      // dialog unavailable — typed path + Rescan still works
    }
  }

  const skippedSurfaces = useMemo(
    () => (inventory ? inventory.surfaces.filter((surface) => surface.skipped.length > 0) : []),
    [inventory],
  );
  const totalSkipped = skippedSurfaces.reduce((total, surface) => total + surface.skipped.length, 0);

  const clearSelection = useCallback(() => setSelectedRow(null), []);
  const { view, setView, drift, onDriftSummary, drawerRow, regionRef } = useMachineView({
    selectedRow,
    clearSelection,
    // The strip arrives with the first scan, above the view region.
    layoutSettled: !(loading && !inventory),
  });
  const { filter, setFilter, variants, shownRows } = useMachineFilter(
    inventory,
    selectedRow?.key ?? null,
    clearSelection,
  );
  // The grid's filter is not in force while Drift shows: no cell reads as
  // pressed, no status line claims a filter, and choosing Gaps or Differs
  // returns to the grid with that filter (useMachineFilter) in one URL update.
  const shownFilter = view === "grid" ? filter : "all";
  const { stripRef, changeFilter } = useFilterFocusHandoff(shownFilter, setFilter);

  const rowDiffs = useMemo(
    () =>
      inventory && selectedRow
        ? inventory.diffs.filter((diff) => diff.row === selectedRow.key)
        : [],
    [inventory, selectedRow],
  );

  return (
    // AC-19: while the drawer is open the page reserves its width (app.css),
    // so no grid column sits under it; the grid scrolls instead.
    <div className="hk-page" data-drawer-open={drawerRow ? "" : undefined}>
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Machine</h1>
          <p className="hk-page-subtitle">
            Every AI-harness resource on this machine, across all supported surfaces.
          </p>
        </div>
        <Button variant="primary" onClick={() => load(projectDir)} disabled={loading}>
          {loading ? "Scanning…" : "Refresh"}
        </Button>
      </div>

      {/* Project-directory picker — none by default (machine-only observation) */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", maxWidth: 560, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <Input
            type="text"
            value={projectDir}
            onChange={(event) => setProjectDir(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") load(projectDir);
            }}
            placeholder="Project directory (optional — machine-only without one)"
            style={{ fontFamily: "ui-monospace, monospace" }}
          />
        </div>
        <Button variant="ghost" onClick={openDirectoryPicker}>
          Browse…
        </Button>
        {projectDir && (
          <Button
            variant="ghost"
            onClick={() => {
              setProjectDir("");
              load("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {error && <div className="hk-page-error">Scan failed: {error}</div>}

      {projectDegraded && (
        <div
          data-testid="project-degraded-notice"
          style={{
            marginBottom: 12,
            padding: "6px 10px",
            borderRadius: 6,
            background: "var(--warning-light)",
            color: "var(--warning)",
            fontSize: 11.5,
          }}
        >
          Project directory could not be scanned — showing machine-only results.
        </div>
      )}

      {inventory && (
        <MachineSummary
          inventory={inventory}
          variants={variants}
          filter={shownFilter}
          onFilterChange={changeFilter}
          stripRef={stripRef}
          drift={drift}
        />
      )}

      {/* The tabs render here whether or not the strip has: before the first
          scan lands, after it fails (Drift does not need the inventory), and
          after. One tree position, so focus on them survives the strip
          arriving. */}
      <div ref={regionRef} data-testid="machine-view-region">
        <MachineViewToggle view={view} onChange={setView} />
        <section
          role="tabpanel"
          id={MACHINE_VIEW_PANEL_ID}
          aria-labelledby={machineViewTabId(view)}
        >
          {view === "drift" ? (
            /*
              AC-37 / AC-18: Drift is a view of Machine, rendered as the existing
              page rather than reimplemented. The M2 attempt to "absorb" Drift
              routed /drift at this view and DELETED the acknowledge/fix workflow,
              which is why it was reverted. Drift compares harness.yaml against
              compiled output; the grid compares surfaces against each other. Two
              different questions, one screen.

              Mounted only in this view, and that is behavioural rather than
              cosmetic: Drift scans project scopes on mount and asks Tauri to grant
              access to the project directory. The grid runs machine-only by
              default and must not trigger a directory-permission request the user
              did not ask for, so nothing about drift runs until someone picks this
              view.
            */
            <div style={{ marginTop: 20 }} data-testid="machine-drift-view">
              <DriftPage embedded onSummary={onDriftSummary} />
            </div>
          ) : (
            <>
              {inventory && (
                <MachineFilterStatus
                  filter={shownFilter}
                  shownCount={shownRows.length}
                  totalCount={inventory.rows.length}
                  onFilterChange={changeFilter}
                />
              )}
              {loading && !inventory && (
                <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-subtle)", fontSize: 12.5 }}>
                  Scanning this machine…
                </div>
              )}

              {inventory && (
                <>
                  {inventory.rows.length === 0 ? (
                    <div style={{ marginTop: 20 }}>
                      <EmptyState
                        icon={<ScanSearch size={28} strokeWidth={1.5} />}
                        title="Nothing observed"
                        description="No harness resources were found in this machine's config stores. Pick a project directory to include project-scope stores in the scan."
                      />
                    </div>
                  ) : (
                    <div style={{ marginTop: 20 }}>
                      <MachineGrid
                        inventory={{ ...inventory, rows: shownRows }}
                        variants={variants}
                        selectedRowKey={selectedRow?.key ?? null}
                        onRowClick={(row) => setSelectedRow(row)}
                      />
                    </div>
                  )}

                  {/* Skipped diagnostics — collapsible per-surface list */}
                  {totalSkipped > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <button
                        type="button"
                        className="hk-reset-btn"
                        data-testid="skipped-toggle"
                        onClick={() => setShowSkipped((visible) => !visible)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 10px",
                          borderRadius: 6,
                          background: "var(--bg-elevated)",
                          color: "var(--fg-muted)",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <ChevronRight
                          size={10}
                          strokeWidth={1.7}
                          aria-hidden="true"
                          style={{ transform: showSkipped ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}
                        />
                        Skipped diagnostics
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 16,
                            height: 16,
                            padding: "0 4px",
                            borderRadius: 8,
                            background: "var(--bg-base)",
                            color: "var(--warning, var(--fg-muted))",
                            fontSize: 9.5,
                            fontWeight: 650,
                          }}
                        >
                          {totalSkipped}
                        </span>
                      </button>

                      {showSkipped && (
                        <div
                          data-testid="skipped-list"
                          style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}
                        >
                          {skippedSurfaces.map((surface) => (
                            <div
                              key={surface.id}
                              style={{ padding: "8px 12px", borderRadius: 8, background: "var(--bg-elevated)" }}
                            >
                              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg-base)" }}>
                                {surfaceLabel(surface.id)}
                              </div>
                              {surface.skipped.map((entry, entryIndex) => (
                                <div
                                  key={entryIndex}
                                  style={{ marginTop: 3, fontSize: 10.5, color: "var(--fg-muted)" }}
                                >
                                  <span className="hk-table-mono" style={{ overflowWrap: "anywhere" }}>
                                    {entry.file}
                                  </span>
                                  {" — "}
                                  {entry.reason}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {drawerRow && (
        <RowDrawer
          row={drawerRow}
          diffs={rowDiffs}
          gaps={inventory?.gaps ?? []}
          surfaceOrder={inventory?.surfaces.map((surface) => surface.id) ?? []}
          onClose={() => setSelectedRow(null)}
          onApplied={() => load(projectDir, true)}
        />
      )}
    </div>
  );
}
