import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComparisonState } from "../../hooks/useComparator";
import HarnessPanel from "../../components/comparator/HarnessPanel";

// ── Types ────────────────────────────────────────────────────

export interface ExecutionPhaseProps {
  active: ComparisonState;
  getRawChunks: (terminalId: string) => string[];
  outputTick: number;
  onEndSession: () => void;
  onUpdateTitle: (title: string) => void;
  onSendToPanel: (panelId: string, data: string) => void;
  onBroadcast: (prompt: string) => void;
}

type BroadcastMode = "broadcast" | "single";

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
  accentFg: "#4338d4",
  accentText: "#5b50e8",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  hoverBg: "rgba(0, 0, 0, 0.04)",
};

// ── Fonts ───────────────────────────────────────────────────

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const monoStack = 'ui-monospace, "SF Mono", monospace';

// ── Styles ──────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    width: "100%",
    overflow: "hidden",
    fontFamily: fontStack,
  } as React.CSSProperties,

  // Summary bar
  summaryBar: {
    display: "flex",
    alignItems: "center",
    height: 40,
    minHeight: 40,
    padding: "0 16px",
    borderBottom: `1px solid ${tokens.borderBase}`,
    background: tokens.bgSurface,
    gap: 10,
    flexShrink: 0,
  } as React.CSSProperties,

  titleInput: {
    fontSize: 13,
    fontWeight: 600,
    color: tokens.fgBase,
    background: "transparent",
    border: "none",
    borderBottom: `1px dashed ${tokens.borderStrong}`,
    outline: "none",
    padding: "2px 0",
    fontFamily: fontStack,
    minWidth: 120,
    maxWidth: 260,
    transition: "border-color 150ms",
  } as React.CSSProperties,

  pipeSep: {
    color: tokens.fgPlaceholder,
    fontSize: 14,
    fontWeight: 300,
    flexShrink: 0,
  } as React.CSSProperties,

  harnessBadge: {
    fontSize: 10,
    fontWeight: 500,
    color: tokens.accentText,
    background: tokens.accentLight,
    padding: "2px 8px",
    borderRadius: 10,
    fontFamily: fontStack,
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  } as React.CSSProperties,

  elapsedTimer: {
    fontSize: 12,
    fontFamily: monoStack,
    color: tokens.fgMuted,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  } as React.CSSProperties,

  endBtn: {
    fontSize: 11,
    fontWeight: 500,
    fontFamily: fontStack,
    color: tokens.fgMuted,
    background: "transparent",
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 5,
    padding: "4px 12px",
    cursor: "pointer",
    transition: "background 120ms, color 120ms, border-color 120ms",
    flexShrink: 0,
  } as React.CSSProperties,

  // Grid
  grid: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    gap: 1,
    background: tokens.separator,
    overflow: "hidden",
  } as React.CSSProperties,

  // Broadcast bar
  broadcastBar: {
    display: "flex",
    alignItems: "center",
    height: 44,
    minHeight: 44,
    padding: "0 12px",
    borderTop: `1px solid ${tokens.borderBase}`,
    background: tokens.bgSurface,
    gap: 8,
    flexShrink: 0,
  } as React.CSSProperties,

  modeBtn: {
    fontSize: 10,
    fontWeight: 500,
    fontFamily: fontStack,
    padding: "4px 10px",
    borderRadius: 4,
    cursor: "pointer",
    transition: "all 120ms",
    border: "none",
    flexShrink: 0,
  } as React.CSSProperties,

  broadcastInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: monoStack,
    color: tokens.fgBase,
    background: tokens.bgElevated,
    border: `1px solid ${tokens.borderBase}`,
    borderRadius: 5,
    padding: "5px 10px",
    outline: "none",
    transition: "border-color 150ms",
  } as React.CSSProperties,

  sendBtn: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fontStack,
    color: "#ffffff",
    background: tokens.accent,
    border: "none",
    borderRadius: 5,
    padding: "5px 14px",
    cursor: "pointer",
    transition: "background 120ms, transform 60ms",
    flexShrink: 0,
  } as React.CSSProperties,

  hint: {
    fontSize: 9,
    color: tokens.fgPlaceholder,
    fontFamily: fontStack,
    flexShrink: 0,
  } as React.CSSProperties,
};

// ── Helpers ─────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function gridColumns(panelCount: number): string {
  if (panelCount <= 1) return "1fr";
  if (panelCount === 2) return "1fr 1fr";
  if (panelCount === 3) return "1fr 1fr 1fr";
  // 4 panels: 2x2
  return "1fr 1fr";
}

function gridRows(panelCount: number): string {
  if (panelCount <= 3) return "1fr";
  // 4 panels: 2x2
  return "1fr 1fr";
}

// ── Component ───────────────────────────────────────────────

