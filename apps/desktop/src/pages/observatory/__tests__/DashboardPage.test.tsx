import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { StatsCache } from "@harness-kit/shared";
import DashboardPage from "../DashboardPage";

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
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ── Tauri mock ────────────────────────────────────────────────
// Variable name starts with "mock" — required for Vitest hoisting to work inside
// the vi.mock factory (factory runs before module-scope let/const declarations).

let mockReadStatsCache: () => Promise<unknown>;

vi.mock("../../../lib/tauri", () => ({
  get readStatsCache() { return mockReadStatsCache; },
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

// ── Helpers ───────────────────────────────────────────────────

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
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
});

// ── Tests ─────────────────────────────────────────────────────

describe("DashboardPage — loading state", () => {
  it("shows 'Loading…' before data arrives", () => {
    // never-resolving promise keeps the loading state active
    mockReadStatsCache = () => new Promise(() => {});
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

  it("shows 2 models used", async () => {
    renderDashboard();
    // The Models Used stat card renders the count as a plain string
    expect(await screen.findByText("2")).toBeInTheDocument();
  });
});

describe("DashboardPage — error state", () => {
  it("shows the error message when readStatsCache rejects", async () => {
    mockReadStatsCache = () => Promise.reject(new Error("Failed to read stats"));
    renderDashboard();
    expect(await screen.findByText(/Failed to read stats/)).toBeInTheDocument();
  });

  it("does not show loading spinner after error", async () => {
    mockReadStatsCache = () => Promise.reject(new Error("Error"));
    renderDashboard();
    await screen.findByText(/Error/);
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — stale warning", () => {
  it("shows stale warning when lastComputedDate is 5 days old", async () => {
    mockReadStatsCache = () => Promise.resolve(staleStats);
    renderDashboard();
    expect(await screen.findByText(/days ago/)).toBeInTheDocument();
  });

  it("does NOT show stale warning when lastComputedDate is today", async () => {
    mockReadStatsCache = () => Promise.resolve(mockStats);
    renderDashboard();
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/days ago/)).not.toBeInTheDocument();
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
    expect(screen.getByTestId("area-chart")).toBeInTheDocument();
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
