// ── Types ────────────────────────────────────────────────────

export interface TerminalToolbarProps {
  terminalCount: number;
  maxTerminals: number;
  onNewTerminal: () => void;
  onInvokeAll: () => void;
  onSettings?: () => void;
  projectName: string;
}

// ── Inline SVG icons ─────────────────────────────────────────

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 42,
    minHeight: 42,
    padding: "0 16px",
    background: "#1a1816",
    borderBottom: "1px solid #2a2825",
    gap: 12,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  center: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  projectName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#f2f1ed",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  counter: {
    fontSize: 12,
    color: "#a09d98",
    whiteSpace: "nowrap" as const,
  },
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "#a09d98",
    cursor: "pointer",
    padding: 0,
    transition: "background 120ms, color 120ms",
  },
  invokeAllBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 28,
    padding: "0 12px",
    border: "none",
    borderRadius: 4,
    background: "#7b72f0",
    color: "#fff",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 120ms",
    whiteSpace: "nowrap" as const,
  },
  newTermBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 28,
    padding: "0 10px",
    border: "1px solid #3a3835",
    borderRadius: 4,
    background: "transparent",
    color: "#f2f1ed",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 120ms, border-color 120ms",
    whiteSpace: "nowrap" as const,
  },
  kbd: {
    fontSize: 10,
    color: "#a09d98",
    marginLeft: 4,
  },
};

// ── Component ────────────────────────────────────────────────

export default function TerminalToolbar({
  terminalCount,
  maxTerminals,
  onNewTerminal,
  onInvokeAll,
  onSettings,
  projectName,
}: TerminalToolbarProps) {
  const atLimit = terminalCount >= maxTerminals;

  return (
    <div style={styles.toolbar}>
      {/* Left: project name + settings */}
      <div style={styles.left}>
        <span style={styles.projectName}>{projectName}</span>
        {onSettings && (
          <button
            style={styles.iconBtn}
            title="Settings"
            onClick={onSettings}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#2a2825";
              e.currentTarget.style.color = "#f2f1ed";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#a09d98";
            }}
          >
            <SettingsIcon />
          </button>
        )}
      </div>

      {/* Center: counter */}
      <div style={styles.center}>
        <span style={styles.counter}>
          {terminalCount} / {maxTerminals} terminals
        </span>
      </div>

      {/* Right: invoke all + new terminal */}
      <div style={styles.right}>
        <button
          style={{
            ...styles.invokeAllBtn,
            ...(terminalCount === 0 ? { opacity: 0.5, pointerEvents: "none" as const } : {}),
          }}
          title="Invoke all terminals"
          onClick={onInvokeAll}
          disabled={terminalCount === 0}
          onMouseEnter={(e) => {
            if (terminalCount > 0) e.currentTarget.style.background = "#6b63e0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#7b72f0";
          }}
        >
          <SparklesIcon />
          Invoke All
        </button>
        <button
          style={{
            ...styles.newTermBtn,
            ...(atLimit ? { opacity: 0.4, pointerEvents: "none" as const } : {}),
          }}
          title={atLimit ? `Max ${maxTerminals} terminals` : "New Terminal"}
          onClick={onNewTerminal}
          disabled={atLimit}
          onMouseEnter={(e) => {
            if (!atLimit) {
              e.currentTarget.style.background = "#2a2825";
              e.currentTarget.style.borderColor = "#4a4845";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "#3a3835";
          }}
        >
          <PlusIcon />
          New Terminal
          <span style={styles.kbd}>&#8984;T</span>
        </button>
      </div>
    </div>
  );
}
