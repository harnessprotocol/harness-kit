import { useEffect, useRef, useState } from "react";
import { type GenerationPhase, streamRoadmapGeneration } from "../../lib/roadmap-api";

interface Props {
  projectSlug: string;
  onComplete: () => void;
  onCancel: () => void;
}

const PHASES: { id: GenerationPhase; label: string; subtitle: string }[] = [
  { id: "analyzing", label: "Analyzing project", subtitle: "Reading tasks and epics" },
  { id: "generating", label: "Generating roadmap", subtitle: "Claude is thinking..." },
  { id: "saving", label: "Saving", subtitle: "Writing to disk" },
];

const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function PhaseRow({
  id,
  label,
  subtitle,
  activePhase,
  error,
  elapsed,
}: {
  id: GenerationPhase;
  label: string;
  subtitle: string;
  activePhase: GenerationPhase | "done";
  error: string | null;
  elapsed: number;
}) {
  const idx = PHASES.findIndex((p) => p.id === id);
  const activeIdx = PHASES.findIndex((p) => p.id === activePhase);
  const isDone = activePhase === "done" || activeIdx > idx;
  const isActive = activePhase === id;
  const isFailed = isActive && error !== null;
  const isPending = !isDone && !isActive;

  const color = isFailed
    ? "#ef4444"
    : isDone
      ? "var(--accent)"
      : isActive
        ? "var(--text-primary)"
        : "var(--text-muted)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
        opacity: isPending ? 0.35 : 1,
        transition: "opacity 0.3s",
      }}
    >
      {/* Status dot */}
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: isFailed
            ? "rgba(239,68,68,0.12)"
            : isDone
              ? "rgba(99,102,241,0.12)"
              : isActive
                ? "var(--bg-surface)"
                : "transparent",
          border: `1.5px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "all 0.25s",
        }}
      >
        {isDone && !isFailed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <polyline
              points="2 6 5 9 10 3"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {isFailed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <line
              x1="3"
              y1="3"
              x2="9"
              y2="9"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="3"
              x2="3"
              y2="9"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
        {isActive && !isFailed && (
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--accent)",
              animation: "roadmap-pulse 1.2s ease-in-out infinite",
            }}
          />
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: isActive ? 500 : 400,
            color,
            transition: "color 0.25s",
          }}
        >
          {label}
        </div>
        {isActive && !isFailed && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{subtitle}</div>
        )}
      </div>

      {/* Elapsed time on active phase */}
      {isActive && !isFailed && elapsed > 0 && (
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  );
}

export function RoadmapGenerationView({ projectSlug, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<GenerationPhase | "done">("analyzing");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);
  const startedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Ticking elapsed timer
  useEffect(() => {
    const id = setInterval(() => {
      const ms = Date.now() - startTimeRef.current;
      setElapsed(ms);
      if (ms > TIMEOUT_MS && phase !== "done") {
        setError(
          "Generation is taking longer than expected. The API may be overloaded — cancel and try again.",
        );
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Start generation
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const cancel = streamRoadmapGeneration(projectSlug, (event) => {
      if (event.type === "phase" && event.phase) {
        setPhase(event.phase as GenerationPhase);
        setError(null);
      } else if (event.type === "done") {
        setPhase("done");
        setTimeout(onComplete, 500);
      } else if (event.type === "error") {
        setError(event.message ?? "Unknown error");
      }
    });

    cancelRef.current = cancel;
    return () => cancel();
  }, [projectSlug, onComplete]);

  const handleCancel = () => {
    cancelRef.current?.();
    onCancel();
  };

  return (
    <div
      style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}
    >
      <style>{`
        @keyframes roadmap-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>

      <div
        style={{
          width: "100%",
          maxWidth: 380,
          padding: "28px 28px 24px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
              flexShrink: 0,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              <line x1="9" y1="3" x2="9" y2="18" />
              <line x1="15" y1="6" x2="15" y2="21" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              Generating Roadmap
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
              {phase === "done" ? "Complete" : `${formatElapsed(elapsed)} elapsed`}
            </div>
          </div>
        </div>

        {/* Phase list */}
        <div style={{ marginBottom: error ? 14 : 18 }}>
          {PHASES.map((p) => (
            <PhaseRow
              key={p.id}
              id={p.id}
              label={p.label}
              subtitle={p.subtitle}
              activePhase={phase}
              error={error}
              elapsed={elapsed}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(239,68,68,0.07)",
              border: "1px solid rgba(239,68,68,0.18)",
              borderRadius: 7,
              fontSize: 12,
              color: "#ef4444",
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Cancel/Dismiss */}
        {phase !== "done" && (
          <button
            onClick={handleCancel}
            style={{
              width: "100%",
              padding: "7px",
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: 7,
              fontSize: 12,
              color: "var(--text-muted)",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
            }}
          >
            {error ? "Dismiss" : "Cancel"}
          </button>
        )}
      </div>
    </div>
  );
}
