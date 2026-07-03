import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FleetPage from "../FleetPage";

// ── Mocks ──────────────────────────────────────────────────────

const mockBuildFleetReport = vi.fn();

vi.mock("@harness-kit/core", () => ({
  buildFleetReport: (...args: unknown[]) => mockBuildFleetReport(...args),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/home/user")),
}));

vi.mock("../../../lib/harness-fs", () => ({
  TauriFsProvider: vi.fn().mockImplementation(function (this: unknown, cwd: string) {
    return { cwd: () => cwd };
  }),
}));

const mockDetectHarnesses = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  detectHarnesses: () => mockDetectHarnesses(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <FleetPage />
    </MemoryRouter>,
  );
}

describe("FleetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockDetectHarnesses.mockResolvedValue([
      { id: "claude", name: "Claude Code", command: "claude", available: true, version: "1.5.0", authenticated: true, models: [] },
    ]);
  });

  it("shows the empty state when nothing is installed", async () => {
    mockBuildFleetReport.mockResolvedValue({
      scopes: [{ kind: "global", root: "/home/user", label: "Global" }],
      rows: [
        { adapter: "claude-code", cells: { "/home/user": { adapter: "claude-code", targets: [], status: "not-installed", driftCount: 0, detail: "" } } },
      ],
      summary: { inSync: 0, drift: 0, notConfigured: 0, notInstalled: 1 },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Scan this machine").length).toBeGreaterThan(0),
    );
  });

  it("renders the Fleet matrix with a summary strip and Recompile all action", async () => {
    mockBuildFleetReport.mockResolvedValue({
      scopes: [{ kind: "global", root: "/home/user", label: "Global" }],
      rows: [
        { adapter: "claude-code", cells: { "/home/user": { adapter: "claude-code", targets: [], status: "in-sync", driftCount: 0, detail: "matches" } } },
        { adapter: "cursor", cells: { "/home/user": { adapter: "cursor", targets: [], status: "drift", driftCount: 3, detail: "3 drifted" } } },
      ],
      summary: { inSync: 1, drift: 1, notConfigured: 0, notInstalled: 0 },
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Fleet" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /recompile all/i })).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Drift 3")).toBeInTheDocument();
  });
});
