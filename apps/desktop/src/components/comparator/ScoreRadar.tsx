import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
} from "recharts";

const DIMENSIONS = [
  { key: "correctness", label: "Correctness" },
  { key: "completeness", label: "Completeness" },
  { key: "codeQuality", label: "Quality" },
  { key: "efficiency", label: "Efficiency" },
  { key: "reasoning", label: "Reasoning" },
  { key: "speed", label: "Speed" },
  { key: "safety", label: "Safety" },
  { key: "contextAwareness", label: "Context" },
  { key: "autonomy", label: "Autonomy" },
  { key: "adherence", label: "Adherence" },
] as const;

const COLORS = ["#5b50e8", "#16a34a", "#d97706", "#dc2626"];

interface ScoreRadarProps {
  panels: Array<{
    panelId: string;
    harnessName: string;
    scores: Partial<Record<string, number | null>>;
  }>;
}

export default function ScoreRadar({ panels }: ScoreRadarProps) {
  // Check if any panel has scores
  const hasScores = panels.some((p) =>
    DIMENSIONS.some((d) => p.scores[d.key] != null),
  );

  if (!hasScores) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "var(--fg-subtle)", fontSize: "12px" }}>
        Score dimensions to see the radar chart
      </div>
    );
  }

  const data = DIMENSIONS.map((dim) => {
    const entry: Record<string, string | number> = { dimension: dim.label };
    for (const panel of panels) {
      entry[panel.panelId] = panel.scores[dim.key] ?? 0;
    }
    return entry;
  });

  return (
    <div style={{ width: "100%", maxWidth: "500px", margin: "0 auto" }}>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--border-base)" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 10, fill: "var(--fg-muted)" }}
          />
          <PolarRadiusAxis
            domain={[0, 10]}
            tick={{ fontSize: 9, fill: "var(--fg-subtle)" }}
            tickCount={6}
          />
          {panels.map((panel, i) => (
            <Radar
              key={panel.panelId}
              name={panel.harnessName}
              dataKey={panel.panelId}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          <Legend
            wrapperStyle={{ fontSize: "11px" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
