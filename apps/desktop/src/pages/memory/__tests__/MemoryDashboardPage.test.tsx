import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MemoryDashboardPage from "../MemoryDashboardPage";

// ── Mocks ─────────────────────────────────────────────────────

// Vitest hoisting: variable names must start with "mock" to be accessible
// inside vi.mock factory closures.

let mockGetMembrainEnabled: () => boolean;
let mockSetMembrainEnabled: (v: boolean) => void;

vi.mock("../../../lib/preferences", () => ({
  get getMembrainEnabled() { return mockGetMembrainEnabled; },
  get setMembrainEnabled() { return mockSetMembrainEnabled; },
}));

// useMembrainServerReady — return a controllable state object
let mockServerState: {
  ready: boolean;
  timedOut: boolean;
  installed: boolean | null;
  starting: boolean;
  error: string | null;
  retry: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

vi.mock("../../../hooks/useMembrainServerReady", () => ({
  useMembrainServerReady: () => mockServerState,
}));

// syncMembrainTheme — no-op in tests
vi.mock("../../../lib/membrain-api", () => ({
  MEMBRAIN_SERVER_BASE: "http://localhost:3131",
  MEMBRAIN_API: "http://localhost:3131/api/v1",
  syncMembrainTheme: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/memory"]}>
      <MemoryDashboardPage />
    </MemoryRouter>,
  );
}

function makeServerState(overrides: Partial<typeof mockServerState> = {}) {
  return {
    ready: false,
    timedOut: false,
    installed: null,
    starting: false,
    error: null,
    retry: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  mockGetMembrainEnabled = vi.fn().mockReturnValue(false);
  mockSetMembrainEnabled = vi.fn();
  mockServerState = makeServerState();
});

// ── Tests: Labs gate (disabled state) ────────────────────────

describe("MemoryDashboardPage — Labs gate (membrain disabled)", () => {
  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows the Memory Labs teaser heading", () => {
    renderPage();
    expect(screen.getByText("Memory")).toBeInTheDocument();
  });

  it("shows the Labs badge", () => {
    renderPage();
    expect(screen.getByText("Labs")).toBeInTheDocument();
  });

  it("shows the Enable Memory button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Enable Memory" })).toBeInTheDocument();
  });

  it("shows the feature description", () => {
    renderPage();
    expect(screen.getByText(/graph-based knowledge store/i)).toBeInTheDocument();
  });

  it("shows the alpha notice", () => {
    renderPage();
    expect(screen.getByText(/Alpha — personal use only/i)).toBeInTheDocument();
  });

  it("shows feature tiles: Graph, Trace, Context, Episodes", () => {
    renderPage();
    expect(screen.getByText("Graph")).toBeInTheDocument();
    expect(screen.getByText("Trace")).toBeInTheDocument();
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.getByText("Episodes")).toBeInTheDocument();
  });

  it("does not show the iframe when disabled", () => {
    renderPage();
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });

  it("does not show 'Connecting to membrain...' when disabled", () => {
    renderPage();
    expect(screen.queryByText(/Connecting to membrain/i)).not.toBeInTheDocument();
  });
});

// ── Tests: Enable flow ────────────────────────────────────────

describe("MemoryDashboardPage — Enable Memory button", () => {
  it("clicking Enable Memory calls setMembrainEnabled(true)", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Enable Memory" }));
    await waitFor(() => {
      expect(mockSetMembrainEnabled).toHaveBeenCalledWith(true);
    });
  });

  it("transitions to connecting state after enabling", async () => {
    // After enable, getMembrainEnabled returns true but server is not ready
    mockSetMembrainEnabled = vi.fn().mockImplementation(() => {
      mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Enable Memory" }));
    await waitFor(() => {
      expect(screen.queryByText("Enable Memory")).not.toBeInTheDocument();
    });
  });
});

// ── Tests: Connecting state ───────────────────────────────────

describe("MemoryDashboardPage — Connecting state (enabled, not ready)", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ ready: false, timedOut: false });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows 'Connecting to membrain...'", () => {
    renderPage();
    expect(screen.getByText("Connecting to membrain...")).toBeInTheDocument();
  });

  it("does not show the iframe yet", () => {
    renderPage();
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });

  it("does not show the Labs teaser", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Enable Memory" })).not.toBeInTheDocument();
  });
});

// ── Tests: Timed-out / offline state ─────────────────────────

describe("MemoryDashboardPage — Timed-out (membrain not responding)", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ timedOut: true, installed: true });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows 'membrain server is not running'", () => {
    renderPage();
    expect(screen.getByText("membrain server is not running")).toBeInTheDocument();
  });

  it("shows Start Server button when membrain is installed", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Start Server" })).toBeInTheDocument();
  });

  it("does not show the iframe", () => {
    renderPage();
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });
});

describe("MemoryDashboardPage — Timed-out (membrain not installed)", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ timedOut: true, installed: false });
  });

  it("shows install instructions", () => {
    renderPage();
    expect(screen.getByText(/Install membrain to get started/i)).toBeInTheDocument();
  });

  it("shows the go install command", () => {
    renderPage();
    expect(screen.getByText(/go install github.com\/siracusa5\/membrain/i)).toBeInTheDocument();
  });
});

// ── Tests: Ready state (iframe shown) ────────────────────────

describe("MemoryDashboardPage — Ready state (membrain running)", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ ready: true });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("renders the membrain iframe", () => {
    renderPage();
    expect(screen.getByTitle("membrain")).toBeInTheDocument();
  });

  it("iframe points to the membrain server root", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    expect(iframe.src).toContain("localhost:3131");
  });

  it("iframe has sandbox attribute for security", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toContain("allow-scripts");
  });

  it("does not show the Labs teaser", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Enable Memory" })).not.toBeInTheDocument();
  });

  it("does not show connecting message", () => {
    renderPage();
    expect(screen.queryByText(/Connecting to membrain/i)).not.toBeInTheDocument();
  });
});
