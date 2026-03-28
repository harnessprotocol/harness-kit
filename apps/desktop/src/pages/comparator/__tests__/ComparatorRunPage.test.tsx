import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ComparatorRunPage from "../ComparatorRunPage";

// ── xterm mocks ──────────────────────────────────────────────
// jsdom cannot render a real terminal canvas, so we stub xterm.js.

const mockWrite = vi.fn();
const mockDispose = vi.fn();

vi.mock("@xterm/xterm", () => {
  const Terminal = vi.fn(function (this: Record<string, unknown>) {
    this.loadAddon = vi.fn();
    this.open = vi.fn();
    this.write = mockWrite;
    this.dispose = mockDispose;
    this.onData = vi.fn();
    this.onResize = vi.fn();
  });
  return { Terminal };
});
vi.mock("@xterm/addon-fit", () => {
  const FitAddon = vi.fn(function (this: Record<string, unknown>) {
    this.fit = vi.fn();
    this.dispose = vi.fn();
  });
  return { FitAddon };
});
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
globalThis.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_cb: ResizeObserverCallback) {}
} as unknown as typeof globalThis.ResizeObserver;

// ── Tauri event mock ─────────────────────────────────────────
// The useComparison hook calls listen() from @tauri-apps/api/event.
// We capture the listeners so tests can fire synthetic events.

type Listener = (event: { payload: unknown }) => void;
const listeners: Record<string, Listener[]> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
    return () => {
      listeners[event] = listeners[event].filter((l) => l !== cb);
    };
  }),
}));

function fire(event: string, payload: unknown) {
  listeners[event]?.forEach((l) => l({ payload }));
}

