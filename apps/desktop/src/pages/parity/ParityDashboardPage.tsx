import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { HarnessInfo } from "@harness-kit/shared";
import type { TargetPlatform } from "@harness-kit/core";
import {
  detectHarnesses,
  runParityScan,
  getParityDrift,
  acknowledgeDrift,
  createConfigFile,
  addToParityBaseline,
  probeHarnessCapabilities,
} from "../../lib/tauri";
import type { ParityDriftItem } from "../../lib/tauri";
import {
  CAPABILITIES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  isNew,
  isSelectable,
} from "./capability-catalog";
import type { Capability, CapabilityCategory } from "./capability-catalog";
import { deepLinkForVersion } from "./deep-link";
import { useParitySelection } from "./useParitySelection";
import { FeatureDetailDrawer } from "./FeatureDetailDrawer";
import { BatchActionBar } from "./BatchActionBar";
import { HarnessColumnMenu } from "./HarnessColumnMenu";

const RECENT_DIRS_KEY = "harness-kit-sync-recent-dirs";

function getLastProjectDir(): string {
  try {
    const dirs = JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) ?? "[]");
    return Array.isArray(dirs) && typeof dirs[0] === "string" ? dirs[0] : "";
  } catch {
    return "";
  }
}

function relativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function absoluteTime(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Drift row (for "What's changed" panel) ────────────────────

const DRIFT_CATEGORY_COLORS: Record<string, string> = {
  config_file: "#16a34a",
  settings_key: "#0d9488",
  cli_flag: "#2563eb",
  cli_subcommand: "#64748b",
  mcp_transport: "#7c3aed",
  mcp_server: "#64748b",
  plugin_type: "#ea580c",
};

const DRIFT_CATEGORY_LABELS: Record<string, string> = {
  config_file: "Config",
  settings_key: "Settings",
  cli_flag: "CLI Flag",
  cli_subcommand: "CLI Subcommand",
  mcp_transport: "MCP Transport",
  mcp_server: "MCP Server",
  plugin_type: "Plugin",
};

interface DriftRowProps {
  item: ParityDriftItem;
  onAcknowledge: (id: number) => void;
  onRescan: () => void;
  navigate: ReturnType<typeof useNavigate>;
}

function DriftRow({ item, onAcknowledge, onRescan, navigate }: DriftRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  const color = DRIFT_CATEGORY_COLORS[item.category] ?? "#64748b";
  const categoryLabel = DRIFT_CATEGORY_LABELS[item.category] ?? item.category;

  async function runAction(fn: () => Promise<unknown>) {
    setActing(true);
    setActError(null);
    try {
      await fn();
      await onRescan();
    } catch (e) {
      setActError(String(e));
    } finally {
      setActing(false);
    }
  }

  return (
    <div style={{ borderBottom: "1px solid var(--separator)" }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
      >
        <svg
          width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
          style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.12s", color: "var(--fg-subtle)", flexShrink: 0 }}
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <span style={{
          padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 600,
          background: `${color}18`, color, flexShrink: 0,
        }}>
          {categoryLabel}
        </span>
        <span style={{
          flex: 1, fontSize: 12, fontWeight: 600, color: "var(--fg-base)",
          fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.featureName}
        </span>
        <span style={{ fontSize: 11, color: "var(--fg-subtle)", flexShrink: 0, whiteSpace: "nowrap" }}>
          {absoluteTime(item.detectedAt)} · {relativeTime(item.detectedAt)}
        </span>
      </div>

      {expanded && (
        <div style={{ margin: "0 14px 12px 31px", borderLeft: `2px solid ${color}30`, paddingLeft: 14 }}>
          {item.details && (
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--fg-subtle)", lineHeight: 1.5 }}>
              {item.details}
            </p>
          )}
          {actError && (
            <div style={{ padding: "5px 9px", marginBottom: 10, borderRadius: 5, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626", fontSize: 11 }}>
              {actError}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {item.driftType === "missing_file" && (
              <button
                disabled={acting}
                onClick={() => runAction(() => createConfigFile(item.featureName).then(() => {}))}
                style={{ padding: "5px 11px", borderRadius: 5, border: "1px solid var(--accent)", background: "var(--accent)", color: "white", fontSize: 11, fontWeight: 500, cursor: acting ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: acting ? 0.7 : 1 }}
              >
                Create {item.featureName}
              </button>
            )}
            {item.driftType === "new_feature" && (
              <button
                disabled={acting}
                onClick={() => runAction(() => addToParityBaseline(item.category, item.featureName))}
                style={{ padding: "5px 11px", borderRadius: 5, border: "1px solid var(--accent)", background: "var(--accent)", color: "white", fontSize: 11, fontWeight: 500, cursor: acting ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: acting ? 0.7 : 1 }}
              >
                Mark as Known
              </button>
            )}
            {item.driftType === "new_feature" && item.category === "settings_key" && (
              <button
                onClick={() => navigate("/security/permissions")}
                style={{ padding: "5px 11px", borderRadius: 5, border: "1px solid var(--border-base)", background: "transparent", color: "var(--fg-muted)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
              >
                Edit in Security →
              </button>
            )}
            <button
              onClick={() => onAcknowledge(item.id)}
              style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border-base)", background: "transparent", color: "var(--fg-subtle)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function ParityDashboardPage() {
  const navigate = useNavigate();

  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([]);
  const [probedFiles, setProbedFiles] = useState<Record<string, "detected" | "missing" | "not_applicable">>({});
  const [probing, setProbing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanAge, setScanAge] = useState<string | null>(null);
  const [filterInstalled, setFilterInstalled] = useState(true);
  const [filterCategory, setFilterCategory] = useState<CapabilityCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenTargets, setHiddenTargets] = useState<Set<string>>(new Set());
  const [drawerCap, setDrawerCap] = useState<Capability | null>(null);
  const [columnMenu, setColumnMenu] = useState<{ harness: HarnessInfo; x: number; y: number } | null>(null);
  const [projectDir] = useState(getLastProjectDir);
  const [driftItems, setDriftItems] = useState<ParityDriftItem[]>([]);
  const [driftExpanded, setDriftExpanded] = useState(false);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const selection = useParitySelection();
  const lastClickRef = useRef<{ capId: string; targetId: string } | null>(null);

  const loadCapabilities = useCallback(async () => {
    setProbing(true);
    try {
      const [harnessData, probed] = await Promise.all([
        detectHarnesses(),
        probeHarnessCapabilities().catch(() => ({} as Record<string, "detected" | "missing" | "not_applicable">)),
      ]);
      setHarnesses(harnessData);
      setProbedFiles(probed);
    } catch (err) {
      setError(String(err));
    } finally {
      setProbing(false);
    }
  }, []);

  const loadDrift = useCallback(async (includeAck = false) => {
    try {
      const drift = await getParityDrift(includeAck);
      setDriftItems(drift);
    } catch {
      // drift panel is secondary — fail silently
    }
  }, []);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      await runParityScan();
      setScanAge(new Date().toISOString());
      await Promise.all([loadCapabilities(), loadDrift(showAcknowledged)]);
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }, [loadCapabilities, loadDrift, showAcknowledged]);

  useEffect(() => {
    loadCapabilities();
    loadDrift();
  }, [loadCapabilities, loadDrift]);

  useEffect(() => {
    if (driftExpanded) loadDrift(showAcknowledged);
  }, [driftExpanded, showAcknowledged, loadDrift]);

  const handleAcknowledge = useCallback(async (id: number) => {
    try {
      await acknowledgeDrift(id);
      setDriftItems(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  // ── Derived view state ─────────────────────────────────────

  const visibleHarnesses = harnesses
    .filter(h => !hiddenTargets.has(h.id))
    .filter(h => !filterInstalled || h.available);

  const filteredCaps = CAPABILITIES.filter(cap => {
    if (filterCategory !== "all" && cap.category !== filterCategory) return false;
    if (searchQuery && !cap.label.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const capsByCategory = CATEGORY_ORDER.reduce<{ cat: CapabilityCategory; caps: Capability[] }[]>(
    (acc, cat) => {
      const caps = filteredCaps.filter(c => c.category === cat);
      if (caps.length > 0) acc.push({ cat, caps });
      return acc;
    },
    [],
  );

  const flatCaps = capsByCategory.flatMap(g => g.caps);

  // ── Cell helpers ──────────────────────────────────────────

  function cellGlyph(cap: Capability, targetId: TargetPlatform): "dot" | "ring" | "dash" {
    const sup = cap.support[targetId];
    if (!sup?.supported) return "dash";
    const state = probedFiles[`${targetId}::${cap.id}`];
    if (state === "detected") return "dot";
    if (state === "not_applicable") return "dash";
    return "ring";
  }

  function handleCellClick(
    e: React.MouseEvent,
    cap: Capability,
    targetId: TargetPlatform,
  ) {
    if (!isSelectable(cap)) return;
    const sup = cap.support[targetId];
    if (!sup?.supported) return;

    if (e.shiftKey && lastClickRef.current) {
      const lastCapIdx = flatCaps.findIndex(c => c.id === lastClickRef.current!.capId);
      const thisCapIdx = flatCaps.findIndex(c => c.id === cap.id);
      const start = Math.min(lastCapIdx, thisCapIdx);
      const end = Math.max(lastCapIdx, thisCapIdx);
      for (let i = start; i <= end; i++) {
        const c = flatCaps[i];
        if (c && isSelectable(c) && c.support[targetId]?.supported) {
          selection.toggle(targetId, c.id);
        }
      }
    } else {
      selection.toggle(targetId, cap.id);
    }
    lastClickRef.current = { capId: cap.id, targetId };
  }

  function handleHeaderContextMenu(e: React.MouseEvent, harness: HarnessInfo) {
    e.preventDefault();
    setColumnMenu({ harness, x: e.clientX, y: e.clientY });
  }

  const colCount = visibleHarnesses.length;
  const gridCols = `260px repeat(${Math.max(colCount, 1)}, minmax(140px, 1fr))`;
  const activeDrift = driftItems.filter(d => !d.acknowledged).length;

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Page header */}
      <div style={{ padding: "20px 24px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--fg-base)" }}>
              Parity
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--fg-subtle)" }}>
              Compare feature parity across your AI coding harnesses.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {scanAge && (
              <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                Scanned {relativeTime(scanAge)}
              </span>
            )}
            <button
              onClick={triggerScan}
              disabled={scanning}
              style={{
                padding: "6px 14px", borderRadius: 6,
                border: "1px solid var(--border-base)", background: "transparent",
                color: scanning ? "var(--fg-subtle)" : "var(--fg-base)",
                fontSize: 12, fontWeight: 500,
                cursor: scanning ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: scanning ? 0.7 : 1,
              }}
            >
              {scanning ? "Scanning…" : "Scan now"}
            </button>
          </div>
        </div>
        {error && (
          <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626", fontSize: 11 }}>
            {error}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ padding: "0 24px 10px", flexShrink: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Installed / All toggle */}
        <div style={{ display: "flex", border: "1px solid var(--border-base)", borderRadius: 6, overflow: "hidden" }}>
          {([true, false] as const).map(installed => (
            <button
              key={String(installed)}
              onClick={() => setFilterInstalled(installed)}
              style={{
                padding: "5px 11px", fontSize: 11, fontWeight: 500,
                background: filterInstalled === installed ? "var(--accent)" : "transparent",
                color: filterInstalled === installed ? "white" : "var(--fg-muted)",
                border: 0, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {installed ? "Installed only" : "All harnesses"}
            </button>
          ))}
        </div>

        {/* Category chips */}
        {(["all", ...CATEGORY_ORDER] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 500,
              borderRadius: 12, border: "1px solid var(--border-base)",
              background: filterCategory === cat ? "var(--accent)" : "transparent",
              color: filterCategory === cat ? "white" : "var(--fg-muted)",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
          </button>
        ))}

        {/* Search */}
        <input
          type="search"
          placeholder="Filter features…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border-base)",
            background: "var(--bg-surface)", color: "var(--fg-base)",
            fontSize: 11, fontFamily: "inherit", outline: "none", width: 150,
          }}
        />

        {/* Hidden columns chip */}
        {hiddenTargets.size > 0 && (
          <button
            onClick={() => setHiddenTargets(new Set())}
            style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 500,
              borderRadius: 12, border: "1px dashed var(--border-base)",
              background: "transparent", color: "var(--fg-muted)",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {hiddenTargets.size} hidden · show all
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10.5, color: "var(--fg-subtle)", userSelect: "none" }}>
          <span><span style={{ color: "var(--fg-muted)" }}>●</span> supported</span>
          <span><span style={{ color: "var(--warning)" }}>○</span> missing</span>
          <span>— not supported</span>
        </div>
      </div>

      {/* Capability grid */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 24px" }}>
        {probing && harnesses.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-subtle)", fontSize: 12 }}>
            Loading harnesses…
          </div>
        ) : (
          <div
            data-testid="capability-grid"
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              minWidth: `${260 + colCount * 140}px`,
              borderLeft: "1px solid var(--border-base)",
              borderTop: "1px solid var(--border-base)",
            }}
          >
            {/* ── Header row ── */}
            {/* Top-left corner */}
            <div style={{
              position: "sticky", top: 0, left: 0, zIndex: 4,
              background: "var(--bg-base)",
              borderRight: "1px solid var(--border-base)",
              borderBottom: "1px solid var(--border-base)",
              padding: "10px 12px",
            }} />

            {/* Harness header cells */}
            {visibleHarnesses.map(h => (
              <div
                key={h.id}
                data-testid={`harness-header-${h.id}`}
                onContextMenu={e => handleHeaderContextMenu(e, h)}
                style={{
                  position: "sticky", top: 0, zIndex: 3,
                  background: "var(--bg-base)",
                  borderRight: "1px solid var(--border-base)",
                  borderBottom: "1px solid var(--border-base)",
                  padding: "10px 12px",
                  display: "flex", flexDirection: "column", gap: 4,
                  cursor: "context-menu",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block",
                    background: h.available ? "var(--success)" : "transparent",
                    border: h.available ? "none" : "1.5px solid var(--fg-subtle)",
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-base)" }}>
                    {h.name}
                  </span>
                </div>
                {h.available && h.version && (
                  <a
                    href={deepLinkForVersion(h.id as TargetPlatform, h.version)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`version-link-${h.id}`}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 10.5, color: "var(--fg-subtle)", textDecoration: "none", borderBottom: "1px dotted var(--fg-subtle)", alignSelf: "flex-start" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--fg-subtle)")}
                  >
                    v{h.version}
                  </a>
                )}
              </div>
            ))}

            {/* ── Category sections ── */}
            {capsByCategory.map(({ cat, caps }) => (
              <Fragment key={cat}>
                {/* Section header — spans all columns */}
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: "12px 12px 6px",
                    fontSize: 10.5, fontWeight: 600,
                    color: "var(--fg-subtle)",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    background: "var(--bg-surface)",
                    borderBottom: "1px solid var(--separator)",
                    borderRight: "1px solid var(--border-base)",
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </div>

                {/* Feature rows */}
                {caps.map(cap => (
                  <Fragment key={cap.id}>
                    {/* Feature label cell */}
                    <div
                      data-testid={`feature-label-${cap.id}`}
                      onClick={() => setDrawerCap(cap)}
                      style={{
                        position: "sticky", left: 0, zIndex: 2,
                        background: "var(--bg-base)",
                        borderRight: "1px solid var(--border-base)",
                        borderBottom: "1px solid var(--separator)",
                        padding: "10px 12px",
                        display: "flex", alignItems: "center", gap: 8,
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--hover-bg)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-base)")}
                    >
                      {isNew(cap) && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: "var(--warning)",
                          border: "1px solid var(--warning)", borderRadius: 3,
                          padding: "1px 4px", flexShrink: 0, letterSpacing: "0.04em",
                        }}>
                          NEW
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: "var(--fg-base)", borderBottom: "1px dotted var(--border-base)" }}>
                        {cap.label}
                      </span>
                    </div>

                    {/* Harness cells */}
                    {visibleHarnesses.map(h => {
                      const targetId = h.id as TargetPlatform;
                      const cellKey = `${cap.id}::${targetId}`;
                      const glyph = cellGlyph(cap, targetId);
                      const sup = cap.support[targetId];
                      const path = sup?.path;
                      const interactive = sup?.supported && isSelectable(cap);
                      const selected = selection.selected.has(`${targetId}::${cap.id}` as `${TargetPlatform}::${string}`);
                      const hovered = hoveredCell === cellKey;

                      return (
                        <div
                          key={cellKey}
                          data-testid={`cell-${cap.id}-${targetId}`}
                          onClick={interactive ? e => handleCellClick(e, cap, targetId) : undefined}
                          onMouseEnter={() => setHoveredCell(cellKey)}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            borderRight: "1px solid var(--border-base)",
                            borderBottom: "1px solid var(--separator)",
                            borderTop: selected ? "1px solid var(--accent)" : undefined,
                            borderLeft: selected ? "1px solid var(--accent)" : undefined,
                            padding: "10px 12px",
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            position: "relative",
                            background: selected ? "rgba(99, 102, 241, 0.08)" : "transparent",
                            cursor: interactive ? "pointer" : "default",
                            userSelect: "none",
                            opacity: !h.available && filterInstalled === false ? 0.35 : 1,
                            minHeight: 42,
                          }}
                        >
                          <span
                            data-testid={`glyph-${cap.id}-${targetId}`}
                            style={{
                              fontSize: 14, lineHeight: 1,
                              color: glyph === "dot"
                                ? "var(--fg-muted)"
                                : glyph === "ring"
                                  ? "var(--warning)"
                                  : "var(--fg-subtle)",
                            }}
                          >
                            {glyph === "dot" ? "●" : glyph === "ring" ? "○" : "—"}
                          </span>

                          {/* Path micro-label on hover */}
                          {path && hovered && (
                            <span style={{
                              position: "absolute", bottom: 2, left: 0, right: 0,
                              textAlign: "center",
                              fontSize: 9, fontFamily: "ui-monospace, monospace",
                              color: "var(--fg-subtle)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              padding: "0 4px", pointerEvents: "none",
                            }}>
                              {path}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ── "What's changed" collapsible panel ── */}
      <div style={{ flexShrink: 0, borderTop: "1px solid var(--border-base)", background: "var(--bg-surface)" }}>
        <div
          onClick={() => setDriftExpanded(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 24px", cursor: "pointer", userSelect: "none" }}
        >
          <svg
            width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
            style={{ transform: driftExpanded ? "rotate(90deg)" : "none", transition: "transform 0.12s", color: "var(--fg-subtle)", flexShrink: 0 }}
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-base)" }}>
            What's changed
          </span>
          {activeDrift > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 10, background: "var(--warning)", color: "white" }}>
              {activeDrift}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>last 30 days</span>
          {driftExpanded && (
            <button
              onClick={e => {
                e.stopPropagation();
                const next = !showAcknowledged;
                setShowAcknowledged(next);
                loadDrift(next);
              }}
              style={{ marginLeft: "auto", background: "transparent", border: "none", fontSize: 11, color: "var(--fg-subtle)", cursor: "pointer", fontFamily: "inherit" }}
            >
              {showAcknowledged ? "Hide acknowledged" : "Show acknowledged"}
            </button>
          )}
        </div>

        {driftExpanded && (
          <div style={{ maxHeight: 320, overflow: "auto", borderTop: "1px solid var(--separator)" }}>
            {driftItems.length === 0 ? (
              <div style={{ padding: "20px 24px", textAlign: "center", fontSize: 12, color: "var(--fg-subtle)" }}>
                No drift items.
              </div>
            ) : (
              driftItems.map(item => (
                <DriftRow
                  key={item.id}
                  item={item}
                  onAcknowledge={handleAcknowledge}
                  onRescan={triggerScan}
                  navigate={navigate}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Overlays ── */}
      <FeatureDetailDrawer
        cap={drawerCap}
        harnesses={harnesses}
        probedFiles={probedFiles}
        onClose={() => setDrawerCap(null)}
        onAddToSelection={(cap, targets) => {
          selection.addMissingForCap(cap, targets, probedFiles);
        }}
      />

      <BatchActionBar
        selected={selection.selected}
        harnesses={harnesses}
        probedFiles={probedFiles}
        projectDir={projectDir}
        onClear={selection.clear}
        onCompileSuccess={loadCapabilities}
      />

      <HarnessColumnMenu
        harness={columnMenu?.harness ?? null}
        x={columnMenu?.x ?? 0}
        y={columnMenu?.y ?? 0}
        hiddenCount={hiddenTargets.size}
        onHide={id => setHiddenTargets(prev => new Set([...prev, id]))}
        onShowAll={() => setHiddenTargets(new Set())}
        onClose={() => setColumnMenu(null)}
      />
    </div>
  );
}
