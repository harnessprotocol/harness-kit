import type { HarnessRecommendation, TaskType } from "@harness-kit/shared";

const TASK_LABELS: Record<TaskType, string> = {
  coding: "Coding",
  review: "Review",
  planning: "Planning",
  analysis: "Analysis",
  debugging: "Debugging",
  documentation: "Documentation",
};

const ALL_TASK_TYPES: TaskType[] = [
  "coding",
  "review",
  "planning",
  "analysis",
  "debugging",
  "documentation",
];

const fontStack = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

// ── Task type pill row ───────────────────────────────────────

interface TaskTypeSelectorProps {
  selected: TaskType | null;
  onChange: (t: TaskType | null) => void;
}

export function TaskTypeSelector({ selected, onChange }: TaskTypeSelectorProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        fontFamily: fontStack,
      }}
    >
      {ALL_TASK_TYPES.map((tt) => {
        const active = selected === tt;
        return (
          <button
            key={tt}
            data-testid={`task-type-pill-${tt}`}
            onClick={() => onChange(active ? null : tt)}
            style={{
              fontSize: "12px",
              fontWeight: active ? 600 : 400,
              padding: "4px 12px",
              borderRadius: "16px",
              border: `1px solid ${active ? "var(--accent)" : "var(--border-base)"}`,
              background: active ? "rgba(91,80,232,0.12)" : "var(--bg-elevated)",
              color: active ? "var(--accent-text)" : "var(--fg-muted)",
              cursor: "pointer",
              transition: "all 100ms ease",
            }}
          >
            {TASK_LABELS[tt]}
          </button>
        );
      })}
    </div>
  );
}

// ── Win-rate bar ─────────────────────────────────────────────

function WinRateBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          flex: 1,
          height: "4px",
          background: "var(--border-subtle)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--accent)",
            borderRadius: "2px",
            transition: "width 300ms ease",
          }}
        />
      </div>
      <span
        style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-muted)", minWidth: "30px" }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ── Recommendations panel ────────────────────────────────────

interface Props {
  taskType: TaskType | null;
  recommendations: HarnessRecommendation[];
  loading?: boolean;
}

export default function RecommendationsPanel({ taskType, recommendations, loading }: Props) {
  if (!taskType) return null;

  const top3 = recommendations.slice(0, 3);
  const taskLabel = TASK_LABELS[taskType];

  return (
    <div
      data-testid="recommendations-panel"
      style={{
        fontFamily: fontStack,
        marginTop: "12px",
        padding: "14px 16px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "10px",
        }}
      >
        Best for {taskLabel}
      </div>

      {loading ? (
        <div style={{ fontSize: "12px", color: "var(--fg-subtle)" }}>Loading…</div>
      ) : top3.length === 0 ? (
        <p
          data-testid="recommendations-empty"
          style={{ margin: 0, fontSize: "12px", color: "var(--fg-subtle)", lineHeight: 1.5 }}
        >
          Run 3+ comparisons tagged as <strong>{taskLabel}</strong> to see recommendations.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {top3.map((rec) => (
            <div
              key={rec.harnessId}
              data-testid="recommendation-row"
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-base)" }}>
                  {rec.harnessName}
                </span>
                <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                  {rec.sessionCount} sessions
                </span>
              </div>
              <WinRateBar rate={rec.winRate} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
