import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, SummaryStrip, EmptyState, type SummaryCell } from "@harness-kit/ui";
import { ScanSearch } from "lucide-react";
import type { GridRow, MachineInventory } from "@harness-kit/core";
import { surfaceLabel } from "../../lib/surface-labels";
import { loadMachineInventory } from "./machine-data";
import { MachineGrid } from "./MachineGrid";
import { RowDrawer } from "./RowDrawer";
import DriftPage from "../drift/DriftPage";

/**
 * Machine view (Task 14): read-only cross-surface inventory of this
 * machine. Defaults to machine-only observation (no project directory) —
 * picking a directory adds project-scope stores to the scan.
 */
export default function MachinePage() {
  const [inventory, setInventory] = useState<MachineInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectDir, setProjectDir] = useState("");
  // Arriving from the retired /drift route (or the sidebar's Drift entry)
  // opens the section: redirecting someone to a collapsed accordion is the
  // same as losing the page they asked for.
  //
  // An effect, NOT a useState initializer. React Router does not remount this
  // component when only the search string changes, so an initializer opened
  // the section on a cold load of /machine?drift=1 and did nothing on the
  // common path — clicking Drift in the sidebar while already on Machine.
  const [searchParams] = useSearchParams();
  const driftRequested = searchParams.get("drift") === "1";
  const [driftOpen, setDriftOpen] = useState(driftRequested);
  const driftSectionRef = useRef<HTMLElement | null>(null);
  const driftScrollPending = useRef(false);
  useEffect(() => {
    // Opens on request; never force-closes, so a user who opened the section
    // by hand does not lose it by navigating within Machine.
    if (driftRequested) {
      setDriftOpen(true);
      driftScrollPending.current = true;
    }
  }, [driftRequested]);
  useEffect(() => {
    // Scroll only after the scan above has rendered, otherwise the grid
    // appears afterwards and pushes the section back below the fold.
    if (!driftScrollPending.current || loading) return;
    driftScrollPending.current = false;
    driftSectionRef.current?.scrollIntoView?.({ block: "start" });
  }, [loading]);
  const [selectedRow, setSelectedRow] = useState<GridRow | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [projectDegraded, setProjectDegraded] = useState(false);

  const load = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    setSelectedRow(null);
    try {
      const result = await loadMachineInventory(dir.trim() ? dir.trim() : null);
      setInventory(result.inventory);
      setProjectDegraded(result.projectDegraded);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
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

  const summaryCells: SummaryCell[] = inventory
    ? [
        { id: "rows", label: "Resources", value: String(inventory.rows.length) },
        {
          id: "gaps",
          label: "Gaps",
          value: String(inventory.gaps.length),
          tone: inventory.gaps.length > 0 ? "warning" : "default",
        },
        {
          id: "diffs",
          label: "Diffs",
          value: String(inventory.diffs.length),
          tone: inventory.diffs.length > 0 ? "warning" : "default",
        },
        {
          id: "detected",
          label: "Surfaces detected",
          value: `${inventory.surfaces.filter((surface) => surface.detected).length}/${inventory.surfaces.length}`,
        },
      ]
    : [];

  const rowDiffs = useMemo(
    () =>
      inventory && selectedRow
        ? inventory.diffs.filter((diff) => diff.row === selectedRow.key)
        : [],
    [inventory, selectedRow],
  );

  return (
    <div className="hk-page">
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Machine</h1>
          <p className="hk-page-subtitle">
            Every AI-harness resource on this machine, across all supported surfaces — read-only.
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

      {loading && !inventory && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-subtle)", fontSize: 12.5 }}>
          Scanning this machine…
        </div>
      )}

      {inventory && (
        <>
          <SummaryStrip cells={summaryCells} />

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
                inventory={inventory}
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
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    transform: showSkipped ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s ease",
                    fontSize: 9,
                  }}
                >
                  ▶
                </span>
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

      {/*
        AC-37: Drift lives here now. Rendered as the existing page rather than
        reimplemented — the M2 attempt to "absorb" Drift routed /drift at this
        view and DELETED the acknowledge/fix workflow, which is why it was
        reverted. Drift compares harness.yaml against compiled output; the grid
        above compares surfaces against each other. Two different questions, one
        screen.
      */}
      <section ref={driftSectionRef} style={{ marginTop: 28 }} data-testid="machine-drift-section">
        <button
          type="button"
          onClick={() => setDriftOpen((open) => !open)}
          aria-expanded={driftOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "inherit",
            fontSize: 13,
            fontWeight: 650,
            color: "var(--fg)",
          }}
        >
          <span aria-hidden="true" style={{ opacity: 0.6 }}>{driftOpen ? "▾" : "▸"}</span>
          Drift from harness.yaml
        </button>
        {/*
          Mounted only when opened, and that is behavioural rather than
          cosmetic: Drift scans project scopes on mount and asks Tauri to grant
          access to the project directory. The Machine view runs machine-only
          by default and must not trigger a directory-permission request the
          user did not ask for, so its own load behaviour stays unchanged
          until someone opens this.
        */}
        {driftOpen && <DriftPage embedded />}
      </section>

      {selectedRow && (
        <RowDrawer
          row={selectedRow}
          diffs={rowDiffs}
          gaps={inventory?.gaps ?? []}
          onClose={() => setSelectedRow(null)}
          onApplied={() => load(projectDir)}
        />
      )}
    </div>
  );
}
