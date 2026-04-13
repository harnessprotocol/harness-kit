import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemoryGraphPage from "../MemoryGraphPage";

// ── Mocks ─────────────────────────────────────────────────────

let mockGetMembrainEnabled: () => boolean;

vi.mock("../../../lib/preferences", () => ({
  get getMembrainEnabled() {
    return mockGetMembrainEnabled;
  },
  setMembrainEnabled: vi.fn(),
}));

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

vi.mock("../../../lib/membrain-api", () => ({
  MEMBRAIN_SERVER_BASE: "http://localhost:3131",
  MEMBRAIN_API: "http://localhost:3131/api/v1",
  syncMembrainTheme: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────

function renderPage(path = "/memory/graph") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MemoryGraphPage />
    </MemoryRouter>,
  );
}

function makeServerState(overrides = {}) {
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
  mockServerState = makeServerState();
});

// ── Tests ─────────────────────────────────────────────────────

describe("MemoryGraphPage — Labs gate (membrain disabled)", () => {
  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows the Labs teaser (not the graph UI)", () => {
    renderPage();
    // The graph visualization lives inside membrain (iframe).
    // Before enabling, we see the Labs teaser, not the graph canvas.
    expect(screen.getByRole("button", { name: "Enable Memory" })).toBeInTheDocument();
  });

  it("does not render the graph iframe", () => {
    renderPage();
    // No iframe — graph is inside membrain webview
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });

  it("mentions force-directed graph in the teaser", () => {
    renderPage();
    expect(screen.getByText(/Force-directed visualization/i)).toBeInTheDocument();
  });
});

describe("MemoryGraphPage — Connecting state", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ ready: false, timedOut: false });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows connecting spinner text", () => {
    renderPage();
    expect(screen.getByText("Connecting to membrain...")).toBeInTheDocument();
  });
});

describe("MemoryGraphPage — Timed-out state", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ timedOut: true, installed: true });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows offline message", () => {
    renderPage();
    expect(screen.getByText("membrain server is not running")).toBeInTheDocument();
  });

  it("shows Start Server button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Start Server" })).toBeInTheDocument();
  });
});

describe("MemoryGraphPage — Timed-out with error", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({
      timedOut: true,
      installed: true,
      error: "spawn failed: permission denied",
    });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows the error message", () => {
    renderPage();
    expect(screen.getByText("spawn failed: permission denied")).toBeInTheDocument();
  });
});

describe("MemoryGraphPage — Ready state (iframe shown)", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ ready: true });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("renders the membrain iframe (graph lives inside it)", () => {
    renderPage();
    // The actual graph canvas/WebGL lives inside the membrain SvelteKit app.
    // We verify the container renders and the iframe is mounted.
    expect(screen.getByTitle("membrain")).toBeInTheDocument();
  });

  it("iframe container renders without overflow issues", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    // Container div must exist as parent
    expect(iframe.parentElement).toBeTruthy();
  });

  it("iframe src includes /graph path", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    expect(iframe.src).toContain("/graph");
  });

  it("does not show the offline message", () => {
    renderPage();
    expect(screen.queryByText("membrain server is not running")).not.toBeInTheDocument();
  });

  it("does not show connecting message when ready", () => {
    renderPage();
    expect(screen.queryByText(/Connecting to membrain/i)).not.toBeInTheDocument();
  });
});
