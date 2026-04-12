import { useCallback, useEffect, useRef, useState } from "react";
import type { ComparisonPhase, ComparisonSummary, HarnessRecommendation, TaskType } from "@harness-kit/shared";
import { invoke } from "@tauri-apps/api/core";
import { useComparator } from "../../hooks/useComparator";
import SetupPhase from "./SetupPhase";
import ExecutionPhase from "./ExecutionPhase";
import ResultsPhase from "./ResultsPhase";
import JudgePhase from "./JudgePhase";
import RecommendationsPanel, { TaskTypeSelector } from "../../components/comparator/RecommendationsPanel";
import AccountStatusBadge from "../../components/AccountStatusBadge";
import { detectClaudeAccount } from "../../lib/tauri";
import type { ClaudeAccountInfo } from "../../lib/tauri";

// ── Design Tokens ───────────────────────────────────────────

const tokens = {
  bgBase: "var(--bg-base)",
  bgSurface: "var(--bg-surface)",
  bgElevated: "var(--bg-elevated)",
  bgSidebar: "var(--bg-sidebar)",
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
  warning: "var(--warning)",
  danger: "var(--danger)",
  hoverBg: "var(--hover-bg)",
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
      background: var(--border-base);
      border-radius: 3px;
    }
    .comparator-rail::-webkit-scrollbar-thumb:hover {
      background: var(--border-strong);
    }
    .stepper-line-animated {
      transition: background 400ms ease-out;
    }
    /* Focus rings for keyboard navigation */
    .comparator-focusable:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: 4px;
    }
    @media (prefers-reduced-motion: reduce) {
      .comparator-pulse-dot {
        animation: none !important;
      }
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
    transition: "background 150ms ease-out, transform 100ms ease-out",
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
    transition: "background 150ms ease-out",
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
    transition: "all 150ms ease-out",
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
    transition: "background 150ms ease-out",
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
    transition: "background 150ms ease-out, color 150ms ease-out",
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
              className="comparator-focusable"
              tabIndex={0}
              role="button"
              style={styles.stepRow}
              onClick={() => onPhaseClick(p.key)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPhaseClick(p.key); } }}
              onMouseEnter={(e) => { e.currentTarget.style.background = tokens.hoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div style={dotStyle}>
                {isDone ? <CheckIcon /> : p.step}
              </div>
              <span style={labelStyle}>{p.label}</span>
            </div>
            {i < PHASES.length - 1 && <div className="stepper-line-animated" style={lineStyle} />}
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimerRef = useRef<number>(0);
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
        {(hovered || confirmDelete) && (
          <button
            style={{
              ...styles.deleteBtn,
              ...(confirmDelete
                ? { background: "rgba(220, 38, 38, 0.1)", color: tokens.danger, width: "auto", padding: "0 4px" }
                : deleteHovered
                  ? { background: "rgba(220, 38, 38, 0.1)", color: tokens.danger }
                  : {}),
            }}
            title="Delete session"
            onClick={(e) => {
              e.stopPropagation();
              if (confirmDelete) {
                clearTimeout(confirmTimerRef.current);
                setConfirmDelete(false);
                onDelete();
              } else {
                setConfirmDelete(true);
                confirmTimerRef.current = window.setTimeout(() => setConfirmDelete(false), 2000);
              }
            }}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
          >
            {confirmDelete ? (
              <span style={{ fontSize: 9, fontWeight: 600, color: tokens.danger }}>Delete?</span>
            ) : (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            )}
          </button>
        )}
      </div>
      <div style={styles.sessionMeta}>
        <div className="comparator-pulse-dot" style={dotStyle} />
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

  // ── Account state ────────────────────────────────────────────

  const [account, setAccount] = useState<ClaudeAccountInfo | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  useEffect(() => {
    detectClaudeAccount()
      .then(setAccount)
      .catch(() => setAccount({ logged_in: false, subscription_type: null, auto_mode_available: false }))
      .finally(() => setAccountLoading(false));
  }, []);

  // ── Task-fit routing state ──────────────────────────────────

  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [recommendations, setRecommendations] = useState<HarnessRecommendation[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  useEffect(() => {
    if (!taskType) {
      setRecommendations([]);
      return;
    }
    setRecLoading(true);
    invoke<HarnessRecommendation[]>("get_harness_recommendations", { taskType })
      .then(setRecommendations)
      .catch(() => setRecommendations([]))
      .finally(() => setRecLoading(false));
  }, [taskType]);

  // Reset task type when moving to a new setup phase
  useEffect(() => {
    if (phase === "setup") setTaskType(null);
  }, [phase]);

  // ── Wrapped start that threads taskType into startComparison ─

  const handleStart = useCallback(
    (opts: Parameters<typeof startComparison>[0]) => {
      return startComparison({ ...opts, taskType: taskType ?? undefined });
    },
    [startComparison, taskType],
  );

  // ── New comparison handler ──────────────────────────────────

  const handleNewComparison = useCallback(() => {
    if (active && active.panels.some(p => p.status === "running")) {
      endSession();
    } else {
      setPhase("setup");
    }
  }, [active, endSession, setPhase]);

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
        return (
          <div>
            {/* Account badge + task type selector — above the setup form */}
            <div style={{ padding: "16px 24px 0", display: "flex", flexDirection: "column", gap: "10px" }}>
              <AccountStatusBadge account={account} monthlyTokens={0} loading={accountLoading} />
              <span style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
              }}>
                Task type (optional)
              </span>
              <TaskTypeSelector selected={taskType} onChange={setTaskType} />
              <RecommendationsPanel
                taskType={taskType}
                recommendations={recommendations}
                loading={recLoading}
              />
            </div>
            <SetupPhase onStart={handleStart} />
          </div>
        );
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
        return <SetupPhase onStart={handleStart} />;
    }
  }

  return (
    <div style={styles.page}>
      {/* ── Left rail sidebar ────────────────────────────────── */}
      <div style={styles.rail}>
        {/* New Comparison button */}
        <div style={styles.railTop}>
          <button
            className="comparator-focusable"
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
            <div style={{
              padding: "24px 12px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: tokens.bgElevated,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: tokens.fgPlaceholder,
              }}>
                {/* Split comparison icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="18" rx="2" />
                  <path d="M12 3v18" />
                </svg>
              </div>
              <span style={{ fontSize: 11, color: tokens.fgPlaceholder, fontFamily: fontStack }}>
                No sessions yet
              </span>
              <span style={{ fontSize: 10, color: tokens.fgPlaceholder, opacity: 0.7, fontFamily: fontStack }}>
                Click <strong>New Comparison</strong> to start
              </span>
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
