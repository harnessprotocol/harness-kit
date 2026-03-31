import { useEffect, useMemo, useState } from "react";
import type { PanelState } from "../../hooks/useComparator";
import TerminalView from "./TerminalView";

// ── Types ────────────────────────────────────────────────────

export interface HarnessPanelProps {
  panel: PanelState;
  rawChunks: string[];
  outputTick: number;
  onSend: (data: string) => void;
}

type TabKey = "terminal" | "activity" | "files";

// ── Design Tokens ───────────────────────────────────────────

const tokens = {
  bgBase: "#f4f2ef",
  bgSurface: "#faf9f7",
  bgElevated: "#ffffff",
  fgBase: "#181714",
  fgMuted: "#5c5a56",
  fgSubtle: "#9a9892",
  fgPlaceholder: "#bcbab5",
  borderBase: "rgba(0, 0, 0, 0.08)",
  borderStrong: "rgba(0, 0, 0, 0.14)",
  borderSubtle: "rgba(0, 0, 0, 0.05)",
  separator: "rgba(0, 0, 0, 0.07)",
  accent: "#5b50e8",
  accentLight: "rgba(91, 80, 232, 0.09)",
  accentText: "#5b50e8",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  hoverBg: "rgba(0, 0, 0, 0.04)",
  terminalBg: "#0d0d1a",
  terminalFg: "#e4e4e8",
};

// ── Fonts ───────────────────────────────────────────────────

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const monoStack = 'ui-monospace, "SF Mono", monospace';

// ── Inject keyframes (once) ─────────────────────────────────

let cssInjected = false;
function injectHarnessPanelCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes harness-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .harness-panel-activity::-webkit-scrollbar {
      width: 4px;
    }
    .harness-panel-activity::-webkit-scrollbar-track {
      background: transparent;
    }
    .harness-panel-activity::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.10);
      border-radius: 2px;
    }
  `;
  document.head.appendChild(style);
}

// ── Styles ──────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    width: "100%",
    overflow: "hidden",
    background: tokens.bgElevated,
    borderRadius: 6,
  } as React.CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    height: 36,
    minHeight: 36,
    padding: "0 10px",
    borderBottom: `1px solid ${tokens.borderBase}`,
    gap: 8,
    flexShrink: 0,
  } as React.CSSProperties,

  harnessName: {
    fontSize: 12,
    fontWeight: 600,
    color: tokens.fgBase,
    fontFamily: fontStack,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as React.CSSProperties,

  modelName: {
    fontSize: 10,
    color: tokens.fgSubtle,
    fontFamily: monoStack,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as React.CSSProperties,

  timer: {
    fontSize: 10,
    fontFamily: monoStack,
    color: tokens.fgSubtle,
    flexShrink: 0,
  } as React.CSSProperties,

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  } as React.CSSProperties,

  tabBar: {
    display: "flex",
    alignItems: "center",
    height: 28,
    minHeight: 28,
    padding: "0 10px",
    gap: 0,
    borderBottom: `1px solid ${tokens.borderBase}`,
    flexShrink: 0,
  } as React.CSSProperties,

  tab: {
    fontSize: 10,
    fontWeight: 500,
    fontFamily: fontStack,
    padding: "0 10px",
    height: "100%",
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    transition: "color 120ms, border-color 120ms",
    background: "none",
    border: "none",
    color: tokens.fgSubtle,
  } as React.CSSProperties,

  tabActive: {
    color: tokens.accentText,
    borderBottom: `2px solid ${tokens.accent}`,
  } as React.CSSProperties,

  tabContent: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  } as React.CSSProperties,

  metrics: {
    display: "flex",
    alignItems: "center",
    height: 28,
    minHeight: 28,
    padding: "0 10px",
    borderTop: `1px solid ${tokens.borderBase}`,
    gap: 12,
    flexShrink: 0,
  } as React.CSSProperties,

  metricItem: {
    fontSize: 9,
    fontFamily: monoStack,
    color: tokens.fgSubtle,
    display: "flex",
    alignItems: "center",
    gap: 3,
  } as React.CSSProperties,

  star: {
    fontSize: 12,
    cursor: "pointer",
    transition: "transform 80ms",
    lineHeight: 1,
  } as React.CSSProperties,

  noteBtn: {
    fontSize: 9,
    fontWeight: 500,
    fontFamily: fontStack,
    color: tokens.fgSubtle,
    background: "none",
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 3,
    padding: "1px 6px",
    cursor: "pointer",
    transition: "background 120ms, color 120ms",
  } as React.CSSProperties,
};

// ── Tool event parsing ──────────────────────────────────────

interface ToolEvent {
  timestamp: number;
  tool: string;
  detail: string;
}

const TOOL_PATTERNS = [
  { pattern: /Tool:\s*(Bash|bash)/i, icon: ">" },
  { pattern: /Tool:\s*(Write|write)/i, icon: "+" },
  { pattern: /Tool:\s*(Read|read)/i, icon: "~" },
  { pattern: /Tool:\s*(Edit|edit)/i, icon: "~" },
  { pattern: /Tool:\s*(Grep|grep)/i, icon: "?" },
  { pattern: /Tool:\s*(Glob|glob)/i, icon: "?" },
  { pattern: /Tool:\s*(Search|search)/i, icon: "?" },
  { pattern: /⏺|●|◆|▶|╭|─.*Tool/i, icon: "◇" },
];

function parseToolEvents(chunks: string[], startTime: number): ToolEvent[] {
  const events: ToolEvent[] = [];
  const seen = new Set<string>();
  const now = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    for (const { pattern, icon } of TOOL_PATTERNS) {
      const match = chunk.match(pattern);
      if (match) {
        // Approximate timestamp based on chunk position.
        const elapsed = startTime > 0
          ? Math.floor(((now - startTime) * i) / Math.max(chunks.length, 1))
          : 0;
        const key = `${match[1] || "tool"}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            timestamp: elapsed,
            tool: match[1] || "Tool",
            detail: icon,
          });
        }
        break;
      }
    }
  }

  return events;
}

