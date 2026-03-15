import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { readStatsCache, readLiveActivity } from "../../lib/tauri";
import { formatNumber, formatDate, formatHour, shortModelName } from "../../lib/format";
import type { StatsCache, LiveDailyActivity } from "@harness-kit/shared";

// ── Date range types ─────────────────────────────────────────

type Preset = "1d" | "7d" | "30d" | "1y" | "all";

interface DateRange {
  preset: Preset | "custom";
  start: string; // "YYYY-MM-DD"
  end: string;   // "YYYY-MM-DD"
}

function presetToDates(preset: Preset): { start: string; end: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  if (preset === "1d") return { start: daysAgo(1), end: today };
  if (preset === "7d") return { start: daysAgo(7), end: today };
  if (preset === "30d") return { start: daysAgo(30), end: today };
  if (preset === "1y") return { start: daysAgo(365), end: today };
  return { start: "", end: "" }; // "all"
}

function defaultRange(): DateRange {
  const { start, end } = presetToDates("30d");
  return { preset: "30d", start, end };
}

// ── Generic date filter ──────────────────────────────────────

function filterByRange<T extends { date: string }>(items: T[], range: DateRange): T[] {
  if (range.preset === "all" || (!range.start && !range.end)) return items;
  return items.filter((d) => {
    if (range.start && d.date < range.start) return false;
    if (range.end && d.date > range.end) return false;
    return true;
  });
}

// ── Hooks ────────────────────────────────────────────────────

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

// ── Global date control ──────────────────────────────────────

