import { ROADMAP_PRIORITY_CONFIG } from "../../lib/roadmap-constants";
import type { CompetitorAnalysis, Roadmap } from "../../lib/roadmap-types";

interface Props {
  roadmap: Roadmap;
  competitorAnalysis: CompetitorAnalysis | null;
  onAddFeature: () => void;
  onRefresh: () => void;
  onViewCompetitors: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> =
  {
    active: {
      label: "Active",
      color: "#16a34a",
      bg: "rgba(22,163,74,0.1)",
      border: "rgba(22,163,74,0.2)",
    },
    draft: {
      label: "Draft",
      color: "#d97706",
      bg: "rgba(217,119,6,0.1)",
      border: "rgba(217,119,6,0.2)",
    },
    archived: {
      label: "Archived",
      color: "#9a9892",
      bg: "rgba(154,152,146,0.1)",
      border: "rgba(154,152,146,0.2)",
    },
  };

export function RoadmapHeader({
  roadmap,
  competitorAnalysis,
  onAddFeature,
  onRefresh,
  onViewCompetitors,
}: Props) {
  const statusCfg = STATUS_CONFIG[roadmap.status] ?? STATUS_CONFIG["draft"];

  const totalFeatures = roadmap.features.length;
  const byPriority = (["must", "should", "could", "wont"] as const)
    .map((p) => ({
      priority: p,
      count: roadmap.features.filter((f) => f.priority === p).length,
      config: ROADMAP_PRIORITY_CONFIG[p],
    }))
    .filter((x) => x.count > 0);

  const competitorCount = competitorAnalysis?.competitors.length ?? 0;
  const painPointCount =
    competitorAnalysis?.competitors.reduce((sum, c) => sum + c.painPoints.length, 0) ?? 0;

  return (
    <div
      style={{
        flexShrink: 0,
        borderBottom: "1px solid var(--border-subtle)",
        padding: "14px 20px",
        background: "var(--bg-surface)",
      }}
    >
      {/* Top row: title + status + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + status badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
              {roadmap.projectName}
            </h2>
            <span
              style={{
                borderRadius: 9999,
                border: `1px solid ${statusCfg.border}`,
                background: statusCfg.bg,
                color: statusCfg.color,
                padding: "1px 8px",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {statusCfg.label}
            </span>

            {/* Competitor analysis chip */}
            {competitorAnalysis && (
              <button
                onClick={onViewCompetitors}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 9999,
                  border: "1px solid rgba(37,99,235,0.3)",
                  background: "rgba(37,99,235,0.08)",
                  color: "#2563eb",
                  padding: "1px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                title={`${competitorCount} competitors · ${painPointCount} pain points`}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.15)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.08)";
                }}
              >
                <span style={{ fontSize: 11 }}>{"↗"}</span>
                {competitorCount} Competitor{competitorCount !== 1 ? "s" : ""}
              </button>
            )}
          </div>

          {/* Vision */}
          <p
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--text-secondary)",
              maxWidth: 560,
            }}
          >
            {roadmap.vision}
          </p>

          {/* Target audience + meta chips */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            {roadmap.targetAudience?.primary && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 9999,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-elevated)",
                  padding: "1px 8px",
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                <span style={{ fontSize: 12 }}>{"◎"}</span>
                {roadmap.targetAudience.primary}
              </span>
            )}

            {/* Feature count */}
            <span
              style={{
                borderRadius: 9999,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-elevated)",
                padding: "1px 8px",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              {totalFeatures} feature{totalFeatures !== 1 ? "s" : ""}
            </span>

            {/* Priority breakdown badges */}
            {byPriority.map(({ priority, count, config }) => (
              <span
                key={priority}
                style={{
                  borderRadius: 9999,
                  border: `1px solid ${config.border}`,
                  background: config.bg,
                  color: config.color,
                  padding: "1px 7px",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {count} {config.label}
              </span>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            onClick={onAddFeature}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 12px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-primary)",
              cursor: "pointer",
              transition: "border-color 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLElement).style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            Add Feature
          </button>

          <button
            onClick={onRefresh}
            title="Regenerate roadmap"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 14,
              color: "var(--text-muted)",
              cursor: "pointer",
              transition: "border-color 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLElement).style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            {"↺"}
          </button>
        </div>
      </div>
    </div>
  );
}
