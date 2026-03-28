import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MemorySettingsPage from "../MemorySettingsPage";

// ── Mocks ─────────────────────────────────────────────────────

let mockGetMembrainEnabled: () => boolean;
let mockSetMembrainEnabled: (v: boolean) => void;

vi.mock("../../../lib/preferences", () => ({
  get getMembrainEnabled() { return mockGetMembrainEnabled; },
  get setMembrainEnabled() { return mockSetMembrainEnabled; },
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

function renderPage(path = "/memory/settings") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MemorySettingsPage />
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
  mockSetMembrainEnabled = vi.fn();
  mockServerState = makeServerState();
});

// ── Tests ─────────────────────────────────────────────────────

describe("MemorySettingsPage — Labs gate (membrain disabled)", () => {
  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows the Labs teaser when membrain is not enabled", () => {
    renderPage();
    // Settings are inside the membrain webview; before enabling, we see the Labs gate
    expect(screen.getByRole("button", { name: "Enable Memory" })).toBeInTheDocument();
  });

  it("shows alpha notice mentioning mem CLI", () => {
    renderPage();
    expect(screen.getByText(/Alpha — personal use only/i)).toBeInTheDocument();
  });

  it("does not render the settings iframe", () => {
    renderPage();
    expect(screen.queryByTitle("membrain")).not.toBeInTheDocument();
  });

  it("shows dismissal note about turning off in Preferences", () => {
    renderPage();
    expect(screen.getByText(/turn this off in Preferences/i)).toBeInTheDocument();
  });
});

describe("MemorySettingsPage — Enable flow", () => {
  it("Enable Memory button calls setMembrainEnabled(true)", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Enable Memory" }));
    await waitFor(() => {
      expect(mockSetMembrainEnabled).toHaveBeenCalledWith(true);
    });
  });
});

describe("MemorySettingsPage — Connecting state", () => {
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

describe("MemorySettingsPage — Timed-out (not installed)", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ timedOut: true, installed: false });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("shows offline message", () => {
    renderPage();
    expect(screen.getByText("membrain server is not running")).toBeInTheDocument();
  });

  it("shows install instructions", () => {
    renderPage();
    expect(screen.getByText(/Install membrain to get started/i)).toBeInTheDocument();
  });

  it("shows the go install command", () => {
    renderPage();
    expect(screen.getByText(/go install github.com\/siracusa5\/membrain/i)).toBeInTheDocument();
  });

  it("shows Start membrain button even when not installed (lets user try)", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Start membrain" })).toBeInTheDocument();
  });
});

describe("MemorySettingsPage — Timed-out (installed)", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ timedOut: true, installed: true });
  });

  it("shows Start Server button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Start Server" })).toBeInTheDocument();
  });
});

describe("MemorySettingsPage — Ready state (settings iframe shown)", () => {
  beforeEach(() => {
    mockGetMembrainEnabled = vi.fn().mockReturnValue(true);
    mockServerState = makeServerState({ ready: true });
  });

  it("renders without crashing", () => {
    expect(() => renderPage()).not.toThrow();
  });

  it("renders the membrain settings iframe", () => {
    renderPage();
    expect(screen.getByTitle("membrain")).toBeInTheDocument();
  });

  it("iframe src includes /settings path", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    expect(iframe.src).toContain("/settings");
  });

  it("iframe has allow-forms in sandbox (settings need form submission)", () => {
    renderPage();
    const iframe = screen.getByTitle("membrain") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toContain("allow-forms");
  });

  it("does not show Labs teaser when ready", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Enable Memory" })).not.toBeInTheDocument();
  });
});
