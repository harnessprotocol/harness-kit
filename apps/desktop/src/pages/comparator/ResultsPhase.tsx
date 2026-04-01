import { useEffect, useState } from "react";
import type { FileDiffRow } from "@harness-kit/shared";
import type { ComparisonState } from "../../hooks/useComparator";
import { getComparisonDiffs, getComparison } from "../../lib/tauri";

// ── Types ────────────────────────────────────────────────────

export interface ResultsPhaseProps {
  active: ComparisonState;
  onStartJudge: () => void;
}

// ── Design Tokens ───────────────────────────────────────────

const tokens = {
  bgBase: "var(--bg-base)",
  bgSurface: "var(--bg-surface)",
  bgElevated: "var(--bg-elevated)",
  fgBase: "var(--fg-base)",
  fgMuted: "var(--fg-muted)",
  fgSubtle: "var(--fg-subtle)",
  fgPlaceholder: "var(--fg-placeholder)",
  borderBase: "var(--border-base)",
  borderStrong: "var(--border-strong)",
  borderSubtle: "var(--border-subtle)",
  separator: "var(--separator)",
  accent: "var(--accent)",
  accentLight: "var(--accent-light)",
  accentFg: "var(--accent-fg)",
  accentText: "var(--accent-text)",
  success: "var(--success)",
  successLight: "var(--success-light)",
  warning: "var(--warning)",
  warningLight: "var(--warning-light)",
  danger: "var(--danger)",
  dangerLight: "var(--danger-light)",
  hoverBg: "var(--hover-bg)",
};

// ── Fonts ───────────────────────────────────────────────────

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const monoStack = 'ui-monospace, "SF Mono", monospace';

// ── Harness accent palette (for timeline bars) ─────────────

const HARNESS_COLORS = [
  "#5b50e8", // indigo
  "#0891b2", // cyan
  "#d97706", // amber
  "#dc2626", // red
  "#16a34a", // green
  "#9333ea", // purple
  "#0d9488", // teal
  "#ea580c", // orange
];

// ── Styles ──────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    width: "100%",
    overflowY: "auto" as const,
    padding: "24px 28px",
    gap: 20,
    fontFamily: fontStack,
    background: tokens.bgBase,
  } as React.CSSProperties,

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  } as React.CSSProperties,

  title: {
    fontSize: 15,
    fontWeight: 600,
    color: tokens.fgBase,
    fontFamily: fontStack,
    margin: 0,
    lineHeight: 1.3,
  } as React.CSSProperties,

  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  } as React.CSSProperties,

  btnBordered: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 30,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: fontStack,
    color: tokens.fgMuted,
    background: tokens.bgElevated,
    border: `1px solid ${tokens.borderStrong}`,
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 150ms ease-out, border-color 150ms ease-out",
  } as React.CSSProperties,

  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 30,
    padding: "0 14px",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fontStack,
    color: "#ffffff",
    background: tokens.accent,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 150ms ease-out, transform 100ms ease-out",
  } as React.CSSProperties,

  // Section card
  sectionCard: {
    background: tokens.bgElevated,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 8,
    padding: 14,
    boxShadow: "var(--shadow-sm)",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: tokens.fgBase,
    fontFamily: fontStack,
    margin: "0 0 10px 0",
    textTransform: "uppercase" as const,
    letterSpacing: "0.3px",
  } as React.CSSProperties,

  // Table
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 12,
    fontFamily: fontStack,
  } as React.CSSProperties,

  th: {
    textAlign: "left" as const,
    padding: "7px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: tokens.fgSubtle,
    borderBottom: `1px solid ${tokens.borderStrong}`,
    fontFamily: fontStack,
    textTransform: "uppercase" as const,
    letterSpacing: "0.3px",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,

  td: {
    textAlign: "left" as const,
    padding: "7px 12px",
    fontSize: 12,
    color: tokens.fgBase,
    borderBottom: `1px solid ${tokens.borderSubtle}`,
    fontFamily: fontStack,
    verticalAlign: "middle" as const,
  } as React.CSSProperties,

  tdMono: {
    textAlign: "left" as const,
    padding: "7px 12px",
    fontSize: 12,
    color: tokens.fgBase,
    borderBottom: `1px solid ${tokens.borderSubtle}`,
    fontFamily: monoStack,
    verticalAlign: "middle" as const,
  } as React.CSSProperties,

  tdMetric: {
    textAlign: "left" as const,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 500,
    color: tokens.fgMuted,
    borderBottom: `1px solid ${tokens.borderSubtle}`,
    fontFamily: fontStack,
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,

  // Timeline
  timelineRow: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    height: 32,
    marginBottom: 6,
  } as React.CSSProperties,

  timelineLabel: {
    width: 110,
    minWidth: 110,
    fontSize: 12,
    fontWeight: 500,
    color: tokens.fgBase,
    fontFamily: fontStack,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    paddingRight: 10,
  } as React.CSSProperties,

  timelineBarArea: {
    flex: 1,
    height: 24,
    borderRadius: 4,
    overflow: "hidden",
    background: tokens.borderSubtle,
    position: "relative" as const,
  } as React.CSSProperties,

  // Empty / loading
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 12px",
    fontSize: 12,
    color: tokens.fgPlaceholder,
    fontFamily: fontStack,
  } as React.CSSProperties,
};

