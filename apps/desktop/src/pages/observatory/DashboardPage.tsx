import type { DailyActivity, DailyModelTokens, ModelUsageEntry } from "@harness-kit/shared";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AccountStatusBadge from "../../components/AccountStatusBadge";
import BudgetAlertBanner from "../../components/observatory/BudgetAlertBanner";
import CostBreakdownSection from "../../components/observatory/CostBreakdownSection";
import HKTooltip from "../../components/Tooltip";
import { useObservatoryData } from "../../hooks/useObservatoryData";
import { formatDate, formatHour, formatNumber, shortModelName } from "../../lib/format";
import { type BudgetGuardConfig, getBudgetGuard } from "../../lib/preferences";
import { estimateTotalCost, formatCost } from "../../lib/pricing";
import type { ClaudeAccountInfo } from "../../lib/tauri";
import { detectClaudeAccount } from "../../lib/tauri";

const MODEL_COLORS = ["#5b50e8", "#0d9488", "#ea580c", "#16a34a", "#2563eb", "#e11d48"];

// ── Date range types ─────────────────────────────────────────

type Preset = "1h" | "6h" | "12h" | "1d" | "7d" | "30d" | "1y" | "all";

interface DateRange {
  preset: Preset | "custom";
  start: string; // "YYYY-MM-DD" or ISO datetime
  end: string;
}

function presetToDates(preset: Preset): { start: string; end: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const hoursAgo = (n: number) => {
    const d = new Date(now);
    d.setHours(d.getHours() - n);
    return d.toISOString();
  };
  // Sub-day presets resolve to "today" since chart data is daily-bucketed.
  // The ISO datetime is preserved for future intra-day chart support.
  if (preset === "1h") return { start: hoursAgo(1), end: now.toISOString() };
  if (preset === "6h") return { start: hoursAgo(6), end: now.toISOString() };
  if (preset === "12h") return { start: hoursAgo(12), end: now.toISOString() };
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
  // ISO string comparison works for both "YYYY-MM-DD" and full ISO datetime
  const startCmp = range.start.slice(0, 10);
  const endCmp = range.end.slice(0, 10);
  return items.filter((d) => {
    if (startCmp && d.date < startCmp) return false;
    if (endCmp && d.date > endCmp) return false;
    return true;
  });
}

// ── Data merge helpers ───────────────────────────────────────

function mergeDailyActivity(
  cacheData: DailyActivity[],
  liveData: DailyActivity[],
  cutoffDate: string | undefined,
): DailyActivity[] {
  if (!cutoffDate) return liveData.length > 0 ? liveData : cacheData;

  // Cache for dates <= cutoff, live for dates after
  const merged = new Map<string, DailyActivity>();
  for (const d of cacheData) {
    if (d.date <= cutoffDate) merged.set(d.date, d);
  }
  for (const d of liveData) {
    if (d.date > cutoffDate) merged.set(d.date, d);
  }
  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeDailyTokens(
  cacheData: DailyModelTokens[],
  liveData: DailyModelTokens[],
  cutoffDate: string | undefined,
): DailyModelTokens[] {
  if (!cutoffDate) return liveData.length > 0 ? liveData : cacheData;

  const merged = new Map<string, DailyModelTokens>();
  for (const d of cacheData) {
    if (d.date <= cutoffDate) merged.set(d.date, d);
  }
  for (const d of liveData) {
    if (d.date > cutoffDate) merged.set(d.date, d);
  }
  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeModelUsage(
  cacheUsage: Record<string, ModelUsageEntry> | undefined,
  liveUsage: Record<string, ModelUsageEntry> | undefined,
): Record<string, ModelUsageEntry> {
  const result: Record<string, ModelUsageEntry> = {};
  for (const [model, entry] of Object.entries(cacheUsage ?? {})) {
    result[model] = { ...entry };
  }
  for (const [model, entry] of Object.entries(liveUsage ?? {})) {
    const existing = result[model];
    if (existing) {
      result[model] = {
        inputTokens: (existing.inputTokens ?? 0) + (entry.inputTokens ?? 0),
        outputTokens: (existing.outputTokens ?? 0) + (entry.outputTokens ?? 0),
        cacheReadInputTokens:
          (existing.cacheReadInputTokens ?? 0) + (entry.cacheReadInputTokens ?? 0),
        cacheCreationInputTokens:
          (existing.cacheCreationInputTokens ?? 0) + (entry.cacheCreationInputTokens ?? 0),
      };
    } else {
      result[model] = { ...entry };
    }
  }
  return result;
}

function mergeHourCounts(
  cacheHours: Record<string, number> | undefined,
  liveHours: Record<string, number> | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [h, c] of Object.entries(cacheHours ?? {})) {
    result[h] = (result[h] ?? 0) + c;
  }
  for (const [h, c] of Object.entries(liveHours ?? {})) {
    result[h] = (result[h] ?? 0) + c;
  }
  return result;
}

// ── Hooks ────────────────────────────────────────────────────

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function getAccentColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5b50e8"
  );
}