function GlobalDateControl({
  range, onChange, hasOverrides, onResetOverrides, idPrefix,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  hasOverrides: boolean;
  onResetOverrides: () => void;
  idPrefix?: string;
}) {
  const startId = idPrefix ? `${idPrefix}-start` : "range-start";
  const endId = idPrefix ? `${idPrefix}-end` : "range-end";
  const presets: Preset[] = ["1d", "7d", "30d", "1y", "all"];

  function selectPreset(p: Preset) {
    const dates = presetToDates(p);
    onChange({ preset: p, ...dates });
  }

  function handleCustomDate(field: "start" | "end", value: string) {
    onChange({ ...range, preset: "custom", [field]: value });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
      {presets.map((p) => (
        <Pill
          key={p}
          label={p === "all" ? "All" : p}
          active={range.preset === p}
          onClick={() => selectPreset(p)}
        />
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "4px" }}>
        <label htmlFor={startId} style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>Start date</label>
        <input
          id={startId}
          type="date"
          value={range.start}
          onChange={(e) => handleCustomDate("start", e.target.value)}
          style={{
            fontSize: "11px",
            padding: "2px 6px",
            borderRadius: "5px",
            border: "1px solid var(--border-base)",
            background: "var(--bg-surface)",
            color: "var(--fg-base)",
          }}
        />
        <label htmlFor={endId} style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>End date</label>
        <input
          id={endId}
          type="date"
          value={range.end}
          onChange={(e) => handleCustomDate("end", e.target.value)}
          style={{
            fontSize: "11px",
            padding: "2px 6px",
            borderRadius: "5px",
            border: "1px solid var(--border-base)",
            background: "var(--bg-surface)",
            color: "var(--fg-base)",
          }}
        />
      </div>
      {hasOverrides && (
        <button
          onClick={onResetOverrides}
          style={{
            fontSize: "10px",
            padding: "2px 8px",
            borderRadius: "5px",
            border: "1px solid var(--border-base)",
            background: "var(--bg-base)",
            color: "var(--fg-muted)",
            cursor: "pointer",
            marginLeft: "4px",
          }}
        >
          Reset overrides
        </button>
      )}
    </div>
  );
}

// ── Chart card wrapper ────────────────────────────────────────

function ChartCard({
  title, children, chartId, override, onOverride, onClearOverride, globalRange,
}: {
  title: string;
  children: React.ReactNode;
  chartId?: string;
  override?: DateRange | null;
  onOverride?: (r: DateRange) => void;
  onClearOverride?: () => void;
  globalRange?: DateRange;
}) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-base)",
      borderRadius: "8px",
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title}
        </p>
        {chartId && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {override && (
              <button onClick={onClearOverride} style={{ fontSize: "9px", color: "var(--accent-text)", border: "none", background: "none", cursor: "pointer", padding: "1px 4px" }}>
                ×reset
              </button>
            )}
            <button
              onClick={() => setShowPicker((s) => !s)}
              style={{ fontSize: "9px", color: override ? "var(--accent-text)" : "var(--fg-subtle)", border: "none", background: "none", cursor: "pointer", padding: "1px 4px" }}
              title="Override date range for this chart"
            >
              {override ? `${override.preset !== "custom" ? override.preset : `${override.start}–${override.end}`}` : "range"}
            </button>
          </div>
        )}
      </div>
      {showPicker && chartId && globalRange && onOverride && (
        <div style={{ marginBottom: "8px" }}>
          <GlobalDateControl
            range={override ?? globalRange}
            onChange={(r) => { onOverride(r); setShowPicker(false); }}
            hasOverrides={false}
            onResetOverrides={() => {}}
            idPrefix={chartId}
          />
        </div>
      )}
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
  const [liveActivity, setLiveActivity] = useState<LiveDailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalRange, setGlobalRange] = useState<DateRange>(defaultRange);
  const [chartOverrides, setChartOverrides] = useState<Record<string, DateRange | null>>({});
  const [accentColor, setAccentColor] = useState(getAccentColor);
  const reducedMotion = useReducedMotion();

  function setChartOverride(chartId: string, range: DateRange) {
    setChartOverrides((prev) => ({ ...prev, [chartId]: range }));
  }

  function clearOverride(chartId: string) {
    setChartOverrides((prev) => ({ ...prev, [chartId]: null }));
  }

  const hasOverrides = Object.values(chartOverrides).some(Boolean);

  function rangeForChart(chartId: string): DateRange {
    return chartOverrides[chartId] ?? globalRange;
  }

  useEffect(() => {
    Promise.all([
      readStatsCache().then(setData),
      readLiveActivity().then(setLiveActivity),
    ])
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Re-read accent on mount to pick up dynamic theme
  useEffect(() => {
    setAccentColor(getAccentColor());
  }, []);

  const filteredLiveActivity = useMemo(() =>
    filterByRange(liveActivity, rangeForChart("messages")),
    [liveActivity, globalRange, chartOverrides]
  );

  const activityChartData = useMemo(() =>
    filteredLiveActivity.map((d) => ({
      date: formatDate(d.date),
      messages: d.messageCount,
    })),
    [filteredLiveActivity]
  );

  const sessionsChartData = useMemo(() => {
    const filtered = filterByRange(liveActivity, rangeForChart("sessions"));
    return filtered.map((d) => ({
      date: formatDate(d.date),
      sessions: d.sessionCount,
    }));
  }, [liveActivity, globalRange, chartOverrides]);

  const toolCallsChartData = useMemo(() => {
    const filtered = filterByRange(data?.dailyActivity ?? [], rangeForChart("toolCalls"));
    return filtered.map((d) => ({
      date: formatDate(d.date),
      toolCalls: d.toolCallCount ?? 0,
    }));
  }, [data, globalRange, chartOverrides]);

  const totalToolCalls = useMemo(() => {
    if (!data?.dailyActivity) return 0;
    return data.dailyActivity.reduce((sum, d) => sum + (d.toolCallCount ?? 0), 0);
  }, [data]);

  const { totalOutputTokens, cacheHitRate } = useMemo(() => {
    if (!data?.modelUsage) return { totalOutputTokens: 0, cacheHitRate: null };
    let outTokens = 0, cacheRead = 0, input = 0, cacheCreate = 0;
    for (const m of Object.values(data.modelUsage)) {
      outTokens += m.outputTokens ?? 0;
      cacheRead += m.cacheReadInputTokens ?? 0;
      input += m.inputTokens ?? 0;
      cacheCreate += m.cacheCreationInputTokens ?? 0;
    }
    const total = input + cacheRead + cacheCreate;
    return {
      totalOutputTokens: outTokens,
      cacheHitRate: total > 0 ? Math.round((cacheRead / total) * 100) : null,
    };
  }, [data]);

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
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0, display: "inline" }}>
          Observatory
        </h1>
        {data?.lastComputedDate && (
          <span style={{ fontSize: "10px", color: "var(--fg-subtle)", marginLeft: "8px" }}>
            last updated {formatDate(data.lastComputedDate)}
          </span>
        )}
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Claude Code usage patterns and activity trends
        </p>
      </div>

      {/* Global date range control */}
      <GlobalDateControl
        range={globalRange}
        onChange={(r) => { setGlobalRange(r); setChartOverrides({}); }}
        hasOverrides={hasOverrides}
        onResetOverrides={() => setChartOverrides({})}
      />

      {/* Stats bar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <StatCard label="Total Sessions" value={formatNumber(data?.totalSessions ?? 0)} />
        <StatCard label="Total Messages" value={formatNumber(data?.totalMessages ?? 0)} />
        <StatCard label="Tool Calls" value={formatNumber(totalToolCalls)} />
        <StatCard label="Output Tokens" value={
          totalOutputTokens >= 1_000_000
            ? `${(totalOutputTokens / 1_000_000).toFixed(1)}M`
            : formatNumber(totalOutputTokens)
        } />
        <StatCard
          label="Cache Hit Rate"
          value={cacheHitRate !== null ? `${cacheHitRate}%` : "\u2014"}
          sub="cache read / total input"
        />
        <StatCard
          label="Time Saved"
          value="\u2014"
        />
      </div>

      {/* Messages chart — full width */}
      <div style={{ marginBottom: "12px" }}>
        <ChartCard title="Messages per Day" chartId="messages"
          override={chartOverrides["messages"]} globalRange={globalRange}
          onOverride={(r) => setChartOverride("messages", r)}
          onClearOverride={() => clearOverride("messages")}
        >
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={activityChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
              <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="messages" stroke={accentColor} strokeWidth={1.5}
                fill="url(#msgGrad)" dot={false} isAnimationActive={!reducedMotion} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Sessions + Tool Calls — side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <ChartCard title="Sessions per Day" chartId="sessions"
          override={chartOverrides["sessions"]} globalRange={globalRange}
          onOverride={(r) => setChartOverride("sessions", r)}
          onClearOverride={() => clearOverride("sessions")}
        >
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={sessionsChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
              <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="sessions" stroke={accentColor} strokeWidth={1.5}
                fill="url(#sessGrad)" dot={false} isAnimationActive={!reducedMotion} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tool Calls per Day" chartId="toolCalls"
          override={chartOverrides["toolCalls"]} globalRange={globalRange}
          onOverride={(r) => setChartOverride("toolCalls", r)}
          onClearOverride={() => clearOverride("toolCalls")}
        >
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={toolCallsChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="tcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
              <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="toolCalls" stroke={accentColor} strokeWidth={1.5}
                fill="url(#tcGrad)" dot={false} isAnimationActive={!reducedMotion} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Model breakdown + hourly distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {/* Model breakdown — horizontal bar chart */}
        <ChartCard
          title="Output Tokens by Model"
          chartId="model-tokens"
          override={chartOverrides["model-tokens"]}
          onOverride={(r) => setChartOverride("model-tokens", r)}
          onClearOverride={() => clearOverride("model-tokens")}
          globalRange={globalRange}
        >
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
        <ChartCard
          title="Activity by Hour of Day"
          chartId="hourly"
          override={chartOverrides["hourly"]}
          onOverride={(r) => setChartOverride("hourly", r)}
          onClearOverride={() => clearOverride("hourly")}
          globalRange={globalRange}
        >
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