// ── Helpers ─────────────────────────────────────────────────

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "--";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function statusLabel(status: string, exitCode?: number): { text: string; color: string } {
  if (status === "completed" && (exitCode === 0 || exitCode == null)) {
    return { text: "Completed", color: tokens.success };
  }
  if (status === "completed" && exitCode !== 0) {
    return { text: "Completed", color: tokens.warning };
  }
  if (status === "failed") {
    return { text: "Failed", color: tokens.danger };
  }
  if (status === "running") {
    return { text: "Running", color: tokens.accent };
  }
  return { text: status, color: tokens.fgMuted };
}

/** Render star rating: filled stars in warning color, empty in subtle */
function renderRating(exitCode: number | undefined): React.ReactNode {
  // Heuristic: exit 0 = 4 stars, exit -1 (force-stopped) = 3 stars, other = 2 stars
  let filled = 3;
  if (exitCode === 0) filled = 4;
  else if (exitCode != null && exitCode > 0) filled = 2;

  const stars: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    stars.push(
      <span
        key={i}
        style={{
          color: i < filled ? tokens.warning : tokens.fgPlaceholder,
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        {i < filled ? "\u2605" : "\u2606"}
      </span>,
    );
  }
  return <span style={{ display: "inline-flex", gap: 1 }}>{stars}</span>;
}

/** Find the panel with the best (shortest) duration */
function bestDurationIdx(panels: ComparisonState["panels"]): number {
  let best = -1;
  let min = Infinity;
  for (let i = 0; i < panels.length; i++) {
    const d = panels[i].durationMs;
    if (d != null && d < min) {
      min = d;
      best = i;
    }
  }
  return best;
}

/** Build file matrix: filePath -> panelId -> changeType */
function buildFileMatrix(
  diffs: FileDiffRow[],
): { filePath: string; changes: Map<string, string> }[] {
  const fileMap = new Map<string, Map<string, string>>();

  for (const diff of diffs) {
    if (!fileMap.has(diff.filePath)) {
      fileMap.set(diff.filePath, new Map());
    }
    fileMap.get(diff.filePath)!.set(diff.panelId, diff.changeType);
  }

  // Sort by file path
  const sorted = Array.from(fileMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([filePath, changes]) => ({ filePath, changes }));
}

function changeTypeBadge(changeType: string): React.ReactNode {
  const isNew = changeType === "added" || changeType === "new" || changeType === "created";
  const isMod = changeType === "modified" || changeType === "mod" || changeType === "changed";
  const isDel = changeType === "deleted" || changeType === "removed";

  let label = changeType;
  let bg = tokens.borderSubtle;
  let fg = tokens.fgMuted;

  if (isNew) {
    label = "new";
    bg = tokens.successLight;
    fg = tokens.success;
  } else if (isMod) {
    label = "mod";
    bg = tokens.warningLight;
    fg = tokens.warning;
  } else if (isDel) {
    label = "del";
    bg = tokens.dangerLight;
    fg = tokens.danger;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: fontStack,
        color: fg,
        background: bg,
        padding: "1px 6px",
        borderRadius: 3,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: fg, fontSize: 11 }}>{isNew || isMod ? "\u2713" : "\u2212"}</span>
      {label}
    </span>
  );
}

