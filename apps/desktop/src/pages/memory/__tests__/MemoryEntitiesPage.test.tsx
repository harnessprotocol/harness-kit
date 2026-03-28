import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MemoryEntitiesPage from "../MemoryEntitiesPage";

// ── Mocks ─────────────────────────────────────────────────────

let mockGetMembrainEnabled: () => boolean;

vi.mock("../../../lib/preferences", () => ({
  get getMembrainEnabled() { return mockGetMembrainEnabled; },
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

function renderPage(path = "/memory/entities") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MemoryEntitiesPage />
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

describe("MemoryEntitiesPage — Labs gate (membrain disabled)", () => {
  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows the Labs teaser with Enable Memory button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Enable Memory" })).toBeInTheDocument();
  });

  it("shows the Memory Labs badge", () => {
    renderPage();
    expect(screen.getByText("Labs")).toBeInTheDocument();
  });

  it("does not show the iframe", () => {
    renderPage();
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });

  it("does not show empty state text (no entity list rendered)", () => {
    renderPage();
    // The entities list lives inside membrain (iframe), not in this layer
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });
});

describe("MemoryEntitiesPage — Connecting state", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ ready: false, timedOut: false });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows connecting message", () => {
    renderPage();
    expect(screen.getByText("Connecting to membrain...")).toBeInTheDocument();
  });

  it("does not show the iframe while connecting", () => {
    renderPage();
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });
});

describe("MemoryEntitiesPage — Timed-out state", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ timedOut: true, installed: true });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows the offline error message", () => {
    renderPage();
    expect(screen.getByText("membrain server is not running")).toBeInTheDocument();
  });
});

describe("MemoryEntitiesPage — Ready state", () => {
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

  it("iframe src includes /entities path", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    expect(iframe.src).toContain("/entities");
  });

  it("iframe is sandboxed", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBeTruthy();
  });
});
