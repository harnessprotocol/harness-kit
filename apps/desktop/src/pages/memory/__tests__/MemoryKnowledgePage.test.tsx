import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemoryKnowledgePage from "../MemoryKnowledgePage";

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

function renderPage(path = "/memory/knowledge") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MemoryKnowledgePage />
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

describe("MemoryKnowledgePage — Labs gate", () => {
  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows Labs teaser when membrain is disabled", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Enable Memory" })).toBeInTheDocument();
  });

  it("does not render the iframe", () => {
    renderPage();
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });
});

describe("MemoryKnowledgePage — Connecting state", () => {
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
});

describe("MemoryKnowledgePage — Ready state", () => {
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

  it("iframe src includes /knowledge path", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    expect(iframe.src).toContain("/knowledge");
  });
});
