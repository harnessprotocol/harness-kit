import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DriftPage from "../DriftPage";

// ── Mocks ──────────────────────────────────────────────────────

const mockParseHarness = vi.fn();
const mockValidateHarness = vi.fn();
const mockDetectDrift = vi.fn();
const mockBuildFixPlan = vi.fn();
const mockApplyFix = vi.fn();

vi.mock("@harness-kit/core", () => ({
  parseHarness: (...args: unknown[]) => mockParseHarness(...args),
  validateHarness: (...args: unknown[]) => mockValidateHarness(...args),
  detectDrift: (...args: unknown[]) => mockDetectDrift(...args),
  buildFixPlan: (...args: unknown[]) => mockBuildFixPlan(...args),
  applyFix: (...args: unknown[]) => mockApplyFix(...args),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/home/user")),
}));

function makeFsProvider(cwd: string) {
  return {
    cwd: () => cwd,
    readFile: vi.fn(() => Promise.resolve('version: "1"\nmetadata:\n  name: test-harness\n')),
    joinPath: (...segs: string[]) => segs.join("/"),
    homedir: () => Promise.resolve("/home/user"),
  };
}

vi.mock("../../../lib/harness-fs", () => ({
  TauriFsProvider: vi.fn().mockImplementation(function (this: unknown, cwd: string) {
    return makeFsProvider(cwd);
  }),
}));

const mockGetAcknowledgedDriftItems = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  acknowledgeDriftItem: vi.fn(),
  unacknowledgeDriftItem: vi.fn(),
  getAcknowledgedDriftItems: () => mockGetAcknowledgedDriftItems(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <DriftPage />
    </MemoryRouter>,
  );
}

describe("DriftPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockParseHarness.mockReturnValue({ config: { metadata: { name: "test-harness" } } });
    mockValidateHarness.mockReturnValue({ valid: true });
    mockGetAcknowledgedDriftItems.mockResolvedValue([]);
  });

  it("shows the empty state when there is no drift", async () => {
    mockDetectDrift.mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    renderPage();
    await waitFor(() => expect(screen.getByText("No drift detected")).toBeInTheDocument());
  });

  it("renders a drift item grouped by scope and harness, with a Fix button", async () => {
    mockDetectDrift.mockResolvedValue({
      items: [
        {
          class: "modified-inside-markers",
          path: "CLAUDE.md",
          adapter: "claude-code",
          target: "claude-code",
          harnessName: "test-harness",
          slot: "operational",
          expectedContent: "expected content",
          detail: "content drifted from harness.yaml",
        },
      ],
      hasDrift: true,
      byClass: {},
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Drift" })).toBeInTheDocument());
    expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
    expect(screen.getByText("Repairable")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Fix" }).length).toBeGreaterThan(0);
  });

  it("offers Acknowledge (never Fix) for user-modified-outside items", async () => {
    mockDetectDrift.mockResolvedValue({
      items: [
        {
          class: "user-modified-outside",
          path: "CLAUDE.md",
          adapter: "claude-code",
          target: "claude-code",
          harnessName: "test-harness",
          slot: "operational",
          detail: "edited outside markers",
        },
      ],
      hasDrift: true,
      byClass: {},
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("User-edited")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fix" })).not.toBeInTheDocument();
  });
});