export default function ExecutionPhase({
  active,
  getRawChunks,
  outputTick,
  onEndSession,
  onUpdateTitle,
  onSendToPanel,
  onBroadcast,
}: ExecutionPhaseProps) {
  const [title, setTitle] = useState(active.title);
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState<BroadcastMode>("broadcast");
  const [inputValue, setInputValue] = useState("");
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(
    active.panels.length > 0 ? active.panels[0].id : null,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef(Date.now());

  // ── Elapsed timer ──────────────────────────────────────────

  useEffect(() => {
    // Use the earliest panel start time or fallback to now.
    const earliest = active.panels.reduce(
      (min, p) => (p.startedAt > 0 && p.startedAt < min ? p.startedAt : min),
      Date.now(),
    );
    startTimeRef.current = earliest;

    const hasRunning = active.panels.some((p) => p.status === "running");
    if (!hasRunning) {
      setElapsed(Date.now() - earliest);
      return;
    }

    const tick = () => setElapsed(Date.now() - startTimeRef.current);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active.panels]);

  // ── Title blur handler ─────────────────────────────────────

  const handleTitleBlur = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== active.title) {
      onUpdateTitle(trimmed);
    }
  }, [title, active.title, onUpdateTitle]);

  // ── Send handler ───────────────────────────────────────────

  const handleSend = useCallback(() => {
    const value = inputValue.trim();
    if (!value) return;

    if (mode === "broadcast") {
      onBroadcast(value);
    } else if (selectedPanelId) {
      onSendToPanel(selectedPanelId, value + "\n");
    }

    setInputValue("");
    inputRef.current?.focus();
  }, [inputValue, mode, selectedPanelId, onBroadcast, onSendToPanel]);

  // ── Keyboard shortcut: Cmd+Enter to send ───────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Unique harness names for badges ────────────────────────

  const harnessNames = useMemo(
    () => [...new Set(active.panels.map((p) => p.harnessName))],
    [active.panels],
  );

  // ── Grid style ─────────────────────────────────────────────

  const gridStyle: React.CSSProperties = {
    ...styles.grid,
    gridTemplateColumns: gridColumns(active.panels.length),
    gridTemplateRows: gridRows(active.panels.length),
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* ── Summary Bar ─────────────────────────────────────── */}
      <div style={styles.summaryBar}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => {
            e.currentTarget.style.borderBottomColor = tokens.borderStrong;
            handleTitleBlur();
          }}
          placeholder="Untitled comparison..."
          style={styles.titleInput}
          onFocus={(e) => {
            e.currentTarget.style.borderBottomColor = tokens.accent;
          }}
        />
        <span style={styles.pipeSep}>|</span>
        {harnessNames.map((name) => (
          <span key={name} style={styles.harnessBadge}>{name}</span>
        ))}
        <div style={{ flex: 1 }} />
        <span style={styles.elapsedTimer}>{formatElapsed(elapsed)}</span>
        <button
          style={styles.endBtn}
          onClick={onEndSession}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(220, 38, 38, 0.06)";
            e.currentTarget.style.borderColor = tokens.danger;
            e.currentTarget.style.color = tokens.danger;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = tokens.borderBase;
            e.currentTarget.style.color = tokens.fgMuted;
          }}
        >
          End Session
        </button>
      </div>

      {/* ── Execution Grid ──────────────────────────────────── */}
      <div style={gridStyle}>
        {active.panels.map((panel) => (
          <div
            key={panel.id}
            style={{
              background: tokens.bgElevated,
              overflow: "hidden",
              ...(mode === "single" && selectedPanelId === panel.id
                ? { boxShadow: `inset 0 0 0 2px ${tokens.accent}` }
                : {}),
            }}
            onClick={() => {
              if (mode === "single") setSelectedPanelId(panel.id);
            }}
          >
            <HarnessPanel
              panel={panel}
              rawChunks={getRawChunks(panel.terminalId)}
              outputTick={outputTick}
              onSend={(data) => onSendToPanel(panel.id, data)}
            />
          </div>
        ))}
      </div>

      {/* ── Broadcast Bar ───────────────────────────────────── */}
      <div style={styles.broadcastBar}>
        {/* Mode toggle */}
        <button
          style={{
            ...styles.modeBtn,
            background: mode === "broadcast" ? tokens.accent : "transparent",
            color: mode === "broadcast" ? "#ffffff" : tokens.fgSubtle,
          }}
          onClick={() => setMode("broadcast")}
        >
          Broadcast
        </button>
        <button
          style={{
            ...styles.modeBtn,
            background: mode === "single" ? tokens.accent : "transparent",
            color: mode === "single" ? "#ffffff" : tokens.fgSubtle,
          }}
          onClick={() => setMode("single")}
        >
          Single
        </button>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "broadcast"
              ? "Send to all panels..."
              : `Send to ${active.panels.find((p) => p.id === selectedPanelId)?.harnessName ?? "panel"}...`
          }
          style={styles.broadcastInput}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = tokens.accent;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = tokens.borderBase;
          }}
        />

        {/* Send button */}
        <button
          style={{
            ...styles.sendBtn,
            ...(inputValue.trim() ? {} : { opacity: 0.5, cursor: "not-allowed" }),
          }}
          onClick={handleSend}
          onMouseEnter={(e) => {
            if (!inputValue.trim()) return;
            e.currentTarget.style.background = tokens.accentFg;
            e.currentTarget.style.transform = "scale(0.97)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = tokens.accent;
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          Send
        </button>

        <span style={styles.hint}>\u2318\u23CE</span>
      </div>
    </div>
  );
}
