import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { readStatsCache } from "../../lib/tauri";
import { formatNumber, formatDate, formatHour, shortModelName, daysBetween } from "../../lib/format";
import type { StatsCache, DailyActivity } from "@harness-kit/shared";

type TimeRange = "30d" | "90d" | "all";

function useReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getAccentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5b50e8";
}

// ── Stat card ────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: "var(--bg-surface)",
      border: "1px solid var(--border-base)",
      borderRadius: "8px",
      padding: "12px 16px",
    }}>
      <div style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.5px", color: "var(--fg-base)", lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-subtle)", marginTop: "4px" }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "2px" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Pill button ───────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: "11px",
        fontWeight: active ? 600 : 400,
        padding: "3px 10px",
        borderRadius: "12px",
        border: "1px solid",
        borderColor: active ? "var(--accent)" : "var(--border-base)",
        background: active ? "var(--accent-light)" : "transparent",
        color: active ? "var(--accent-text)" : "var(--fg-muted)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ── Chart card wrapper ────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-base)",
      borderRadius: "8px",
      padding: "14px 16px",
    }}>
      <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-muted)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Custom tooltip style ──────────────────────────────────────

const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-base)",
  borderRadius: "6px",
  fontSize: "11px",
  color: "var(--fg-base)",
  padding: "6px 10px",
};

const axisStyle = { fontSize: 10, fill: "var(--fg-subtle)" };

// ── Main component ────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<StatsCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("30d");
  const [accentColor, setAccentColor] = useState(getAccentColor);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    readStatsCache()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Re-read accent on mount to pick up dynamic theme
  useEffect(() => {
    setAccentColor(getAccentColor());
  }, []);

  const isStale = useMemo(() => {
    if (!data?.lastComputedDate) return false;
    return daysBetween(data.lastComputedDate) > 3;
  }, [data]);

  const filteredActivity = useMemo((): DailyActivity[] => {
    if (!data?.dailyActivity) return [];
    const all = data.dailyActivity;
    if (range === "all") return all;
    const cutoff = range === "30d" ? 30 : 90;
    const threshold = Date.now() - cutoff * 24 * 60 * 60 * 1000;
    return all.filter((d) => new Date(d.date + "T00:00:00").getTime() >= threshold);
  }, [data, range]);

  const activityChartData = useMemo(() =>
    filteredActivity.map((d) => ({
      date: formatDate(d.date),
      messages: d.messageCount ?? 0,
    })),
    [filteredActivity]
  );

  const modelChartData = useMemo(() => {
    if (!data?.modelUsage) return [];
    return Object.entries(data.modelUsage)
      .map(([model, usage]) => ({
        name: shortModelName(model),
        tokens: (usage.outputTokens ?? 0),
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [data]);

  const hourlyChartData = useMemo(() => {
    if (!data?.hourCounts) return [];
    return Array.from({ length: 24 }, (_, i) => ({
      hour: formatHour(i),
      count: data.hourCounts?.[String(i)] ?? 0,
    }));
  }, [data]);

  const modelCount = useMemo(() => {
    if (!data?.modelUsage) return 0;
    return Object.keys(data.modelUsage).length;
  }, [data]);

  const firstSessionDate = useMemo(() => {
    if (!data?.dailyActivity?.length) return "—";
    const dates = data.dailyActivity.map((d) => d.date).sort();
    return formatDate(dates[0]);
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <div style={{ marginBottom: "16px" }}>
          <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
            Observatory
          </h1>
        </div>
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "13px",
          color: "var(--danger)",
        }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Observatory
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Claude Code usage patterns and activity trends
        </p>
      </div>

      {/* Stale warning */}
      {isStale && data?.lastComputedDate && (
        <div style={{
          background: "rgba(217, 119, 6, 0.1)",
          border: "1px solid rgba(217, 119, 6, 0.3)",
          borderRadius: "6px",
          padding: "7px 12px",
          fontSize: "11px",
          color: "var(--warning)",
          marginBottom: "16px",
        }}>
          Stats cache last updated {daysBetween(data.lastComputedDate)} days ago — data may be incomplete.
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <StatCard label="Total Sessions" value={formatNumber(data?.totalSessions ?? 0)} />
        <StatCard label="Total Messages" value={formatNumber(data?.totalMessages ?? 0)} />
        <StatCard label="Models Used" value={String(modelCount)} />
        <StatCard label="First Session" value={firstSessionDate} />
      </div>

      {/* Activity chart */}
      <div style={{ marginBottom: "16px" }}>
        <ChartCard title="Daily Activity">
          <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
            {(["30d", "90d", "all"] as TimeRange[]).map((r) => (
              <Pill key={r} label={r === "all" ? "All" : r} active={range === r} onClick={() => setRange(r)} />
            ))}
          </div>
          {activityChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={activityChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accentColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={accentColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="messages"
                  stroke={accentColor}
                  strokeWidth={1.5}
                  fill="url(#activityGrad)"
                  dot={false}
                  isAnimationActive={!reducedMotion}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ fontSize: "12px", color: "var(--fg-subtle)", textAlign: "center", padding: "20px 0" }}>
              No activity data in this range.
            </p>
          )}
        </ChartCard>
      </div>

      {/* Model breakdown + hourly distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {/* Model breakdown — horizontal bar chart */}
        <ChartCard title="Output Tokens by Model">
          {modelChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={modelChartData} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} width={70} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip contentStyle={tooltipStyle} formatter={((v: any) => formatNumber(v)) as any} />
                <Bar dataKey="tokens" fill={accentColor} radius={[0, 3, 3, 0]} isAnimationActive={!reducedMotion} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ fontSize: "12px", color: "var(--fg-subtle)", textAlign: "center", padding: "20px 0" }}>No model data.</p>
          )}
        </ChartCard>

        {/* Hourly distribution */}
        <ChartCard title="Activity by Hour of Day">
          {hourlyChartData.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={hourlyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                <XAxis dataKey="hour" tick={axisStyle} tickLine={false} axisLine={false} interval={3} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={accentColor} radius={[2, 2, 0, 0]} isAnimationActive={!reducedMotion} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ fontSize: "12px", color: "var(--fg-subtle)", textAlign: "center", padding: "20px 0" }}>No hourly data.</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
