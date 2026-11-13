import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DriftPage from "../DriftPage";
import { PROJECT_CHANGED_EVENT } from "../../../lib/project-dir";

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

vi.mock("../../fleet/portability-data", () => ({
  buildDesktopPortabilitySnapshot: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/home/user")),
  // Used to locate the legacy comparator.db for the AC-37 acknowledgement
  // migration, which runs before acknowledgements are read.
  appDataDir: vi.fn(() => Promise.resolve("/home/user/Library/harness-kit")),
  join: vi.fn((...segments: string[]) => Promise.resolve(segments.join("/"))),
}));

// Paths with no file, and paths whose read fails. Every other harness.yaml
// exists and reads as a valid one.
const absentPaths = new Set<string>();
const unreadablePaths = new Set<string>();

function makeFsProvider(cwd: string) {
  return {
    cwd: () => cwd,
    exists: vi.fn((p: string) => Promise.resolve(!absentPaths.has(p))),
    readFile: vi.fn((p: string) =>
      unreadablePaths.has(p)
        ? Promise.reject(new Error("EACCES: permission denied"))
        : Promise.resolve('version: "1"\nmetadata:\n  name: test-harness\n'),
    ),
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
const mockGrantProjectScope = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
  acknowledgeDriftItem: vi.fn(),
  unacknowledgeDriftItem: vi.fn(),
  getAcknowledgedDriftItems: () => mockGetAcknowledgedDriftItems(),
  migrateDriftAcknowledgements: vi.fn(() => Promise.resolve(0)),
  readHarnessFile: () => mockReadHarnessFile(),
}));
const mockReadHarnessFile = vi.fn();

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
    absentPaths.clear();
    unreadablePaths.clear();
    localStorage.clear();
    mockParseHarness.mockReturnValue({ config: { metadata: { name: "test-harness" } } });
    mockValidateHarness.mockReturnValue({ valid: true });
    mockGetAcknowledgedDriftItems.mockResolvedValue([]);
    mockGrantProjectScope.mockResolvedValue(undefined);
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
  });

  it("shows the empty state when there is no drift", async () => {
    mockDetectDrift.mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    renderPage();
    await waitFor(() => expect(screen.getByText("No drift detected")).toBeInTheDocument());
  });

  describe("what the empty state claims (AC-55)", () => {
    const EMPTY = { items: [], hasDrift: false, byClass: {} };

    it("says 'no harness.yaml', not 'No drift detected', when ~/.claude/harness.yaml is absent", async () => {
      absentPaths.add("/home/user/.claude/harness.yaml");
      mockDetectDrift.mockResolvedValue(EMPTY);
      renderPage();
      expect(await screen.findByTestId("drift-scope-notes")).toHaveTextContent(
        "no harness.yaml at /home/user/.claude/harness.yaml",
      );
      expect(screen.queryByText("No drift detected")).not.toBeInTheDocument();
      expect(mockDetectDrift).not.toHaveBeenCalled();
    });

    it("tells the user to move ~/harness.yaml when only that file exists", async () => {
      absentPaths.add("/home/user/.claude/harness.yaml");
      mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null, legacy_home_file: true });
      mockDetectDrift.mockResolvedValue(EMPTY);
      renderPage();
      expect(await screen.findByTestId("drift-scope-notes")).toHaveTextContent(
        "Found ~/harness.yaml. Harness Kit now reads ~/.claude/harness.yaml; move the file there.",
      );
    });

    it("shows no move notice when ~/.claude/harness.yaml exists", async () => {
      mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null, legacy_home_file: true });
      mockDetectDrift.mockResolvedValue(EMPTY);
      renderPage();
      await screen.findByText("No drift detected");
      expect(screen.queryByText(/Found ~\/harness.yaml/)).not.toBeInTheDocument();
    });

    it("says 'could not read' when the file exists but cannot be read", async () => {
      unreadablePaths.add("/home/user/.claude/harness.yaml");
      mockDetectDrift.mockResolvedValue(EMPTY);
      renderPage();
      expect(await screen.findByTestId("drift-scope-notes")).toHaveTextContent(
        "could not read /home/user/.claude/harness.yaml (EACCES: permission denied)",
      );
      expect(screen.queryByText("No drift detected")).not.toBeInTheDocument();
    });

    it("says 'never compiled' when every slot is missing", async () => {
      mockDetectDrift.mockResolvedValue({
        items: [
          { class: "missing", path: "CLAUDE.md", adapter: "claude-code", target: "claude-code", harnessName: "h", slot: "operational", detail: "d" },
        ],
        hasDrift: true,
        byClass: {},
      });
      renderPage();
      expect(await screen.findByTestId("drift-scope-notes")).toHaveTextContent("has never been compiled");
    });

    it("does not mention 'this project' when no project is set", async () => {
      mockDetectDrift.mockResolvedValue(EMPTY);
      renderPage();
      const description = await screen.findByText(/Every deployed config matches harness\.yaml/);
      expect(description).toHaveTextContent("across Global.");
      expect(description).not.toHaveTextContent("this project");
    });

    it("mentions 'this project' when one is set, and reads its committed harness.yaml", async () => {
      localStorage.setItem("harness-kit-current-project", "/repo/first");
      mockDetectDrift.mockResolvedValue(EMPTY);
      renderPage();
      const description = await screen.findByText(/Every deployed config matches harness\.yaml/);
      expect(description).toHaveTextContent("across Global and this project.");
    });

    it("reports a project with no committed harness.yaml by its own path", async () => {
      localStorage.setItem("harness-kit-current-project", "/repo/first");
      absentPaths.add("/repo/first/harness.yaml");
      mockDetectDrift.mockResolvedValue(EMPTY);
      renderPage();
      expect(await screen.findByTestId("drift-scope-notes")).toHaveTextContent("no harness.yaml at /repo/first/harness.yaml");
    });
  });

  it("a failed scan says so, with Retry and the raw error behind Details, not 'No drift detected' (AC-20)", async () => {
    const raw = "EACCES: permission denied, open '/home/user/.claude/CLAUDE.md'";
    mockDetectDrift
      .mockRejectedValueOnce(new Error(raw))
      .mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't check for drift");
    expect(screen.queryByText("No drift detected")).not.toBeInTheDocument();
    expect(screen.getByText(raw)).not.toBeVisible();
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText(raw)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No drift detected")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

  it("scans the title bar's project, and rescans when it changes (AC-17)", async () => {
    mockDetectDrift.mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    const scannedRoots = () =>
      mockDetectDrift.mock.calls.map((call) => (call[1] as { projectRoot: string }).projectRoot);

    // Written straight to storage, as another window or a past session would:
    // setCurrentProjectDir grants by itself, which would hide a page that
    // stopped granting before it reads.
    function storeProject(dir: string) {
      localStorage.setItem("harness-kit-current-project", dir);
      window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));
    }

    storeProject("/repo/first");
    renderPage();
    await waitFor(() => expect(scannedRoots()).toEqual(["/home/user", "/repo/first"]));
    expect(mockGrantProjectScope).toHaveBeenCalledWith("/repo/first");

    act(() => storeProject("/repo/second"));
    await waitFor(() => expect(scannedRoots()).toContain("/repo/second"));
    expect(mockGrantProjectScope).toHaveBeenCalledWith("/repo/second");
  });
});
