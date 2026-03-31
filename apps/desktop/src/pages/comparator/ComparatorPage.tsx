import { useCallback, useState } from "react";
import type { ComparisonPhase, ComparisonSummary } from "@harness-kit/shared";
import { useComparator } from "../../hooks/useComparator";
import SetupPhase from "./SetupPhase";
import ExecutionPhase from "./ExecutionPhase";
import ResultsPhase from "./ResultsPhase";
import JudgePhase from "./JudgePhase";

// ── Design Tokens ───────────────────────────────────────────

const tokens = {
  bgBase: "#f4f2ef",
  bgSurface: "#faf9f7",
  bgElevated: "#ffffff",
  bgSidebar: "rgba(228, 226, 222, 0.82)",
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
  railWidth: 220,
};

// ── Phase stepper config ────────────────────────────────────

const PHASES: { key: ComparisonPhase; label: string; step: number }[] = [
  { key: "setup", label: "Setup", step: 1 },
  { key: "execution", label: "Execution", step: 2 },
  { key: "results", label: "Results", step: 3 },
  { key: "judge", label: "Judge", step: 4 },
];

const PHASE_INDEX: Record<ComparisonPhase, number> = {
  setup: 0,
  execution: 1,
  results: 2,
  judge: 3,
};

// ── Inject pulse + scrollbar CSS (once) ─────────────────────