// ── Export icon SVG ─────────────────────────────────────────

function ExportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
      <polyline points="8 2 8 10" />
      <polyline points="5 5 8 2 11 5" />
    </svg>
  );
}

// ── Judge icon SVG ──────────────────────────────────────────

function JudgeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8 5 8 8 10.5 9.5" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────

export default function ResultsPhase({ active, onStartJudge }: ResultsPhaseProps) {
  const [diffs, setDiffs] = useState<FileDiffRow[]>([]);
  const [diffsLoading, setDiffsLoading] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Trigger staggered entrance animation on mount
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Load diffs on mount / when active changes
  useEffect(() => {
    let cancelled = false;
    setDiffsLoading(true);

    getComparisonDiffs(active.id)
      .then((rows) => {
        if (!cancelled) setDiffs(rows);
      })
      .catch((err) => {
        console.error("Failed to load diffs:", err);
      })
      .finally(() => {
        if (!cancelled) setDiffsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active.id]);

  // ── Export handler ───────────────────────────────────────────

  const handleExport = async () => {
    try {
      const detail = await getComparison(active.id);
      const blob = new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comparison-${active.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export:", err);
    }
  };

  // ── Derived data ─────────────────────────────────────────────

  const { panels } = active;
  const bestDurIdx = bestDurationIdx(panels);
  const fileMatrix = buildFileMatrix(diffs);
  const maxDuration = Math.max(...panels.map((p) => p.durationMs ?? 0), 1);

  // ── Render ───────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* ── Section 1: Header ──────────────────────────────── */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          Results{active.title ? ` \u2014 ${active.title}` : ""}
        </h2>
        <div style={styles.actions}>
          <button
            style={styles.btnBordered}
            onClick={handleExport}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tokens.hoverBg;
              e.currentTarget.style.borderColor = tokens.borderStrong;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = tokens.bgElevated;
              e.currentTarget.style.borderColor = tokens.borderStrong;
            }}
          >
            <ExportIcon />
            Export JSON
          </button>
          <button
            style={styles.btnPrimary}
            onClick={onStartJudge}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tokens.accentFg;
              e.currentTarget.style.transform = "scale(0.98)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = tokens.accent;
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <JudgeIcon />
            Start Judge
          </button>
        </div>
      </div>

      {/* ── Section 2: Comparison Table ────────────────────── */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>Comparison</h3>
        <div style={{ overflowX: "auto" as const }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                {panels.map((p) => (
                  <th key={p.id} style={styles.th}>
                    {p.harnessName}
                    {p.model ? (
                      <span style={{ fontWeight: 400, color: tokens.fgPlaceholder, marginLeft: 4, fontSize: 10, textTransform: "none" as const, letterSpacing: 0 }}>
                        {p.model}
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Status row */}
              <tr
                onMouseEnter={() => setHoveredRow("status")}
                onMouseLeave={() => setHoveredRow(null)}
                style={hoveredRow === "status" ? { background: tokens.hoverBg } : undefined}
              >
                <td style={styles.tdMetric}>Status</td>
                {panels.map((p) => {
                  const s = statusLabel(p.status, p.exitCode);
                  return (
                    <td key={p.id} style={styles.td}>
                      <span style={{ color: s.color, fontWeight: 500 }}>{s.text}</span>
                      {p.status === "completed" && p.exitCode === 0 && (
                        <span style={{ marginLeft: 4, color: tokens.success, fontSize: 11 }}>{"\u2713"}</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Duration row */}
              <tr
                onMouseEnter={() => setHoveredRow("duration")}
                onMouseLeave={() => setHoveredRow(null)}
                style={hoveredRow === "duration" ? { background: tokens.hoverBg } : undefined}
              >
                <td style={styles.tdMetric}>Duration</td>
                {panels.map((p, i) => (
                  <td
                    key={p.id}
                    style={{
                      ...styles.tdMono,
                      color: i === bestDurIdx ? tokens.success : tokens.fgBase,
                      fontWeight: i === bestDurIdx ? 600 : 400,
                    }}
                  >
                    {formatDuration(p.durationMs)}
                  </td>
                ))}
              </tr>

              {/* Exit Code row */}
              <tr
                onMouseEnter={() => setHoveredRow("exit")}
                onMouseLeave={() => setHoveredRow(null)}
                style={hoveredRow === "exit" ? { background: tokens.hoverBg } : undefined}
              >
                <td style={styles.tdMetric}>Exit Code</td>
                {panels.map((p) => (
                  <td
                    key={p.id}
                    style={{
                      ...styles.tdMono,
                      color: p.exitCode === 0 ? tokens.success : p.exitCode != null ? tokens.danger : tokens.fgMuted,
                      fontWeight: 500,
                    }}
                  >
                    {p.exitCode != null ? p.exitCode : "--"}
                  </td>
                ))}
              </tr>

              {/* Rating row */}
              <tr
                onMouseEnter={() => setHoveredRow("rating")}
                onMouseLeave={() => setHoveredRow(null)}
                style={hoveredRow === "rating" ? { background: tokens.hoverBg } : undefined}
              >
                <td style={{ ...styles.tdMetric, borderBottom: "none" }}>Rating</td>
                {panels.map((p) => (
                  <td key={p.id} style={{ ...styles.td, borderBottom: "none" }}>
                    {renderRating(p.exitCode)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 3: File Change Matrix ──────────────────── */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>File Changes</h3>
        {diffsLoading ? (
          <div style={styles.emptyState}>Loading file diffs...</div>
        ) : fileMatrix.length === 0 ? (
          <div style={styles.emptyState}>No file changes recorded</div>
        ) : (
          <div style={{ overflowX: "auto" as const }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>File Path</th>
                  {panels.map((p) => (
                    <th key={p.id} style={{ ...styles.th, textAlign: "center" as const }}>
                      {p.harnessName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fileMatrix.map((row, rowIdx) => (
                  <tr
                    key={row.filePath}
                    onMouseEnter={() => setHoveredRow(`file-${rowIdx}`)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={hoveredRow === `file-${rowIdx}` ? { background: tokens.hoverBg } : undefined}
                  >
                    <td
                      style={{
                        ...styles.tdMono,
                        fontSize: 11,
                        maxWidth: 320,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                        borderBottom: rowIdx === fileMatrix.length - 1 ? "none" : styles.td.borderBottom,
                      }}
                      title={row.filePath}
                    >
                      {row.filePath}
                    </td>
                    {panels.map((p) => {
                      const ct = row.changes.get(p.id);
                      return (
                        <td
                          key={p.id}
                          style={{
                            ...styles.td,
                            textAlign: "center" as const,
                            borderBottom: rowIdx === fileMatrix.length - 1 ? "none" : styles.td.borderBottom,
                          }}
                        >
                          {ct ? (
                            changeTypeBadge(ct)
                          ) : (
                            <span style={{ color: tokens.fgPlaceholder, fontSize: 13 }}>{"\u2014"}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 4: Execution Timeline ──────────────────── */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>Execution Timeline</h3>
        {panels.length === 0 ? (
          <div style={styles.emptyState}>No panels to display</div>
        ) : (
          <div style={{ padding: "4px 0" }}>
            {panels.map((p, i) => {
              const duration = p.durationMs ?? 0;
              const pct = maxDuration > 0 ? (duration / maxDuration) * 100 : 0;
              const barColor = HARNESS_COLORS[i % HARNESS_COLORS.length];

              return (
                <div key={p.id} style={styles.timelineRow}>
                  <div style={styles.timelineLabel} title={p.harnessName}>
                    {p.harnessName}
                  </div>
                  <div style={styles.timelineBarArea}>
                    <div
                      style={{
                        position: "absolute" as const,
                        top: 0,
                        left: 0,
                        height: "100%",
                        width: mounted ? `${Math.max(pct, 2)}%` : "0%",
                        background: barColor,
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: pct > 20 ? "flex-end" : "flex-start",
                        paddingRight: pct > 20 ? 8 : 0,
                        paddingLeft: pct > 20 ? 0 : 8,
                        transition: `width 600ms ease-out ${i * 150}ms`,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: monoStack,
                          color: pct > 20 ? "#ffffff" : barColor,
                          whiteSpace: "nowrap" as const,
                          position: pct > 20 ? "relative" as const : "absolute" as const,
                          left: pct > 20 ? undefined : `calc(${Math.max(pct, 2)}% + 6px)`,
                        }}
                      >
                        {formatDuration(p.durationMs)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