// ── Stat card ────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  tooltip,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
  accent?: string;
}) {
  const tint = accent ?? "var(--accent)";
  const labelEl = (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 500,
        fontVariantCaps: "all-small-caps",
        letterSpacing: "0.03em",
        color: "var(--fg-subtle)",
        ...(tooltip ? { borderBottom: "1px dotted var(--fg-subtle)", cursor: "help" } : {}),
      }}
    >
      {label}
    </span>
  );

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        padding: "12px 16px",
        borderTop: `2px solid ${tint}`,
      }}
    >
      <div
        style={{
          fontSize: "22px",
          fontWeight: 700,
          letterSpacing: "-0.5px",
          color: "var(--fg-base)",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: "5px" }}>
        {tooltip ? (
          <HKTooltip content={tooltip} position="bottom">
            {labelEl}
          </HKTooltip>
        ) : (
          labelEl
        )}
      </div>
      {sub && (
        <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "2px" }}>{sub}</div>
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
  range,
  onChange,
  hasOverrides,
  onResetOverrides,
  idPrefix,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  hasOverrides: boolean;
  onResetOverrides: () => void;
  idPrefix?: string;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const startId = idPrefix ? `${idPrefix}-start` : "range-start";
  const endId = idPrefix ? `${idPrefix}-end` : "range-end";
  const presets: Preset[] = ["1h", "6h", "12h", "1d", "7d", "30d", "1y", "all"];

  function selectPreset(p: Preset) {
    const dates = presetToDates(p);
    onChange({ preset: p, ...dates });
    setShowCustom(false);
  }

  function handleCustomDate(field: "start" | "end", value: string) {
    onChange({ ...range, preset: "custom", [field]: value });
  }

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        {presets.map((p) => (
          <Pill
            key={p}
            label={p === "all" ? "All" : p}
            active={range.preset === p}
            onClick={() => selectPreset(p)}
          />
        ))}
        <button
          onClick={() => setShowCustom((s) => !s)}
          style={{
            fontSize: "11px",
            fontWeight: range.preset === "custom" ? 600 : 400,
            padding: "3px 10px",
            borderRadius: "12px",
            border: "1px solid",
            borderColor: range.preset === "custom" ? "var(--accent)" : "var(--border-base)",
            background: range.preset === "custom" ? "var(--accent-light)" : "transparent",
            color: range.preset === "custom" ? "var(--accent-text)" : "var(--fg-muted)",
            cursor: "pointer",
          }}
        >
          Custom
        </button>
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
      {(showCustom || range.preset === "custom") && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginTop: "8px",
            paddingLeft: "2px",
          }}
        >
          <label htmlFor={startId} style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>
            From
          </label>
          <input
            id={startId}
            type="date"
            value={range.start.slice(0, 10)}
            onChange={(e) => handleCustomDate("start", e.target.value)}
            style={{
              fontSize: "11px",
              padding: "3px 8px",
              borderRadius: "6px",
              border: "1px solid var(--border-base)",
              background: "var(--bg-surface)",
              color: "var(--fg-base)",
            }}
          />
          <label htmlFor={endId} style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>
            to
          </label>
          <input
            id={endId}
            type="date"
            value={range.end.slice(0, 10)}
            onChange={(e) => handleCustomDate("end", e.target.value)}
            style={{
              fontSize: "11px",
              padding: "3px 8px",
              borderRadius: "6px",
              border: "1px solid var(--border-base)",
              background: "var(--bg-surface)",
              color: "var(--fg-base)",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Chart card wrapper ────────────────────────────────────────

function ChartCard({
  title,
  children,
  chartId,
  override,
  onOverride,
  onClearOverride,
  globalRange,
  sourceNote,
}: {
  title: string;
  children: React.ReactNode;
  chartId?: string;
  override?: DateRange | null;
  onOverride?: (r: DateRange) => void;
  onClearOverride?: () => void;
  globalRange?: DateRange;
  sourceNote?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <p
          style={{
            fontSize: "12px",
            fontWeight: 500,
            fontVariantCaps: "all-small-caps",
            letterSpacing: "0.03em",
            color: "var(--fg-muted)",
            margin: 0,
          }}
        >
          {title}
          {sourceNote && (
            <span
              style={{
                fontSize: "9px",
                fontVariantCaps: "normal",
                color: "var(--fg-subtle)",
                marginLeft: "6px",
                fontWeight: 400,
              }}
            >
              {sourceNote}
            </span>
          )}
        </p>
        {chartId && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {override && (
              <button
                onClick={onClearOverride}
                style={{
                  fontSize: "9px",
                  color: "var(--accent-text)",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  padding: "1px 4px",
                }}
              >
                ×reset
              </button>
            )}
            <HKTooltip content="Override date range for this chart">
              <button
                onClick={() => setShowPicker((s) => !s)}
                style={{
                  fontSize: "9px",
                  color: override ? "var(--accent-text)" : "var(--fg-subtle)",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  padding: "1px 4px",
                }}
              >
                {override
                  ? `${override.preset !== "custom" ? override.preset : `${override.start}–${override.end}`}`
                  : "range"}
              </button>
            </HKTooltip>
          </div>
        )}
      </div>
      {showPicker && chartId && globalRange && onOverride && (
        <div style={{ marginBottom: "8px" }}>
          <GlobalDateControl
            range={override ?? globalRange}
            onChange={(r) => {
              onOverride(r);
              setShowPicker(false);
            }}
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
  const { cache, liveActivity, liveStats, loading, isRefreshing, error, lastRefreshed, refresh } =
    useObservatoryData();
  const [globalRange, setGlobalRange] = useState<DateRange>(defaultRange);
  const [chartOverrides, setChartOverrides] = useState<Record<string, DateRange | null>>({});
  const [accentColor, setAccentColor] = useState(getAccentColor);
  const reducedMotion = useReducedMotion();
  const [account, setAccount] = useState<ClaudeAccountInfo | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  const cutoffDate = cache?.lastComputedDate;

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

  // Re-read accent on mount to pick up dynamic theme
  useEffect(() => {
    setAccentColor(getAccentColor());
  }, []);

  // Detect Claude account on mount
  useEffect(() => {
    detectClaudeAccount()
      .then(setAccount)
      .catch(() =>
        setAccount({ logged_in: false, subscription_type: null, auto_mode_available: false }),
      )
      .finally(() => setAccountLoading(false));
  }, []);

  // Merge cache + live stats data
  const mergedActivity = useMemo(
    () =>
      mergeDailyActivity(cache?.dailyActivity ?? [], liveStats?.dailyActivity ?? [], cutoffDate),
    [cache, liveStats, cutoffDate],
  );

  const mergedDailyTokens = useMemo(
    () =>
      mergeDailyTokens(
        cache?.dailyModelTokens ?? [],
        liveStats?.dailyModelTokens ?? [],
        cutoffDate,
      ),
    [cache, liveStats, cutoffDate],
  );

  const mergedModelUsage = useMemo(
    () => mergeModelUsage(cache?.modelUsage, liveStats?.modelUsage),
    [cache, liveStats],
  );

  const mergedHourCounts = useMemo(
    () => mergeHourCounts(cache?.hourCounts, liveStats?.hourCounts),
    [cache, liveStats],
  );

  // Messages chart uses liveActivity (from history.jsonl) for message/session counts
  const filteredMessagesActivity = useMemo(
    () => filterByRange(liveActivity, rangeForChart("messages")),
    [liveActivity, globalRange, chartOverrides],
  );

  const activityChartData = useMemo(
    () =>
      filteredMessagesActivity.map((d) => ({
        date: formatDate(d.date),
        messages: d.messageCount,
      })),
    [filteredMessagesActivity],
  );

  const sessionsChartData = useMemo(() => {
    const filtered = filterByRange(liveActivity, rangeForChart("sessions"));
    return filtered.map((d) => ({
      date: formatDate(d.date),
      sessions: d.sessionCount,
    }));
  }, [liveActivity, globalRange, chartOverrides]);

  // Tool calls now uses merged data (cache + live JSONL scan)
  const toolCallsChartData = useMemo(() => {
    const filtered = filterByRange(mergedActivity, rangeForChart("toolCalls"));
    return filtered.map((d) => ({
      date: formatDate(d.date),
      toolCalls: d.toolCallCount ?? 0,
    }));
  }, [mergedActivity, globalRange, chartOverrides]);

  const totalToolCalls = useMemo(() => {
    return mergedActivity.reduce((sum, d) => sum + (d.toolCallCount ?? 0), 0);
  }, [mergedActivity]);

  const { totalOutputTokens, cacheHitRate } = useMemo(() => {
    let outTokens = 0,
      cacheRead = 0,
      input = 0,
      cacheCreate = 0;
    for (const m of Object.values(mergedModelUsage)) {
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
  }, [mergedModelUsage]);

  const totalEstimatedCost = useMemo(() => estimateTotalCost(mergedModelUsage), [mergedModelUsage]);

  const [budgetGuard, setBudgetGuardLocal] = useState<BudgetGuardConfig>(() => getBudgetGuard());

  useEffect(() => {
    function onPrefsChanged() {
      setBudgetGuardLocal(getBudgetGuard());
    }
    window.addEventListener("harness-kit-prefs-changed", onPrefsChanged);
    return () => window.removeEventListener("harness-kit-prefs-changed", onPrefsChanged);
  }, []);

  const todayModelUsage = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = liveStats?.dailyModelTokens?.find((d) => d.date === today);
    // NOTE: tokensByModel values are TOTAL tokens (input + output + cache_read +
    // cache_creation) as accumulated by observatory.rs. There is no per-day
    // input/output split in this data structure. We expose the total as
    // `inputTokens` so that token-limit checks and the daily cost estimate have
    // a value to work with. The cost estimate will be an approximation priced
    // at input rates only; use the all-time `mergedModelUsage` for accurate
    // split-rate cost figures.
    return todayEntry?.tokensByModel
      ? Object.fromEntries(
          Object.entries(todayEntry.tokensByModel).map(([model, tokens]) => [
            model,
            { inputTokens: tokens, outputTokens: 0 },
          ]),
        )
      : {};
  }, [liveStats]);

  const costToday = useMemo(() => estimateTotalCost(todayModelUsage), [todayModelUsage]);
  const tokensToday = useMemo(
    () => Object.values(todayModelUsage).reduce((sum, u) => sum + (u.inputTokens ?? 0), 0),
    [todayModelUsage],
  );

  const budgetExceeded = useMemo(() => {
    if (!budgetGuard.enabled) return false;
    const tokenOver =
      budgetGuard.dailyTokenLimit != null && tokensToday > budgetGuard.dailyTokenLimit;
    const costOver =
      budgetGuard.dailyEstimatedCostUSD != null && costToday > budgetGuard.dailyEstimatedCostUSD;
    return tokenOver || costOver;
  }, [budgetGuard, tokensToday, costToday]);

  const { dailyTokensChartData, allModelNames } = useMemo(() => {
    if (!mergedDailyTokens.length) return { dailyTokensChartData: [], allModelNames: [] };

    const modelSet = new Set<string>();
    mergedDailyTokens.forEach((d) => {
      Object.keys(d.tokensByModel ?? {}).forEach((m) => modelSet.add(m));
    });
    const models = Array.from(modelSet);

    const filtered = filterByRange(mergedDailyTokens, rangeForChart("dailyTokens"));
    const chartData = filtered.map((d) => {
      const row: Record<string, unknown> = { date: formatDate(d.date) };
      models.forEach((m) => {
        row[shortModelName(m)] = d.tokensByModel?.[m] ?? 0;
      });
      return row;
    });

    return {
      dailyTokensChartData: chartData,
      allModelNames: models.map(shortModelName),
    };
  }, [mergedDailyTokens, globalRange, chartOverrides]);

  const tokenTypeData = useMemo(() => {
    return Object.entries(mergedModelUsage)
      .map(([model, usage]) => ({
        name: shortModelName(model),
        Input: usage.inputTokens ?? 0,
        Output: usage.outputTokens ?? 0,
        "Cache Read": usage.cacheReadInputTokens ?? 0,
        "Cache Create": usage.cacheCreationInputTokens ?? 0,
      }))
      .sort((a, b) => b.Output - a.Output);
  }, [mergedModelUsage]);

  const TOKEN_TYPE_COLORS: Record<string, string> = {
    Input: "var(--fg-subtle)",
    Output: accentColor,
    "Cache Read": "#0d9488",
    "Cache Create": "#636366",
  };

  const hourlyChartData = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      hour: formatHour(i),
      count: mergedHourCounts[String(i)] ?? 0,
    }));
  }, [mergedHourCounts]);

  // Sum all tokens for the current calendar month across merged model usage
  const monthlyTokens = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    let total = 0;
    for (const d of mergedDailyTokens) {
      if (d.date.startsWith(thisMonth)) {
        for (const t of Object.values(d.tokensByModel ?? {})) {
          total += t;
        }
      }
    }
    return total;
  }, [mergedDailyTokens]);

  // Effective "last updated" — combines cache date + live scan
  const effectiveLastUpdated = useMemo(() => {
    if (lastRefreshed) return lastRefreshed;
    return null;
  }, [lastRefreshed]);

  const scanNote = liveStats
    ? `${liveStats.scannedFiles} files in ${liveStats.scanDurationMs}ms`
    : undefined;

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
          <h1
            style={{
              fontSize: "17px",
              fontWeight: 600,
              letterSpacing: "-0.3px",
              color: "var(--fg-base)",
              margin: 0,
            }}
          >
            Observatory
          </h1>
        </div>
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            borderRadius: "8px",
            padding: "10px 14px",
            fontSize: "13px",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <h1
          style={{
            fontSize: "17px",
            fontWeight: 600,
            letterSpacing: "-0.3px",
            color: "var(--fg-base)",
            margin: 0,
          }}
        >
          Observatory
        </h1>
        {effectiveLastUpdated && (
          <span style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "1px" }}>
            last updated{" "}
            {effectiveLastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {isRefreshing && (
            <span style={{ fontSize: "10px", color: "var(--accent-text)", fontWeight: 500 }}>
              Refreshing…
            </span>
          )}
          <button
            onClick={refresh}
            disabled={isRefreshing}
            title={scanNote ? `Last scan: ${scanNote}` : undefined}
            style={{
              fontSize: "11px",
              fontWeight: 500,
              padding: "4px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border-base)",
              background: "var(--bg-surface)",
              color: "var(--fg-muted)",
              cursor: isRefreshing ? "default" : "pointer",
              opacity: isRefreshing ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
              gap: "5px",
              transition: "background 0.15s",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color: "currentColor" }}
            >
              <path
                d="M21 12a9 9 0 1 1-2.63-6.36"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M21 3v6h-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Global date range control */}
      <GlobalDateControl
        range={globalRange}
        onChange={(r) => {
          setGlobalRange(r);
          setChartOverrides({});
        }}
        hasOverrides={hasOverrides}
        onResetOverrides={() => setChartOverrides({})}
      />

      {/* Budget alert — shown above stats when daily limit is exceeded */}
      {budgetExceeded && (
        <BudgetAlertBanner
          tokensToday={tokensToday}
          tokenLimit={budgetGuard.dailyTokenLimit}
          costToday={costToday}
          costLimit={budgetGuard.dailyEstimatedCostUSD}
        />
      )}

      {/* Stats bar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap" }}>
        <StatCard
          label="Sessions"
          value={formatNumber(cache?.totalSessions ?? 0)}
          tooltip="Unique Claude Code sessions"
          accent="#5b50e8"
        />
        <StatCard
          label="Messages"
          value={formatNumber(cache?.totalMessages ?? 0)}
          tooltip="Total user messages across all sessions"
          accent="#2563eb"
        />
        <StatCard
          label="Tool Calls"
          value={formatNumber(totalToolCalls)}
          tooltip="Total tool invocations (Read, Edit, Bash, etc.)"
          accent="#0d9488"
        />
        <StatCard
          label="Output Tokens"
          value={
            totalOutputTokens >= 1_000_000
              ? `${(totalOutputTokens / 1_000_000).toFixed(1)}M`
              : formatNumber(totalOutputTokens)
          }
          tooltip="Total tokens generated by Claude across all models"
          accent="#ea580c"
        />
        <StatCard
          label="Cache Hit"
          value={cacheHitRate !== null ? `${cacheHitRate}%` : "\u2014"}
          sub="read / total input"
          tooltip="Cache read tokens as a percentage of total input tokens"
          accent="#16a34a"
        />
        <StatCard
          label="Est. Cost"
          value={formatCost(totalEstimatedCost)}
          sub="all time"
          tooltip="Estimated cost based on Anthropic public pricing. Actual billing may differ."
          accent="#9333ea"
        />
      </div>

      {/* Account status */}
      <div style={{ marginBottom: "18px" }}>
        <AccountStatusBadge
          account={account}
          monthlyTokens={monthlyTokens}
          loading={accountLoading}
        />
      </div>

      {/* Messages chart — full width, hero chart */}
      <div style={{ marginBottom: "12px" }}>
        <ChartCard
          title="Messages per Day"
          chartId="messages"
          override={chartOverrides["messages"]}
          globalRange={globalRange}
          onOverride={(r) => setChartOverride("messages", r)}
          onClearOverride={() => clearOverride("messages")}
        >
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={activityChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="messages"
                stroke={accentColor}
                strokeWidth={1.5}
                fill="url(#msgGrad)"
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Sessions + Tool Calls — side by side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <ChartCard
          title="Sessions per Day"
          chartId="sessions"
          override={chartOverrides["sessions"]}
          globalRange={globalRange}
          onOverride={(r) => setChartOverride("sessions", r)}
          onClearOverride={() => clearOverride("sessions")}
        >
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={sessionsChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.1} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="sessions"
                stroke={accentColor}
                strokeWidth={1.5}
                fill="url(#sessGrad)"
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Tool Calls per Day"
          chartId="toolCalls"
          override={chartOverrides["toolCalls"]}
          globalRange={globalRange}
          onOverride={(r) => setChartOverride("toolCalls", r)}
          onClearOverride={() => clearOverride("toolCalls")}
        >
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart
              data={toolCallsChartData}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="tcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.1} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="toolCalls"
                stroke={accentColor}
                strokeWidth={1.5}
                fill="url(#tcGrad)"
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Daily tokens by model — stacked area */}
      {dailyTokensChartData.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <ChartCard
            title="Daily Tokens by Model"
            chartId="dailyTokens"
            override={chartOverrides["dailyTokens"]}
            globalRange={globalRange}
            onOverride={(r) => setChartOverride("dailyTokens", r)}
            onClearOverride={() => clearOverride("dailyTokens")}
          >
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart
                data={dailyTokensChartData}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000
                      ? `${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : String(v)
                  }
                />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={((v: number) => formatNumber(v)) as any}
                />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                {allModelNames.map((name, i) => (
                  <Area
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stackId="a"
                    stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                    fill={MODEL_COLORS[i % MODEL_COLORS.length]}
                    fillOpacity={0.5}
                    strokeWidth={1}
                    isAnimationActive={!reducedMotion}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Token type breakdown — stacked horizontal bars (no range filter — totals only) */}
      {tokenTypeData.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <ChartCard title="Token Type Breakdown by Model">
            <ResponsiveContainer width="100%" height={Math.max(120, tokenTypeData.length * 36)}>
              <BarChart
                data={tokenTypeData}
                layout="vertical"
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000
                      ? `${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : String(v)
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={((v: number) => formatNumber(v)) as any}
                />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                {(["Input", "Output", "Cache Read", "Cache Create"] as const).map((type) => (
                  <Bar
                    key={type}
                    dataKey={type}
                    stackId="a"
                    fill={TOKEN_TYPE_COLORS[type]}
                    isAnimationActive={!reducedMotion}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Hourly distribution */}
      <div style={{ marginBottom: "12px" }}>
        <ChartCard title="Activity by Hour of Day">
          {hourlyChartData.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={hourlyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="count"
                  fill={accentColor}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={!reducedMotion}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p
              style={{
                fontSize: "12px",
                color: "var(--fg-subtle)",
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              No hourly data.
            </p>
          )}
        </ChartCard>
      </div>

      {/* Cost breakdown table */}
      <CostBreakdownSection modelUsage={mergedModelUsage} />
    </div>
  );
}
