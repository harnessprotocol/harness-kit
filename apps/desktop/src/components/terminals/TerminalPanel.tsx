import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// ── Types ────────────────────────────────────────────────────

export interface TerminalPanelProps {
  terminalId: string;
  title: string;
  status: "idle" | "running" | "exited";
  harnessId?: string;
  harnessName?: string;
  model?: string;
  rawChunks: string[];
  onClose: () => void;
  onInvoke: () => void;
  onExpand?: () => void;
}

// ── Inline SVG icons ─────────────────────────────────────────

function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Status dot colors ────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: "#22c55e",
  running: "#22c55e",
  exited: "#6b7280",
};

// ── Styles ───────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    width: "100%",
    overflow: "hidden",
    background: "#0d0d1a",
    borderRadius: 4,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
    minHeight: 36,
    padding: "0 10px",
    background: "#2a2825",
    borderBottom: "1px solid #3a3835",
    gap: 6,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: 500,
    color: "#f2f1ed",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  harnessLabel: {
    fontSize: 10,
    color: "#a09d98",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "#a09d98",
    cursor: "pointer",
    padding: 0,
    transition: "background 120ms, color 120ms",
  },
  terminalBody: {
    flex: 1,
    minHeight: 0,
    padding: "4px 0 0 4px",
  },
};

// ── Pulse animation keyframes (injected once) ────────────────

let pulseInjected = false;
function injectPulseAnimation() {
  if (pulseInjected) return;
  pulseInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes terminal-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(style);
}

// ── Component ────────────────────────────────────────────────

export default function TerminalPanel({
  terminalId,
  title,
  status,
  harnessId: _harnessId,
  harnessName,
  model,
  rawChunks,
  onClose,
  onInvoke,
  onExpand,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);

  // Inject pulse CSS once.
  useEffect(() => { injectPulseAnimation(); }, []);

  // ── Mount xterm ──────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      fontSize: 12,
      scrollback: 10000,
      convertEol: true,
      cursorBlink: true,
      theme: {
        background: "#0d0d1a",
        foreground: "#d0d0dc",
        cursor: "#d0d0dc",
        selectionBackground: "#3a3a5c",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    // Initial fit + focus — double rAF ensures xterm DOM is fully laid out.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fit.fit();
        term.focus();
        invoke("resize_terminal", {
          terminalId,
          rows: term.rows,
          cols: term.cols,
        }).catch(console.error);
      });
    });

    // Bidirectional I/O: keystrokes → pty.
    term.onData((data) => {
      invoke("write_terminal", { terminalId, data }).catch(console.error);
    });

    termRef.current = term;
    fitRef.current = fit;
    writtenRef.current = 0;

    // ── Resize observer ────────────────────────────────────────

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fit.fit();
        invoke("resize_terminal", {
          terminalId,
          rows: term.rows,
          cols: term.cols,
        }).catch(console.error);
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      writtenRef.current = 0;
    };
  }, [terminalId]);

  // ── Write new chunks to xterm ────────────────────────────────

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const start = writtenRef.current;
    if (start < rawChunks.length) {
      for (let i = start; i < rawChunks.length; i++) {
        term.write(rawChunks[i]);
      }
      writtenRef.current = rawChunks.length;
    }
  // rawChunks is the same array reference (mutated); rawChunks.length changes
  // on each parent re-render triggered by outputTick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawChunks.length]);

  // ── Status dot ───────────────────────────────────────────────

  const dotStyle: React.CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: STATUS_COLORS[status] ?? STATUS_COLORS.idle,
    flexShrink: 0,
    ...(status === "idle"
      ? { animation: "terminal-pulse 2s ease-in-out infinite" }
      : {}),
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={dotStyle} />
          <span style={styles.title}>{title}</span>
          {harnessName && (
            <span style={styles.harnessLabel}>
              {harnessName}{model ? ` · ${model}` : ""}
            </span>
          )}
        </div>
        <div style={styles.headerRight}>
          <button
            style={styles.iconBtn}
            title="Invoke harness"
            aria-label="Invoke harness"
            onClick={onInvoke}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#3a3835";
              e.currentTarget.style.color = "#7b72f0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#a09d98";
            }}
          >
            <SparklesIcon />
          </button>
          {onExpand && (
            <button
              style={styles.iconBtn}
              title="Expand"
              aria-label="Expand"
              onClick={onExpand}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#3a3835";
                e.currentTarget.style.color = "#f2f1ed";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#a09d98";
              }}
            >
              <MaximizeIcon />
            </button>
          )}
          <button
            style={styles.iconBtn}
            title="Close terminal"
            aria-label="Close terminal"
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#3a3835";
              e.currentTarget.style.color = "#ef4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#a09d98";
            }}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Terminal body — click to focus */}
      <div
        ref={containerRef}
        style={styles.terminalBody}
        tabIndex={-1}
        onMouseDown={() => {
          // Defer so xterm's own handler fires first, then ensure focus.
          setTimeout(() => termRef.current?.focus(), 0);
        }}
      />
    </div>
  );
}
