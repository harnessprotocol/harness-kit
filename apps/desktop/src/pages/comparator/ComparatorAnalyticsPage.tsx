import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { getComparatorAnalytics } from "../../lib/tauri";
import type { AnalyticsData } from "@harness-kit/shared";

const COLORS = ["#5b50e8", "#16a34a", "#d97706", "#dc2626", "#7c3aed"];

export default function ComparatorAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getComparatorAnalytics()
      .then(setData)
      .catch((e) => console.error("Failed to load analytics:", e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <p className="text-caption">Loading analytics...</p>
      </div>
    );
  }

  if (!data || data.totalComparisons === 0) {
    return (
      <div style={{ padding: "20px 24px", maxWidth: "720px" }}>
        <h1 className="text-title" style={{ margin: "0 0 4px" }}>Analytics</h1>
        <p className="text-caption" style={{ margin: "0 0 20px" }}>
          No evaluated comparisons yet. Run and evaluate comparisons to see analytics.
        </p>
      </div>
    );
  }

  const mostTested = data.winRates.reduce(
    (max, wr) => (wr.total > max.total ? wr : max),
    data.winRates[0],
  );

  const topModel = data.modelWinRates.length > 0
    ? data.modelWinRates.reduce((max, wr) => (wr.rate > max.rate ? wr : max), data.modelWinRates[0])
    : null;

  // Group dimension averages by harness for the grouped bar chart
  const dimensions = [...new Set(data.dimensionAverages.map((d) => d.dimension))];
  const harnessIds = [...new Set(data.dimensionAverages.map((d) => d.harnessId))];
  const harnessNameMap = Object.fromEntries(
    data.dimensionAverages.map((d) => [d.harnessId, d.harnessName]),
  );

  const dimChartData = dimensions.map((dim) => {
    const entry: Record<string, string | number> = { dimension: dim };
    for (const hid of harnessIds) {
      const found = data.dimensionAverages.find(
        (d) => d.dimension === dim && d.harnessId === hid,
      );
      entry[hid] = found ? Math.round(found.avg * 10) / 10 : 0;
    }
    return entry;
  });

  return (
    <div style={{ padding: "20px 24px", maxWidth: "900px" }}>
      <h1 className="text-title" style={{ margin: "0 0 4px" }}>Analytics</h1>
      <p className="text-caption" style={{ margin: "0 0 24px" }}>
        Aggregated results across all evaluated comparisons.
      </p>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "28px", flexWrap: "wrap" }}>
        <StatCard label="Total Comparisons" value={String(data.totalComparisons)} />
        <StatCard label="Most Tested" value={mostTested?.harnessName ?? "--"} />
        {topModel && <StatCard label="Top Model" value={topModel.model} />}
      </div>

      {/* Win rate bar chart */}
      {data.winRates.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <h2 className="text-headline" style={{ margin: "0 0 12px" }}>Win Rates</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={data.winRates.map((wr) => ({
                name: wr.harnessName,
                rate: Math.round(wr.rate * 100),
                wins: wr.wins,
                total: wr.total,
              }))}
              layout="vertical"
              margin={{ left: 100, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-base)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
                formatter={(value) =>
                  [`${value}%`, "Win Rate"]
                }
              />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                {data.winRates.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dimension comparison */}
      {dimChartData.length > 0 && (
        <div>
          <h2 className="text-headline" style={{ margin: "0 0 12px" }}>
            Dimension Averages
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dimChartData} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" />
              <XAxis dataKey="dimension" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-base)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
              />
              {harnessIds.map((hid, i) => (
                <Bar
                  key={hid}
                  dataKey={hid}
                  name={harnessNameMap[hid]}
                  fill={COLORS[i % COLORS.length]}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: "1 1 140px",
        padding: "14px 16px",
        borderRadius: "10px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--fg-subtle)",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--fg-base)" }}>
        {value}
      </div>
    </div>
  );
}
