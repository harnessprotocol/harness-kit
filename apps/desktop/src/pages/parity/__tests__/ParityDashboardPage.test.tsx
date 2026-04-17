import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ParityDashboardPage from "../ParityDashboardPage";
import { deepLinkForVersion } from "../deep-link";

// ── Mocks ─────────────────────────────────────────────────────────

const mockDetectHarnesses = vi.fn();
const mockProbeHarnessCapabilities = vi.fn();
const mockGetParityDrift = vi.fn();
const mockRunParityScan = vi.fn();
const mockAcknowledgeDrift = vi.fn();
const mockCreateConfigFile = vi.fn();
const mockAddToParityBaseline = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  detectHarnesses: () => mockDetectHarnesses(),
  probeHarnessCapabilities: () => mockProbeHarnessCapabilities(),
  getParityDrift: (...args: unknown[]) => mockGetParityDrift(...args),
  runParityScan: () => mockRunParityScan(),
  acknowledgeDrift: (...args: unknown[]) => mockAcknowledgeDrift(...args),
  createConfigFile: (...args: unknown[]) => mockCreateConfigFile(...args),
  addToParityBaseline: (...args: unknown[]) => mockAddToParityBaseline(...args),
}));

// ── Fixtures ───────────────────────────────────────────────────────

/** 3 harnesses: claude-code (installed), cursor (installed), copilot (not installed) */
const HARNESSES = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    available: true,
    version: "2.1.112",
    authenticated: true,
    models: [],
    defaultModel: "claude-opus-4-6",
  },
  {
    id: "cursor",
    name: "Cursor",
    command: "cursor",
    available: true,
    version: "3.1",
    authenticated: false,
    models: [],
  },
  {
    id: "copilot",
    name: "Copilot",
    command: "gh copilot",
    available: false,
    authenticated: false,
    models: [],
  },
];

/**
 * Probe data for the 3-harness fixture.
 * - claude-code::instructions-file → detected (●)
 * - cursor::instructions-file → missing (○)
 * - copilot::instructions-file → not_applicable (—, since copilot not installed)
 * - claude-code::mcp-config → missing (○)
 * - cursor::mcp-config → missing (○)
 */
const PROBE_DATA: Record<string, "detected" | "missing" | "not_applicable"> = {
  "claude-code::instructions-file": "detected",
  "cursor::instructions-file": "missing",
  "copilot::instructions-file": "not_applicable",
  "claude-code::mcp-config": "missing",
  "cursor::mcp-config": "missing",
  "copilot::mcp-config": "not_applicable",
};

const DRIFT_ITEM_NEW_FEATURE = {
  id: 1,
  category: "settings_key",
  featureName: "someNewKey",
  driftType: "new_feature" as const,
  details: "Key 'someNewKey' found in settings.json but not tracked",
  detectedAt: new Date().toISOString(),
  acknowledged: false,
};

const DRIFT_ITEM_MISSING_FILE = {
  id: 2,
  category: "config_file",
  featureName: "CLAUDE.md",
  driftType: "missing_file" as const,
  details: "CLAUDE.md is expected but not found",
  detectedAt: new Date().toISOString(),
  acknowledged: false,
};

// ── Helpers ────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <ParityDashboardPage />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────