// ── Helpers ─────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Tab icon SVGs ───────────────────────────────────────────

function TerminalIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 6 7 9 4 12" />
      <line x1="9" y1="12" x2="12" y2="12" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2 8 5 4 8 10 11 6 14 8" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" />
      <polyline points="9 2 9 6 13 6" />
    </svg>
  );
}

// ── Tabs ────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: () => React.ReactNode }[] = [
  { key: "terminal", label: "Terminal", icon: TerminalIcon },
  { key: "activity", label: "Activity", icon: ActivityIcon },
  { key: "files", label: "Files", icon: FilesIcon },
];

// ── Component ───────────────────────────────────────────────

export default function HarnessPanel({ panel, rawChunks, outputTick, onSend: _onSend }: HarnessPanelProps) {
  injectHarnessPanelCSS();

  const [activeTab, setActiveTab] = useState<TabKey>("terminal");
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [hoveredTab, setHoveredTab] = useState<TabKey | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Suppress lint — outputTick is used to trigger re-render for rawChunks.
  void outputTick;

  // ── Elapsed timer ──────────────────────────────────────────

  useEffect(() => {
    if (panel.status !== "running" || panel.startedAt <= 0) return;

    const tick = () => setElapsed(Date.now() - panel.startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [panel.status, panel.startedAt]);

  // When panel finishes, freeze the elapsed time.
  useEffect(() => {
    if (panel.status !== "running" && panel.durationMs != null) {
      setElapsed(panel.durationMs);
    }
  }, [panel.status, panel.durationMs]);

  // ── Parsed activity events ─────────────────────────────────

  const toolEvents = useMemo(
    () => parseToolEvents(rawChunks, panel.startedAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawChunks.length, panel.startedAt],
  );

  // ── Status dot styling ─────────────────────────────────────

  const dotColor =
    panel.status === "running"
      ? tokens.success
      : panel.status === "completed"
        ? tokens.success
        : tokens.danger;

  const dotStyle: React.CSSProperties = {
    ...styles.statusDot,
    background: dotColor,
    ...(panel.status === "running"
      ? { animation: "harness-pulse 2s ease-in-out infinite" }
      : {}),
  };

  // ── Render tab content ─────────────────────────────────────

  function renderTabContent() {
    switch (activeTab) {
      case "terminal":
        return (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {panel.terminalId ? (
              <TerminalView terminalId={panel.terminalId} rawChunks={rawChunks} />
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: tokens.fgPlaceholder,
                  fontFamily: fontStack,
                  background: tokens.terminalBg,
                }}
              >
                No live terminal (past session)
              </div>
            )}
          </div>
        );

      case "activity":
        return (
          <div
            className="harness-panel-activity"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "8px 10px",
              fontSize: 11,
              fontFamily: monoStack,
              color: tokens.fgMuted,
              lineHeight: "1.8",
            }}
          >
            {toolEvents.length === 0 ? (
              <div
                style={{
                  color: tokens.fgPlaceholder,
                  fontFamily: fontStack,
                  fontSize: 11,
                  textAlign: "center",
                  padding: "24px 0",
                }}
              >
                {panel.status === "running"
                  ? "Waiting for tool activity..."
                  : "No tool events detected"}
              </div>
            ) : (
              toolEvents.map((evt, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "2px 0",
                  }}
                >
                  <span style={{ color: tokens.fgSubtle, minWidth: 32, textAlign: "right" }}>
                    {formatElapsed(evt.timestamp)}
                  </span>
                  <span style={{ color: tokens.accent, fontWeight: 500 }}>
                    {evt.detail}
                  </span>
                  <span>{evt.tool}</span>
                </div>
              ))
            )}
          </div>
        );

      case "files":
        return (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: tokens.fgPlaceholder,
              fontFamily: fontStack,
              padding: "24px",
              textAlign: "center",
            }}
          >
            {panel.status === "running"
              ? "Waiting for completion..."
              : "File diffs will appear here after git analysis"}
          </div>
        );

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.harnessName}>{panel.harnessName}</span>
        {panel.model && <span style={styles.modelName}>{panel.model}</span>}
        <div style={{ flex: 1 }} />
        <span style={styles.timer}>{formatElapsed(elapsed)}</span>
        <div style={dotStyle} />
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const isHovered = hoveredTab === tab.key;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              style={{
                ...styles.tab,
                ...(isActive ? styles.tabActive : {}),
                ...(isHovered && !isActive ? { color: tokens.fgBase } : {}),
              }}
              onClick={() => setActiveTab(tab.key)}
              onMouseEnter={() => setHoveredTab(tab.key)}
              onMouseLeave={() => setHoveredTab(null)}
            >
              <span style={{ marginRight: 4, display: "inline-flex", alignItems: "center" }}>
                <Icon />
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={styles.tabContent}>
        {renderTabContent()}
      </div>

      {/* Metrics strip */}
      <div style={styles.metrics}>
        <span style={styles.metricItem}>
          <FilesIcon /> {panel.status === "running" ? "--" : "0"} files
        </span>
        <span style={styles.metricItem}>
          {toolEvents.length} tools
        </span>
        <div style={{ flex: 1 }} />

        {/* 5-star rating */}
        <div style={{ display: "flex", gap: 1 }}>
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = star <= (hoveredStar || rating);
            return (
              <span
                key={star}
                style={{
                  ...styles.star,
                  color: filled ? tokens.warning : tokens.borderStrong,
                }}
                onClick={() => setRating(star === rating ? 0 : star)}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
              >
                {filled ? "\u2605" : "\u2606"}
              </span>
            );
          })}
        </div>

        {/* Note button */}
        <button
          style={styles.noteBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = tokens.hoverBg;
            e.currentTarget.style.color = tokens.fgBase;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = tokens.fgSubtle;
          }}
        >
          + Note
        </button>
      </div>
    </div>
  );
}
