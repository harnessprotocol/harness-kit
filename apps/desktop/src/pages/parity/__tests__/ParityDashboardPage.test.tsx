import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ParityDashboardPage from "../ParityDashboardPage";

// ── Mocks ───────────────────────────────────────────────────────

const mockGetParitySnapshot = vi.fn();
const mockGetParityDrift = vi.fn();
const mockRunParityScan = vi.fn();
const mockAcknowledgeDrift = vi.fn();
const mockCreateConfigFile = vi.fn();
const mockAddToParityBaseline = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  getParitySnapshot: () => mockGetParitySnapshot(),
  getParityDrift: (...args: unknown[]) => mockGetParityDrift(...args),
  runParityScan: () => mockRunParityScan(),
  acknowledgeDrift: (...args: unknown[]) => mockAcknowledgeDrift(...args),
  createConfigFile: (...args: unknown[]) => mockCreateConfigFile(...args),
  addToParityBaseline: (...args: unknown[]) => mockAddToParityBaseline(...args),
}));

// ── Fixtures ────────────────────────────────────────────────────

const RECENT_ISO = new Date(Date.now() - 60_000).toISOString(); // 1 min ago

const SNAPSHOT = {
  id: "snap-1",
  timestamp: RECENT_ISO,
  ccVersion: "1.2.3",
  ccInstalled: true,
  categories: {
    cli_flag: [
      { name: "--version", category: "cli_flag", value: null, knownToHarness: true },
      { name: "--help", category: "cli_flag", value: null, knownToHarness: true },
    ],
    settings_key: [
      { name: "permissions.allow", category: "settings_key", value: null, knownToHarness: true },
    ],
  },
};

const DRIFT_ITEM_NEW_FEATURE = {
  id: 1,
  category: "settings_key",
  featureName: "someNewKey",
  driftType: "new_feature",
  details: "Key 'someNewKey' found in settings.json but not tracked",
  detectedAt: RECENT_ISO,
  acknowledged: false,
};

const DRIFT_ITEM_MISSING_FILE = {
  id: 2,
  category: "config_file",
  featureName: "CLAUDE.md",
  driftType: "missing_file",
  details: "CLAUDE.md is expected but not found",
  detectedAt: RECENT_ISO,
  acknowledged: false,
};

// ── Helpers ─────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <ParityDashboardPage />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe("ParityDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetParitySnapshot.mockResolvedValue(null);
    mockGetParityDrift.mockResolvedValue([]);
    mockRunParityScan.mockResolvedValue({
      snapshotId: "snap-new",
      ccVersion: "1.2.3",
      ccInstalled: true,
      featuresDetected: 2,
      driftCount: 0,
      driftItems: [],
      scannedAt: new Date().toISOString(),
    });
    mockAcknowledgeDrift.mockResolvedValue(undefined);
    mockCreateConfigFile.mockResolvedValue("/home/user/CLAUDE.md");
    mockAddToParityBaseline.mockResolvedValue(undefined);
  });

  it("renders without crashing", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Parity")).toBeInTheDocument();
    });
  });

  it("shows Scan Now button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /scan now/i })).toBeInTheDocument();
    });
  });

  it("triggers auto-scan when no snapshot exists", async () => {
    mockGetParitySnapshot.mockResolvedValue(null);
    renderPage();
    await waitFor(() => {
      expect(mockRunParityScan).toHaveBeenCalledTimes(1);
    });
  });

  it("does not auto-scan when a recent snapshot exists", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("1.2.3")).toBeInTheDocument();
    });
    expect(mockRunParityScan).not.toHaveBeenCalled();
  });

  it("shows Claude Code version from snapshot", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("1.2.3")).toBeInTheDocument();
    });
  });

  it("shows Features Detected count", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    renderPage();
    await waitFor(() => {
      // 2 cli_flags + 1 settings_key = 3 features
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("shows zero drift when no drift items", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    mockGetParityDrift.mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Features Detected")).toBeInTheDocument();
    });
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders drift item in list", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_NEW_FEATURE]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("someNewKey")).toBeInTheDocument();
    });
  });

  it("expanding a new_feature drift item shows About block and Mark as Known button", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_NEW_FEATURE]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("someNewKey")).toBeInTheDocument();
    });

    // Click the row to expand
    fireEvent.click(screen.getByText("someNewKey").closest("div")!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /mark as known/i })).toBeInTheDocument();
    });
  });

  it("expanding a missing_file drift item shows Create button", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_MISSING_FILE]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("CLAUDE.md").closest("div")!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create claude\.md/i })).toBeInTheDocument();
    });
  });

  it("Acknowledge button calls acknowledgeDrift", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_NEW_FEATURE]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("someNewKey")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("someNewKey").closest("div")!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => {
      expect(mockAcknowledgeDrift).toHaveBeenCalledWith(DRIFT_ITEM_NEW_FEATURE.id);
    });
  });

  it("Mark as Known calls addToParityBaseline then rescans", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    mockGetParityDrift.mockResolvedValue([DRIFT_ITEM_NEW_FEATURE]);
    renderPage();

    await waitFor(() => expect(screen.getByText("someNewKey")).toBeInTheDocument());
    fireEvent.click(screen.getByText("someNewKey").closest("div")!);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /mark as known/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /mark as known/i }));

    await waitFor(() => {
      expect(mockAddToParityBaseline).toHaveBeenCalledWith(
        DRIFT_ITEM_NEW_FEATURE.category,
        DRIFT_ITEM_NEW_FEATURE.featureName,
      );
      expect(mockRunParityScan).toHaveBeenCalled();
    });
  });

  it("feature matrix section renders when snapshot has data", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("CLI Flags")).toBeInTheDocument();
    });
  });

  it("shows No drift items when list is empty", async () => {
    mockGetParitySnapshot.mockResolvedValue(SNAPSHOT);
    mockGetParityDrift.mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no drift items/i)).toBeInTheDocument();
    });
  });
});