describe("ParityDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectHarnesses.mockResolvedValue(HARNESSES);
    mockProbeHarnessCapabilities.mockResolvedValue(PROBE_DATA);
    mockGetParityDrift.mockResolvedValue([]);
    mockRunParityScan.mockResolvedValue({
      snapshotId: "snap-new",
      ccVersion: "2.1.112",
      ccInstalled: true,
      featuresDetected: 5,
      driftCount: 0,
      driftItems: [],
      scannedAt: new Date().toISOString(),
    });
    mockAcknowledgeDrift.mockResolvedValue(undefined);
    mockCreateConfigFile.mockResolvedValue("/home/user/CLAUDE.md");
    mockAddToParityBaseline.mockResolvedValue(undefined);
  });

  // ── Basic render ──────────────────────────────────────────────

  it("renders the Parity heading and new subtitle", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Parity")).toBeInTheDocument();
      expect(screen.getByText(/compare feature parity across your ai coding harnesses/i)).toBeInTheDocument();
    });
  });

  it("renders the capability grid container", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("capability-grid")).toBeInTheDocument();
    });
  });

  // ── Grid structure ────────────────────────────────────────────

  it("renders a header cell for each visible harness", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("harness-header-claude-code")).toBeInTheDocument();
      expect(screen.getByTestId("harness-header-cursor")).toBeInTheDocument();
    });
    // copilot is hidden by "Installed only" filter (default)
    expect(screen.queryByTestId("harness-header-copilot")).not.toBeInTheDocument();
  });

  it("shows all harnesses when 'All harnesses' filter is selected", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Installed only")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("All harnesses"));
    await waitFor(() => {
      expect(screen.getByTestId("harness-header-copilot")).toBeInTheDocument();
    });
  });

  it("renders harness names in the header", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
      expect(screen.getByText("Cursor")).toBeInTheDocument();
    });
  });

  // ── Glyph states ──────────────────────────────────────────────

  it("shows filled dot (●) for detected capability", async () => {
    renderPage();
    await waitFor(() => {
      const cell = screen.getByTestId("cell-instructions-file-claude-code");
      expect(cell.querySelector("[data-testid='glyph-instructions-file-claude-code']")?.textContent).toBe("●");
    });
  });

  it("shows ring (○) for missing capability", async () => {
    renderPage();
    await waitFor(() => {
      const glyph = screen.getByTestId("glyph-instructions-file-cursor");
      expect(glyph.textContent).toBe("○");
    });
  });

  it("shows dash (—) for unsupported capability (settings-file for cursor)", async () => {
    // settings-file is supported: false for cursor
    renderPage();
    await waitFor(() => {
      const glyph = screen.getByTestId("glyph-settings-file-cursor");
      expect(glyph.textContent).toBe("—");
    });
  });

  // ── Feature label → drawer ────────────────────────────────────

  it("clicking a feature label opens the detail drawer", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("feature-label-instructions-file")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("feature-label-instructions-file"));
    await waitFor(() => {
      // drawer footer shows "Tracked since" text + "Add to selection" button
      expect(screen.getByText(/tracked since/i)).toBeInTheDocument();
      expect(screen.getByText("Add to selection")).toBeInTheDocument();
    });
  });

  it("drawer closes when clicking the × button", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("feature-label-instructions-file")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("feature-label-instructions-file"));
    await waitFor(() => expect(screen.getByText("Add to selection")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    await waitFor(() => expect(screen.queryByText("Add to selection")).not.toBeInTheDocument());
  });

  // ── Cell click → selection → batch bar ───────────────────────

  it("clicking a missing cell toggles selection (count badge appears)", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("cell-instructions-file-cursor")).toBeInTheDocument();
    });
    // cursor::instructions-file is "missing" → ring → selectable
    fireEvent.click(screen.getByTestId("cell-instructions-file-cursor"));
    // The selection count badge should show 1
    await waitFor(() => {
      const countBadge = screen.getByText("1");
      expect(countBadge).toBeInTheDocument();
    });
  });

  it("clicking a detected cell toggles selection too", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("cell-instructions-file-claude-code")).toBeInTheDocument();
    });
    // claude-code::instructions-file is "detected" → dot → still selectable (config category)
    fireEvent.click(screen.getByTestId("cell-instructions-file-claude-code"));
    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("clicking a dash cell (unsupported) does nothing", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("glyph-settings-file-cursor")).toBeInTheDocument();
    });
    // settings-file is unsupported for cursor → dash → non-interactive
    fireEvent.click(screen.getByTestId("cell-settings-file-cursor"));
    // Count badge should NOT appear
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("clicking a selected cell deselects it", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("cell-instructions-file-cursor")).toBeInTheDocument());
    const cell = screen.getByTestId("cell-instructions-file-cursor");
    fireEvent.click(cell);
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    fireEvent.click(cell);
    await waitFor(() => expect(screen.queryByText("1")).not.toBeInTheDocument());
  });

  // ── Version deeplinks ─────────────────────────────────────────

  it("version link for claude-code points to the correct changelog entry", async () => {
    renderPage();
    await waitFor(() => {
      const link = screen.getByTestId("version-link-claude-code");
      expect(link).toHaveAttribute("href", deepLinkForVersion("claude-code", "2.1.112"));
    });
  });

  it("version link for cursor points to the correct changelog entry", async () => {
    renderPage();
    await waitFor(() => {
      const link = screen.getByTestId("version-link-cursor");
      expect(link).toHaveAttribute("href", deepLinkForVersion("cursor", "3.1"));
    });
  });

  // ── Right-click column menu ───────────────────────────────────

  it("right-clicking a harness header opens the column menu", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("harness-header-cursor")).toBeInTheDocument());
    fireEvent.contextMenu(screen.getByTestId("harness-header-cursor"));
    await waitFor(() => {
      expect(screen.getByText("Hide Cursor")).toBeInTheDocument();
    });
  });

  it("clicking Hide in column menu removes the column", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("harness-header-cursor")).toBeInTheDocument());
    fireEvent.contextMenu(screen.getByTestId("harness-header-cursor"));
    await waitFor(() => expect(screen.getByText("Hide Cursor")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Hide Cursor"));
    await waitFor(() => {
      expect(screen.queryByTestId("harness-header-cursor")).not.toBeInTheDocument();
    });
  });

  it("shows 'N hidden · show all' chip after hiding a column", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("harness-header-cursor")).toBeInTheDocument());
    fireEvent.contextMenu(screen.getByTestId("harness-header-cursor"));
    await waitFor(() => expect(screen.getByText("Hide Cursor")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Hide Cursor"));
    await waitFor(() => {
      expect(screen.getByText(/1 hidden · show all/i)).toBeInTheDocument();
    });
  });

  it("clicking 'show all' chip restores hidden columns", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("harness-header-cursor")).toBeInTheDocument());
    fireEvent.contextMenu(screen.getByTestId("harness-header-cursor"));
    await waitFor(() => expect(screen.getByText("Hide Cursor")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Hide Cursor"));
    await waitFor(() => expect(screen.getByText(/1 hidden · show all/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/1 hidden · show all/i));
    await waitFor(() => {
      expect(screen.getByTestId("harness-header-cursor")).toBeInTheDocument();
    });
  });

  // ── Category filter ───────────────────────────────────────────

  it("category filter limits visible feature rows", async () => {
    renderPage();
    // "Config files" section header appears (in the grid)
    await waitFor(() => expect(screen.getByTestId("feature-label-instructions-file")).toBeInTheDocument());
    // Filter to "Plugin components" only — click the chip button
    fireEvent.click(screen.getByRole("button", { name: "Plugin components" }));
    await waitFor(() => {
      // Config-category features no longer shown
      expect(screen.queryByTestId("feature-label-instructions-file")).not.toBeInTheDocument();
      // Plugin-category features visible
      expect(screen.getByTestId("feature-label-slash-commands")).toBeInTheDocument();
    });
  });

  // ── "What's changed" panel ────────────────────────────────────

  it("'What's changed' panel is collapsed by default", async () => {
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_NEW_FEATURE]);
    renderPage();
    await waitFor(() => expect(screen.getByText("What's changed")).toBeInTheDocument());
    // Drift item should NOT be visible (panel collapsed)
    expect(screen.queryByText("someNewKey")).not.toBeInTheDocument();
  });

  it("clicking 'What's changed' header expands the panel", async () => {
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_NEW_FEATURE]);
    renderPage();
    await waitFor(() => expect(screen.getByText("What's changed")).toBeInTheDocument());
    fireEvent.click(screen.getByText("What's changed"));
    await waitFor(() => {
      expect(screen.getByText("someNewKey")).toBeInTheDocument();
    });
  });

  it("expanding drift row shows Acknowledge button", async () => {
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_NEW_FEATURE]);
    renderPage();
    await waitFor(() => expect(screen.getByText("What's changed")).toBeInTheDocument());
    fireEvent.click(screen.getByText("What's changed"));
    await waitFor(() => expect(screen.getByText("someNewKey")).toBeInTheDocument());
    fireEvent.click(screen.getByText("someNewKey"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
    });
  });

  it("expanding a missing_file drift row shows Create button", async () => {
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_MISSING_FILE]);
    renderPage();
    fireEvent.click(screen.getByText("What's changed"));
    await waitFor(() => expect(screen.getByText("CLAUDE.md")).toBeInTheDocument());
    fireEvent.click(screen.getByText("CLAUDE.md"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create claude\.md/i })).toBeInTheDocument();
    });
  });

  it("Acknowledge button calls acknowledgeDrift", async () => {
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_NEW_FEATURE]);
    renderPage();
    fireEvent.click(screen.getByText("What's changed"));
    await waitFor(() => expect(screen.getByText("someNewKey")).toBeInTheDocument());
    fireEvent.click(screen.getByText("someNewKey"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => {
      expect(mockAcknowledgeDrift).toHaveBeenCalledWith(DRIFT_ITEM_NEW_FEATURE.id);
    });
  });
});
