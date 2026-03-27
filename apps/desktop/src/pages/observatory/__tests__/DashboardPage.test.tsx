import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { StatsCache, LiveDailyActivity } from "@harness-kit/shared";
import DashboardPage from "../DashboardPage";
import { ObservatoryProvider } from "../../../hooks/useObservatoryData";

// ── Recharts mock ─────────────────────────────────────────────
// jsdom cannot render SVG/canvas; mock all recharts components as simple divs.
// The factory must not reference any variables declared outside it (Vitest hoisting).

vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ── Tauri mock ────────────────────────────────────────────────
// Variable name starts with "mock" — required for Vitest hoisting to work inside
// the vi.mock factory (factory runs before module-scope let/const declarations).

let mockReadStatsCache: () => Promise<unknown>;
let mockReadLiveActivity: () => Promise<unknown>;
let mockComputeLiveStats: () => Promise<unknown>;

vi.mock("../../../lib/tauri", () => ({
  get readStatsCache() { return mockReadStatsCache; },
  get readLiveActivity() { return mockReadLiveActivity; },
  get computeLiveStats() { return mockComputeLiveStats; },
}));

// ── Fixtures ──────────────────────────────────────────────────

const mockStats: StatsCache = {
  lastComputedDate: "2026-03-15",
  totalSessions: 408,
  totalMessages: 2814,
  dailyActivity: [
    { date: "2026-03-14", messageCount: 45, sessionCount: 3, toolCallCount: 120 },
    { date: "2026-03-15", messageCount: 30, sessionCount: 2, toolCallCount: 80 },
  ],
  modelUsage: {
    "claude-sonnet-4-6": { inputTokens: 1000, outputTokens: 2000, cacheReadInputTokens: 500, cacheCreationInputTokens: 200 },
    "claude-opus-4-6": { inputTokens: 500, outputTokens: 1000, cacheReadInputTokens: 200, cacheCreationInputTokens: 100 },
  },
  hourCounts: { "9": 50, "10": 80, "14": 60 },
};

// 5 days before 2026-03-15 → stale (> 3 days)
const staleStats: StatsCache = {
  ...mockStats,
  lastComputedDate: "2026-03-10",
};

const mockLiveActivity: LiveDailyActivity[] = [
  { date: "2026-03-14", messageCount: 45, sessionCount: 3 },
  { date: "2026-03-15", messageCount: 30, sessionCount: 2 },
];

// ── Helpers ───────────────────────────────────────────────────

function renderDashboard() {
  return render(
    <MemoryRouter>
      <ObservatoryProvider>
        <DashboardPage />
      </ObservatoryProvider>
    </MemoryRouter>,
  );
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  // window.matchMedia is not available in jsdom; provide a stub.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  mockReadStatsCache = vi.fn().mockResolvedValue(mockStats);
  mockReadLiveActivity = vi.fn().mockResolvedValue(mockLiveActivity);
  mockComputeLiveStats = vi.fn().mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────────────────

describe("DashboardPage — loading state", () => {
  it("shows 'Loading…' before data arrives", () => {
    // never-resolving promise keeps the loading state active
    mockReadStatsCache = () => new Promise(() => {});
    mockComputeLiveStats = () => new Promise(() => {});
    renderDashboard();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("hides 'Loading…' after data loads", async () => {
    mockReadStatsCache = () => Promise.resolve(mockStats);
    renderDashboard();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
  });
});

describe("DashboardPage — stats bar", () => {
  beforeEach(() => {
    mockReadStatsCache = () => Promise.resolve(mockStats);
  });

  it("shows 408 total sessions", async () => {
    renderDashboard();
    // 408 has no comma — just assert the raw number is present
    expect(await screen.findByText(/^408$/)).toBeInTheDocument();
  });

  it("shows 2,814 total messages (locale-formatted)", async () => {
    renderDashboard();
    expect(await screen.findByText("2,814")).toBeInTheDocument();
  });

  it("shows output tokens total", async () => {
    renderDashboard();
    // mockStats modelUsage: 2000 + 1000 = 3,000 output tokens
    expect(await screen.findByText("3,000")).toBeInTheDocument();
  });
});

describe("DashboardPage — error state", () => {
  it("shows the error message when all sources reject", async () => {
    mockReadStatsCache = () => Promise.reject(new Error("Failed to read stats"));
    mockReadLiveActivity = () => Promise.reject(new Error("fail"));
    mockComputeLiveStats = () => Promise.reject(new Error("fail"));
    renderDashboard();
    expect(await screen.findByText(/Failed to read stats/)).toBeInTheDocument();
  });

  it("does not show loading spinner after error", async () => {
    mockReadStatsCache = () => Promise.reject(new Error("Error"));
    mockReadLiveActivity = () => Promise.reject(new Error("Error"));
    mockComputeLiveStats = () => Promise.reject(new Error("Error"));
    renderDashboard();
    await screen.findByText(/Error/);
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — stale warning", () => {
  it("shows last-updated label when lastComputedDate is 5 days old", async () => {
    mockReadStatsCache = () => Promise.resolve(staleStats);
    renderDashboard();
    expect(await screen.findByText(/last updated/i)).toBeInTheDocument();
  });

  it("shows last-updated label when lastComputedDate is today", async () => {
    mockReadStatsCache = () => Promise.resolve(mockStats);
    renderDashboard();
    expect(await screen.findByText(/last updated/i)).toBeInTheDocument();
  });
});

describe("DashboardPage — charts", () => {
  beforeEach(() => {
    mockReadStatsCache = () => Promise.resolve(mockStats);
  });

  it("renders the activity area chart after load", async () => {
    renderDashboard();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    const areaCharts = screen.getAllByTestId("area-chart");
    expect(areaCharts.length).toBe(3);
  });

  it("renders bar charts after load", async () => {
    renderDashboard();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    const barCharts = screen.getAllByTestId("bar-chart");
    expect(barCharts.length).toBeGreaterThanOrEqual(1);
  });
});

describe("stats bar — new cards", () => {
  it("shows tool call total", async () => {
    renderDashboard();
    // mockStats dailyActivity has toolCallCount: 120 + 80 = 200
    expect(await screen.findByText("200")).toBeInTheDocument();
  });

  it("shows cache hit rate", async () => {
    renderDashboard();
    // For mockStats with 2 models totaling some cache/input tokens, a % should appear
    expect(await screen.findByText(/cache hit/i)).toBeInTheDocument();
  });
});

describe("date range control", () => {
  it("renders preset pills", async () => {
    renderDashboard();
    await screen.findByText("200"); // wait for load
    expect(screen.getByRole("button", { name: "1d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1y" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("renders custom date toggle", async () => {
    renderDashboard();
    await screen.findByText("200");
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
  });

  it("30d pill is active by default", async () => {
    renderDashboard();
    await screen.findByText("200");
    expect(screen.getByRole("button", { name: "30d" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("stale warning replaced by refresh UI", () => {
  it("shows last-updated label not a warning banner when stale", async () => {
    mockReadStatsCache = vi.fn().mockResolvedValue(staleStats);
    renderDashboard();
    await screen.findByText(/last updated/i);
    // No orange warning banner text
    expect(screen.queryByText(/data may be incomplete/i)).not.toBeInTheDocument();
  });
});