// ── Recharts mock (EvaluationPanel → ScoreRadar uses recharts) ──
vi.mock("recharts", () => ({
  RadarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="radar-chart">{children}</div>,
  Radar: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ── Tauri command mocks ──────────────────────────────────────
// Names start with "mock" so Vitest hoisting works inside the factory.

let mockStartComparison: ReturnType<typeof vi.fn>;
let mockSaveComparison: ReturnType<typeof vi.fn>;
let mockSavePanelResult: ReturnType<typeof vi.fn>;
let mockGetComparison: ReturnType<typeof vi.fn>;
let mockGetComparisonDiffs: ReturnType<typeof vi.fn>;
let mockKillPanel: ReturnType<typeof vi.fn>;
let mockSaveEvaluation: ReturnType<typeof vi.fn>;
let mockGetEvaluations: ReturnType<typeof vi.fn>;
let mockExportComparisonJson: ReturnType<typeof vi.fn>;

vi.mock("../../../lib/tauri", () => ({
  get startComparison() { return mockStartComparison; },
  get saveComparison() { return mockSaveComparison; },
  get savePanelResult() { return mockSavePanelResult; },
  get getComparison() { return mockGetComparison; },
  get getComparisonDiffs() { return mockGetComparisonDiffs; },
  get killPanel() { return mockKillPanel; },
  get saveEvaluation() { return mockSaveEvaluation; },
  get getEvaluations() { return mockGetEvaluations; },
  get exportComparisonJson() { return mockExportComparisonJson; },
  createWorktrees: vi.fn().mockResolvedValue([]),
  removeWorktrees: vi.fn().mockResolvedValue(undefined),
  getDiffAgainstCommit: vi.fn().mockResolvedValue([]),
  saveFileDiffs: vi.fn().mockResolvedValue(undefined),
}));

// ── Render helpers ───────────────────────────────────────────

const COMP_ID = "cmp-test-1";

/**
 * Render in live mode — the page receives location.state with prompt/selected,
 * calls startComparison, and subscribes to Tauri events.
 */
function renderLive(panelCount = 1) {
  const selected = Array.from({ length: panelCount }, (_, i) => ({
    harnessId: i === 0 ? "claude" : i === 1 ? "cursor" : "gh-copilot",
    model: i === 0 ? "claude-sonnet-4-6" : "gpt-4o",
  }));

  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: `/comparator/run/${COMP_ID}`,
          state: {
            prompt: "hello world",
            workingDir: "/tmp",
            selected,
            pinnedCommit: null,
          },
        },
      ]}
    >
      <Routes>
        <Route path="/comparator/run/:comparisonId" element={<ComparatorRunPage />} />
        <Route path="/comparator" element={<div>Setup</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Render in review mode — the page loads saved data from getComparison
 * instead of listening for live events.
 */
function renderReview() {
  mockGetComparison.mockResolvedValue({
    id: COMP_ID,
    prompt: "hello world",
    workingDir: "/tmp",
    pinnedCommit: null,
    createdAt: "2026-03-28T12:00:00Z",
    status: "complete",
    panels: [
      {
        id: "panel-0",
        harnessId: "claude",
        harnessName: "Claude Code",
        model: "claude-sonnet-4-6",
        outputText: "Hello from Claude\n",
        status: "complete",
        exitCode: 0,
        durationMs: 3000,
        diffs: [],
        evaluation: null,
      },
    ],
  });

  return render(
    <MemoryRouter initialEntries={[`/comparator/review/${COMP_ID}`]}>
      <Routes>
        <Route path="/comparator/review/:comparisonId" element={<ComparatorRunPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Setup ────────────────────────────────────────────────────

beforeEach(() => {
  // Clear all listeners between tests
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  vi.clearAllMocks();

  mockStartComparison = vi.fn().mockResolvedValue(undefined);
  mockSaveComparison = vi.fn().mockResolvedValue(undefined);
  mockSavePanelResult = vi.fn().mockResolvedValue(undefined);
  mockGetComparison = vi.fn().mockResolvedValue(null);
  mockGetComparisonDiffs = vi.fn().mockResolvedValue([]);
  mockKillPanel = vi.fn().mockResolvedValue(undefined);
  mockSaveEvaluation = vi.fn().mockResolvedValue(undefined);
  mockGetEvaluations = vi.fn().mockResolvedValue([]);
  mockExportComparisonJson = vi.fn().mockResolvedValue("{}");
});

// ── Tests: Live Mode ─────────────────────────────────────────

describe("ComparatorRunPage — live mode", () => {
  it("renders the prompt text in the banner", async () => {
    renderLive(1);
    await waitFor(() => expect(screen.getByText("hello world")).toBeInTheDocument());
  });

  it("renders a terminal pane per selected harness", async () => {
    renderLive(2);
    // Each panel header shows the harness name
    await waitFor(() => {
      expect(screen.getAllByText("Claude Code").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Cursor").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows Stop All button while panels are running", async () => {
    renderLive(1);
    // After start(), the hook transitions panels to "running",
    // which makes hasRunning=true and shows Stop All.
    await waitFor(() => expect(screen.getByText("Stop All")).toBeInTheDocument());
  });

  it("calls startComparison on mount", async () => {
    renderLive(1);
    await waitFor(() => expect(mockStartComparison).toHaveBeenCalled());
  });

  it("calls saveComparison on mount to persist metadata", async () => {
    renderLive(1);
    await waitFor(() => expect(mockSaveComparison).toHaveBeenCalledWith(
      COMP_ID,
      "hello world",
      "/tmp",
      null,
      expect.any(Array),
    ));
  });

  it("writes output to terminal when output event fires", async () => {
    renderLive(1);
    // Wait for the event listener to be registered by the useComparison hook
    await waitFor(() => expect(listeners["comparator://output"]).toBeDefined());

    act(() => {
      fire("comparator://output", {
        comparisonId: COMP_ID,
        panelId: "panel-0",
        stream: "stdout",
        data: "Hello Claude\r\n",
      });
    });

    // The TerminalView component writes new outputLines to the xterm Terminal
    await waitFor(() => expect(mockWrite).toHaveBeenCalledWith("Hello Claude\r\n"));
  });

  it("transitions to complete phase when all panels complete", async () => {
    renderLive(1);
    await waitFor(() => expect(listeners["comparator://complete"]).toBeDefined());

    act(() => {
      fire("comparator://complete", {
        comparisonId: COMP_ID,
        panelId: "panel-0",
        exitCode: 0,
        durationMs: 2500,
      });
    });

    // Once complete, the tab bar appears with Output, Diffs, Evaluate tabs
    await waitFor(() => expect(screen.getByText("Output")).toBeInTheDocument());
    expect(screen.getByText("Diffs")).toBeInTheDocument();
    expect(screen.getByText("Evaluate")).toBeInTheDocument();
  });

  it("hides Stop All after all panels complete", async () => {
    renderLive(1);
    await waitFor(() => expect(listeners["comparator://complete"]).toBeDefined());

    act(() => {
      fire("comparator://complete", {
        comparisonId: COMP_ID,
        panelId: "panel-0",
        exitCode: 0,
        durationMs: 1000,
      });
    });

    await waitFor(() => expect(screen.queryByText("Stop All")).not.toBeInTheDocument());
  });

  it("shows Re-run button after completion", async () => {
    renderLive(1);
    await waitFor(() => expect(listeners["comparator://complete"]).toBeDefined());

    act(() => {
      fire("comparator://complete", {
        comparisonId: COMP_ID,
        panelId: "panel-0",
        exitCode: 0,
        durationMs: 1000,
      });
    });

    await waitFor(() => expect(screen.getByText("Re-run")).toBeInTheDocument());
  });

  it("persists panel result when a panel completes", async () => {
    renderLive(1);
    await waitFor(() => expect(listeners["comparator://complete"]).toBeDefined());

    act(() => {
      fire("comparator://complete", {
        comparisonId: COMP_ID,
        panelId: "panel-0",
        exitCode: 0,
        durationMs: 5000,
      });
    });

    await waitFor(() =>
      expect(mockSavePanelResult).toHaveBeenCalledWith(
        COMP_ID,
        "panel-0",
        0,
        5000,
        "complete",
        expect.any(String),
      ),
    );
  });

  it("shows New button to navigate back to setup", async () => {
    renderLive(1);
    await waitFor(() => expect(screen.getByText("New")).toBeInTheDocument());
  });

  it("handles multi-panel completion (both must finish before tabs appear)", async () => {
    renderLive(2);
    await waitFor(() => expect(listeners["comparator://complete"]).toBeDefined());

    // Complete only the first panel
    act(() => {
      fire("comparator://complete", {
        comparisonId: COMP_ID,
        panelId: "panel-0",
        exitCode: 0,
        durationMs: 2000,
      });
    });

    // Tabs visible but Diffs should be disabled while one panel still running
    const diffsTab = screen.getByText("Diffs");
    expect(diffsTab).toBeInTheDocument();
    expect(diffsTab.className).toMatch(/disabled/);

    // Complete the second panel
    act(() => {
      fire("comparator://complete", {
        comparisonId: COMP_ID,
        panelId: "panel-1",
        exitCode: 0,
        durationMs: 3000,
      });
    });

    // Now all panels done → tabs become active
    await waitFor(() => expect(screen.getByText("Output")).toBeInTheDocument());
    expect(screen.getByText("Diffs")).toBeInTheDocument();
  });
});

// ── Tests: Review Mode ───────────────────────────────────────

describe("ComparatorRunPage — review mode", () => {
  it("loads and renders saved panels from the database", async () => {
    renderReview();
    // The panel header should show the harness name
    await waitFor(() =>
      expect(screen.getAllByText("Claude Code").length).toBeGreaterThanOrEqual(1),
    );
  });

  it("shows the prompt from the loaded comparison", async () => {
    renderReview();
    await waitFor(() => expect(screen.getByText("hello world")).toBeInTheDocument());
  });

  it("writes saved outputText to terminal", async () => {
    renderReview();
    // The page converts outputText → outputLines which TerminalView writes
    await waitFor(() => expect(mockWrite).toHaveBeenCalledWith("Hello from Claude\n"));
  });

  it("shows tabs immediately (already complete)", async () => {
    renderReview();
    await waitFor(() => expect(screen.getByText("Output")).toBeInTheDocument());
    expect(screen.getByText("Diffs")).toBeInTheDocument();
    expect(screen.getByText("Evaluate")).toBeInTheDocument();
  });

  it("does not show Stop All in review mode", async () => {
    renderReview();
    // Wait for content to render
    await waitFor(() => expect(screen.getByText("hello world")).toBeInTheDocument());
    expect(screen.queryByText("Stop All")).not.toBeInTheDocument();
  });

  it("calls getComparison with the comparison ID from route params", async () => {
    renderReview();
    await waitFor(() => expect(mockGetComparison).toHaveBeenCalledWith(COMP_ID));
  });

  it("does not call startComparison in review mode", async () => {
    renderReview();
    await waitFor(() => expect(screen.getByText("hello world")).toBeInTheDocument());
    expect(mockStartComparison).not.toHaveBeenCalled();
  });

  it("shows Re-run button in review mode (comparison is complete)", async () => {
    renderReview();
    await waitFor(() => expect(screen.getByText("Re-run")).toBeInTheDocument());
  });

  it("shows loading state before data arrives", () => {
    // Make getComparison never resolve
    mockGetComparison.mockReturnValue(new Promise(() => {}));
    renderReview();
    expect(screen.getByText("Loading comparison...")).toBeInTheDocument();
  });
});
