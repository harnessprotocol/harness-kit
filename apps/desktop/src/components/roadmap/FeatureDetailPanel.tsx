import { useState } from "react";
import {
  ROADMAP_COMPLEXITY_CONFIG,
  ROADMAP_IMPACT_CONFIG,
  ROADMAP_PRIORITY_CONFIG,
} from "../../lib/roadmap-constants";
import type { CompetitorPainPoint, RoadmapFeature } from "../../lib/roadmap-types";

interface Props {
  feature: RoadmapFeature;
  competitorInsights: CompetitorPainPoint[];
  onClose: () => void;
  onConvertToTask: (f: RoadmapFeature) => void;
  onGoToTask?: (taskId: number) => void;
  onDelete: (featureId: string) => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  high: "#dc2626",
  medium: "#d97706",
  low: "#16a34a",
};

export function FeatureDetailPanel({
  feature,
  competitorInsights,
  onClose,
  onConvertToTask,
  onGoToTask,
  onDelete,
}: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const priorityCfg = ROADMAP_PRIORITY_CONFIG[feature.priority];
  const complexityCfg = ROADMAP_COMPLEXITY_CONFIG[feature.complexity];
  const impactCfg = ROADMAP_IMPACT_CONFIG[feature.impact];

  function handleDelete() {
    onDelete(feature.id);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 384,
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Priority + complexity + impact badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              <span
                style={{
                  borderRadius: 9999,
                  border: `1px solid ${priorityCfg.border}`,
                  background: priorityCfg.bg,
                  color: priorityCfg.color,
                  padding: "1px 7px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {priorityCfg.label}
              </span>
              <span
                style={{
                  borderRadius: 9999,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-elevated)",
                  padding: "1px 7px",
                  fontSize: 10,
                  fontWeight: 500,
                  color: complexityCfg.color,
                }}
              >
                {complexityCfg.label} complexity
              </span>
              <span
                style={{
                  borderRadius: 9999,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-elevated)",
                  padding: "1px 7px",
                  fontSize: 10,
                  fontWeight: 500,
                  color: impactCfg.color,
                }}
              >
                {impactCfg.label} impact
              </span>
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.4,
              }}
            >
              {feature.title}
            </h2>
          </div>

          {/* Control buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {/* Delete button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete feature"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                background: "transparent",
                border: "none",
                borderRadius: 5,
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 14,
                transition: "color 0.1s, background 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#dc2626";
                (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {"🗑"}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              title="Close"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                background: "transparent",
                border: "none",
                borderRadius: 5,
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 16,
                transition: "color 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              {"›"}
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Description */}
          <section>
            <h3
              style={{
                margin: "0 0 6px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Description
            </h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              {feature.description}
            </p>
          </section>

          {/* Rationale */}
          {feature.rationale && (
            <section>
              <h3
                style={{
                  margin: "0 0 6px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Rationale
              </h3>
              <div
                style={{
                  borderLeft: "3px solid var(--accent)",
                  paddingLeft: 10,
                  margin: 0,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "var(--text-secondary)",
                  }}
                >
                  {feature.rationale}
                </p>
              </div>
            </section>
          )}

          {/* Metrics grid */}
          <section>
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Metrics
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "Complexity", value: complexityCfg.label, color: complexityCfg.color },
                { label: "Impact", value: impactCfg.label, color: impactCfg.color },
                {
                  label: "Dependencies",
                  value: String(feature.dependencies.length),
                  color: "var(--text-primary)",
                },
              ].map((m) => (
                <div
                  key={m.label}
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 7,
                    padding: "10px 8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.color, marginBottom: 2 }}>
                    {m.value}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* User Stories */}
          {feature.userStories.length > 0 && (
            <section>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                User Stories
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {feature.userStories.map((story, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 6,
                      padding: "8px 10px",
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--text-secondary)",
                      fontStyle: "italic",
                    }}
                  >
                    "{story}"
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Acceptance Criteria */}
          {feature.acceptanceCriteria.length > 0 && (
            <section>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Acceptance Criteria
              </h3>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {feature.acceptanceCriteria.map((criterion, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 7,
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--text-muted)",
                        flexShrink: 0,
                        marginTop: 2,
                        fontSize: 11,
                      }}
                    >
                      ○
                    </span>
                    {criterion}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Competitor Insights */}
          {competitorInsights.length > 0 && (
            <section>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#2563eb",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {"↗"} Competitor Pain Points
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {competitorInsights.map((insight) => (
                  <div
                    key={insight.id}
                    style={{
                      background: "rgba(37,99,235,0.05)",
                      border: "1px solid rgba(37,99,235,0.2)",
                      borderRadius: 7,
                      padding: "10px 12px",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 6px",
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "var(--text-primary)",
                      }}
                    >
                      {insight.description}
                    </p>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      <span
                        style={{
                          borderRadius: 9999,
                          border: "1px solid var(--border-subtle)",
                          background: "var(--bg-elevated)",
                          padding: "1px 6px",
                          fontSize: 10,
                          color: "var(--text-muted)",
                        }}
                      >
                        {insight.source}
                      </span>
                      <span
                        style={{
                          borderRadius: 9999,
                          border: `1px solid ${SEVERITY_COLOR[insight.severity] ?? "var(--border-subtle)"}44`,
                          background: `${SEVERITY_COLOR[insight.severity] ?? "transparent"}15`,
                          padding: "1px 6px",
                          fontSize: 10,
                          fontWeight: 500,
                          color: SEVERITY_COLOR[insight.severity] ?? "var(--text-muted)",
                        }}
                      >
                        {insight.severity} severity
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Actions footer */}
      <div
        style={{
          flexShrink: 0,
          padding: "12px 16px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {feature.linkedTaskId != null ? (
          <button
            onClick={() => onGoToTask?.(feature.linkedTaskId!)}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "border-color 0.1s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            }}
          >
            <span>{"↗"}</span>
            Go to Task #{feature.linkedTaskId}
          </button>
        ) : (
          <button
            onClick={() => onConvertToTask(feature)}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "opacity 0.1s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "0.85";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "1";
            }}
          >
            <span>{"⚡"}</span>
            Convert to Task
          </button>
        )}
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--bg-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 10,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 280 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(220,38,38,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
                fontSize: 22,
              }}
            >
              {"🗑"}
            </div>
            <h3
              style={{
                margin: "0 0 6px",
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Delete Feature?
            </h3>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              This will permanently remove "{feature.title}" from your roadmap.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: "6px 16px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                style={{
                  padding: "6px 16px",
                  background: "#dc2626",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