let cssInjected = false;
function injectGlobalCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes comparator-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .comparator-rail::-webkit-scrollbar {
      width: 5px;
    }
    .comparator-rail::-webkit-scrollbar-track {
      background: transparent;
    }
    .comparator-rail::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.12);
      border-radius: 3px;
    }
    .comparator-rail::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.2);
    }
  `;
  document.head.appendChild(style);
}

// ── Styles ──────────────────────────────────────────────────

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

const styles = {
  page: {
    display: "flex",
    height: "100%",
    width: "100%",
    overflow: "hidden",
    background: tokens.bgBase,
    fontFamily: fontStack,
  } as React.CSSProperties,

  rail: {
    width: tokens.railWidth,
    minWidth: tokens.railWidth,
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    background: tokens.bgSidebar,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRight: `1px solid ${tokens.borderBase}`,
    overflow: "hidden",
  } as React.CSSProperties,

  railTop: {
    padding: "12px 12px 0",
    flexShrink: 0,
  } as React.CSSProperties,

  newBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    height: 32,
    border: "none",
    borderRadius: 6,
    background: tokens.accent,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: fontStack,
    cursor: "pointer",
    transition: "background 120ms, transform 60ms",
  } as React.CSSProperties,

  stepperSection: {
    padding: "16px 12px 8px",
    flexShrink: 0,
  } as React.CSSProperties,

  stepRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    height: 28,
    cursor: "pointer",
    borderRadius: 4,
    padding: "0 4px",
    transition: "background 120ms",
  } as React.CSSProperties,

  stepDot: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fontStack,
    flexShrink: 0,
    transition: "all 150ms",
  } as React.CSSProperties,

  stepLine: {
    width: 2,
    height: 8,
    marginLeft: 12, // centers under the 18px dot (18/2 - 2/2 = 8, offset by padding 4)
    borderRadius: 1,
    flexShrink: 0,
  } as React.CSSProperties,

  stepLabel: {
    fontSize: 12,
    fontWeight: 500,
    fontFamily: fontStack,
    lineHeight: "1",
  } as React.CSSProperties,

  sessionsHeader: {
    padding: "12px 12px 6px",
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: tokens.fgSubtle,
    fontFamily: fontStack,
    flexShrink: 0,
  } as React.CSSProperties,

  sessionsList: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "0 8px 8px",
  } as React.CSSProperties,

  sessionCard: {
    padding: 8,
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 120ms",
    marginBottom: 2,
  } as React.CSSProperties,

  sessionTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: tokens.fgBase,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontFamily: fontStack,
  } as React.CSSProperties,

  sessionMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  } as React.CSSProperties,

  sessionTime: {
    fontSize: 10,
    color: tokens.fgSubtle,
    fontFamily: fontStack,
  } as React.CSSProperties,

  statusDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    flexShrink: 0,
  } as React.CSSProperties,

  harnessBadge: {
    fontSize: 9,
    fontWeight: 500,
    color: tokens.fgMuted,
    background: tokens.borderSubtle,
    padding: "1px 5px",
    borderRadius: 3,
    fontFamily: fontStack,
  } as React.CSSProperties,

  content: {
    flex: 1,
    height: "100%",
    overflow: "auto",
    background: tokens.bgBase,
  } as React.CSSProperties,

  deleteBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: tokens.fgSubtle,
    cursor: "pointer",
    padding: 0,
    marginLeft: "auto",
    flexShrink: 0,
    transition: "background 120ms, color 120ms",
  } as React.CSSProperties,
};

// ── Helpers ─────────────────────────────────────────────────

function formatSessionTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ── Checkmark SVG for completed steps ───────────────────────

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 8 7 12 13 4" />
    </svg>
  );
}

// ── Plus SVG for new comparison button ──────────────────────

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="2" x2="8" y2="14" />
      <line x1="2" y1="8" x2="14" y2="8" />
    </svg>
  );
}

// ── Phase Stepper ───────────────────────────────────────────

function PhaseStepper({
  currentPhase,
  onPhaseClick,
}: {
  currentPhase: ComparisonPhase;
  onPhaseClick: (phase: ComparisonPhase) => void;
}) {
  const currentIndex = PHASE_INDEX[currentPhase];

  return (
    <div style={styles.stepperSection}>
      {PHASES.map((p, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;

        // Dot styling
        const dotStyle: React.CSSProperties = {
          ...styles.stepDot,
          ...(isDone
            ? { background: tokens.success, color: "#fff", border: `2px solid ${tokens.success}` }
            : isActive
              ? { background: tokens.accent, color: "#fff", border: `2px solid ${tokens.accent}` }
              : { background: "transparent", color: tokens.fgPlaceholder, border: `2px solid ${tokens.borderStrong}` }),
        };

        // Label styling
        const labelStyle: React.CSSProperties = {
          ...styles.stepLabel,
          color: isDone ? tokens.success : isActive ? tokens.accent : tokens.fgPlaceholder,
        };

        // Line styling (between steps)
        const lineStyle: React.CSSProperties = {
          ...styles.stepLine,
          background: isDone ? tokens.success : tokens.borderBase,
        };

        return (
          <div key={p.key}>
            <div
              style={styles.stepRow}
              onClick={() => onPhaseClick(p.key)}
              onMouseEnter={(e) => { e.currentTarget.style.background = tokens.hoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div style={dotStyle}>
                {isDone ? <CheckIcon /> : p.step}
              </div>
              <span style={labelStyle}>{p.label}</span>
            </div>
            {i < PHASES.length - 1 && <div style={lineStyle} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Session Card ────────────────────────────────────────────

function SessionCard({
  session,
  isActive,
  onClick,
  onDelete,
}: {
  session: ComparisonSummary;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [deleteHovered, setDeleteHovered] = useState(false);
  const isRunning = session.status === "running";

  const cardStyle: React.CSSProperties = {
    ...styles.sessionCard,
    background: isActive
      ? tokens.accentLight
      : hovered
        ? tokens.hoverBg
        : "transparent",
  };

  const dotStyle: React.CSSProperties = {
    ...styles.statusDot,
    background: isRunning ? tokens.success : tokens.fgPlaceholder,
    ...(isRunning ? { animation: "comparator-pulse 2s ease-in-out infinite" } : {}),
  };

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={styles.sessionTitle}>
          {session.title || "Untitled comparison"}
        </span>
        {hovered && (
          <button
            style={{
              ...styles.deleteBtn,
              ...(deleteHovered ? { background: "rgba(220, 38, 38, 0.1)", color: tokens.danger } : {}),
            }}
            title="Delete session"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        )}
      </div>
      <div style={styles.sessionMeta}>
        <div style={dotStyle} />
        <span style={styles.sessionTime}>{formatSessionTime(session.createdAt)}</span>
        {session.harnessNames.map((name) => (
          <span key={name} style={styles.harnessBadge}>{name}</span>
        ))}
      </div>
    </div>
  );
}

// ── Placeholder phases ──────────────────────────────────────

function PhasePlaceholder({ phase }: { phase: ComparisonPhase }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: tokens.fgSubtle,
        fontSize: 14,
        fontFamily: fontStack,
      }}
    >
      {phase.charAt(0).toUpperCase() + phase.slice(1)} phase coming soon...
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function ComparatorPage() {
  injectGlobalCSS();

  const {
    sessions,
    active,
    phase,
    setPhase,
    startComparison,
    loadComparison,
    deleteSession,
    sendToPanel,
    broadcastToAll,
    endSession,
    updateTitle,
    getRawChunks,
    outputTick,
  } = useComparator();

  // ── New comparison handler ──────────────────────────────────

  const handleNewComparison = useCallback(() => {
    setPhase("setup");
  }, [setPhase]);

  // ── Phase click handler ─────────────────────────────────────

  const handlePhaseClick = useCallback(
    (targetPhase: ComparisonPhase) => {
      // Only allow navigating to completed phases or the current one.
      const targetIndex = PHASE_INDEX[targetPhase];
      const currentIndex = PHASE_INDEX[phase];
      if (targetIndex <= currentIndex) {
        setPhase(targetPhase);
      }
    },
    [phase, setPhase],
  );

  // ── Render phase content ────────────────────────────────────

  function renderPhaseContent() {
    switch (phase) {
      case "setup":
        return <SetupPhase onStart={startComparison} />;
      case "execution":
        return active ? (
          <ExecutionPhase
            active={active}
            getRawChunks={getRawChunks}
            outputTick={outputTick}
            onEndSession={endSession}
            onUpdateTitle={updateTitle}
            onSendToPanel={sendToPanel}
            onBroadcast={broadcastToAll}
          />
        ) : (
          <PhasePlaceholder phase="execution" />
        );
      case "results":
        return active ? (
          <ResultsPhase active={active} onStartJudge={() => setPhase("judge")} />
        ) : (
          <PhasePlaceholder phase="results" />
        );
      case "judge":
        return active ? (
          <JudgePhase active={active} />
        ) : (
          <PhasePlaceholder phase="judge" />
        );
      default:
        return <SetupPhase onStart={startComparison} />;
    }
  }

  return (
    <div style={styles.page}>
      {/* ── Left rail sidebar ────────────────────────────────── */}
      <div style={styles.rail}>
        {/* New Comparison button */}
        <div style={styles.railTop}>
          <button
            style={styles.newBtn}
            onClick={handleNewComparison}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tokens.accentFg;
              e.currentTarget.style.transform = "scale(0.98)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = tokens.accent;
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <PlusIcon />
            New Comparison
          </button>
        </div>

        {/* Phase stepper */}
        <PhaseStepper currentPhase={phase} onPhaseClick={handlePhaseClick} />

        {/* Separator */}
        <div style={{ margin: "0 12px", height: 1, background: tokens.separator, flexShrink: 0 }} />

        {/* Sessions header */}
        <div style={styles.sessionsHeader}>Sessions</div>

        {/* Session list */}
        <div style={styles.sessionsList} className="comparator-rail">
          {sessions.length === 0 ? (
            <div
              style={{
                padding: "16px 8px",
                textAlign: "center",
                fontSize: 11,
                color: tokens.fgPlaceholder,
                fontFamily: fontStack,
              }}
            >
              No sessions yet
            </div>
          ) : (
            sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isActive={active?.id === session.id}
                onClick={() => loadComparison(session.id)}
                onDelete={() => deleteSession(session.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────── */}
      <div style={styles.content}>
        {renderPhaseContent()}
      </div>
    </div>
  );
}
