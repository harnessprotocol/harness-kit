import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { compile, detectPlatforms } from "@harness-kit/core";
import SyncPage from "../SyncPage";
import { CommandPalette } from "../../../components/CommandPalette";
import { setCurrentProjectDir } from "../../../lib/project-dir";
import { syncCreateBackup, syncWriteFiles } from "../../../lib/tauri";

// ── Mocks ──────────────────────────────────────────────────────

const mockReadHarnessFile = vi.fn();
const mockScanClaudeConfig = vi.fn();
const mockSyncFileExists = vi.fn();
const mockSyncListBackups = vi.fn();
const mockGrantProjectScope = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  readHarnessFile: () => mockReadHarnessFile(),
  scanClaudeConfig: () => mockScanClaudeConfig(),
  syncFileExists: (...args: unknown[]) => mockSyncFileExists(...args),
  syncListBackups: (...args: unknown[]) => mockSyncListBackups(...args),
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
  syncWriteFiles: vi.fn(),
  syncCreateBackup: vi.fn(),
  writeHarnessFile: vi.fn(),
  syncReadFile: vi.fn(),
  syncReadDir: vi.fn(),
}));

vi.mock("@harness-kit/core", () => ({
  COMPILE_SURFACE_IDS: ["claude-code", "cursor", "copilot-vscode", "codex", "opencode", "windsurf", "gemini", "junie"],
  isCompileSurface: (id: string) =>
    ["claude-code", "cursor", "copilot-vscode", "codex", "opencode", "windsurf", "gemini", "junie"].includes(id),
  getSurface: vi.fn((id: string) => ({ id, label: id })),
  compile: vi.fn(() => Promise.resolve({ outputs: {} })),
  detectPlatforms: vi.fn(() => Promise.resolve([])),
  parseHarness: vi.fn(() => ({ config: { version: "1" } })),
  posixJoin: vi.fn((...args: string[]) => args.join("/")),
  posixDirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
}));

vi.mock("../../../lib/harness-generator", () => ({
  generateHarnessYaml: vi.fn(() => ({ yaml: 'version: "1"\n# generated', summary: { mcpServerCount: 2, allowCount: 16, denyCount: 0, mcpSource: "~/.claude/mcp.json", settingsSource: "~/.claude/settings.local.json" } })),
  HARNESS_TEMPLATE: 'version: "1"\n# template',
}));

vi.mock("../../../lib/sync-fs", () => ({
  // Must be constructible — SyncPage calls `new SyncFsProvider(dir)`, and an
  // arrow-function implementation throws "not a constructor" under `new`.
  SyncFsProvider: vi.fn(function SyncFsProvider() { return {}; }),
}));

// framer-motion: render children without animation
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...props}>{children}</div>,
  },
}));

// Monaco editor is lazily loaded — stub it out entirely
vi.mock("../../../components/plugin-explorer/MonacoEditor", () => ({
  default: () => null,
}));

// Tauri path API used by sync-fs
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/home/user")),
}));

// ── Helpers ────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <SyncPage />
    </MemoryRouter>,
  );
}

// ── Tests ──────────────────────────────────────────────────────

describe("SyncPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
    mockSyncFileExists.mockResolvedValue(false);
    mockSyncListBackups.mockResolvedValue([]);
    mockGrantProjectScope.mockResolvedValue(undefined);
  });

  it("renders without crashing", async () => {
    renderPage();
    // When no harness.yaml exists, shows the empty state
    await waitFor(() => {
      expect(screen.getByText(/No harness\.yaml found/i)).toBeInTheDocument();
    });
  });

  it("shows harness.yaml found state when file exists", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"', path: "/home/user/.claude/harness.yaml" });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Compile to project/i)).toBeInTheDocument();
    });
  });

  it("renders empty state when readHarnessFile throws", async () => {
    mockReadHarnessFile.mockRejectedValue(new Error("command not found"));

    renderPage();

    // Falls back to empty state gracefully
    await waitFor(() => {
      expect(screen.getByText(/No harness\.yaml found/i)).toBeInTheDocument();
    });
  });

  it("seeds target selection from detection with compile surfaces only", async () => {
    // Detection can report surfaces that aren't compile targets (pi). The
    // seeded selection feeds compile() directly, so a non-compile surface in
    // the detection results must never reach the compile targets list.
    mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"', path: "/home/user/.claude/harness.yaml" });
    mockSyncFileExists.mockResolvedValue(true);
    vi.mocked(detectPlatforms).mockResolvedValueOnce([
      { platform: "pi", indicators: [".pi"], needsConfirmation: false },
      { platform: "cursor", indicators: [".cursor"], needsConfirmation: false },
    ]);
    vi.mocked(compile).mockResolvedValueOnce({
      harnessName: "default",
      targets: ["cursor"],
      files: [],
      warnings: [],
    } as never);

    setCurrentProjectDir("/repo/with-pi");
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Directory found/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: /Preview Changes/i }));

    await waitFor(() => {
      expect(compile).toHaveBeenCalledTimes(1);
    });
    const targets = vi.mocked(compile).mock.calls[0][1] as string[];
    expect(targets).toContain("cursor");
    expect(targets).not.toContain("pi");
  });

  it("offers Preview, then Apply, in the palette in step with their buttons (AC-21)", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"', path: "/home/user/.claude/harness.yaml" });
    mockSyncFileExists.mockResolvedValue(true);
    vi.mocked(detectPlatforms).mockResolvedValueOnce([
      { platform: "cursor", indicators: [".cursor"], needsConfirmation: false },
    ]);
    vi.mocked(compile).mockResolvedValueOnce({
      harnessName: "default",
      targets: ["cursor"],
      files: [{ platform: "cursor", path: ".cursor/mcp.json", action: "create", content: "{}" }],
      warnings: [],
    } as never);
    setCurrentProjectDir("/repo/palette");
    render(
      <MemoryRouter>
        <SyncPage />
        <CommandPalette open onClose={() => {}} sections={[]} />
      </MemoryRouter>,
    );
    const palette = () => within(screen.getByRole("dialog", { name: "Command palette" }));
    await screen.findByText(/Directory found/i);
    const preview = palette().getByRole("button", { name: "Preview compile changes" });
    await waitFor(() => expect(preview).not.toHaveAttribute("aria-disabled"));
    expect(palette().queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();

    fireEvent.click(preview);
    await waitFor(() => expect(compile).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Apply 1 file" })).toBeInTheDocument();
    expect(palette().getByRole("button", { name: "Apply 1 compiled file" })).not.toHaveAttribute("aria-disabled");
    // Preview is off outside the idle phase, button and command alike.
    expect(palette().getByRole("button", { name: "Preview compile changes" })).toHaveAttribute("aria-disabled", "true");
  });

  it("a failed preview names what failed, raw error behind Details, and Retry previews again (AC-20)", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"', path: "/home/user/.claude/harness.yaml" });
    mockSyncFileExists.mockResolvedValue(true);
    vi.mocked(detectPlatforms).mockResolvedValueOnce([
      { platform: "cursor", indicators: [".cursor"], needsConfirmation: false },
    ]);
    const raw = "EACCES: permission denied, open '/repo/failing/.cursor/mcp.json'";
    vi.mocked(compile)
      .mockRejectedValueOnce(new Error(raw))
      .mockResolvedValueOnce({ harnessName: "default", targets: ["cursor"], files: [], warnings: [] } as never);
    setCurrentProjectDir("/repo/failing");
    renderPage();
    await screen.findByText(/Directory found/i);
    const previewButton = screen.getByRole("button", { name: "Preview Changes" });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't preview the compiled files");
    expect(screen.getByText(raw)).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(compile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  describe("a preview stands for the inputs it was compiled from", () => {
    beforeEach(() => {
      mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"', path: "/home/user/.claude/harness.yaml" });
      mockSyncFileExists.mockResolvedValue(true);
      vi.mocked(syncCreateBackup).mockResolvedValue({ id: "backup-1" } as never);
      vi.mocked(syncWriteFiles).mockResolvedValue(undefined as never);
    });

    it("toggling a surface drops the preview, and a fresh preview applies the new set with a matching backup", async () => {
      vi.mocked(detectPlatforms).mockResolvedValueOnce([
        { platform: "claude-code", indicators: [".claude"], needsConfirmation: false },
        { platform: "cursor", indicators: [".cursor"], needsConfirmation: false },
      ]);
      vi.mocked(compile)
        .mockResolvedValueOnce({
          harnessName: "default",
          targets: ["claude-code", "cursor"],
          files: [
            { platform: "claude-code", path: ".mcp.json", action: "update", content: "{\"a\":1}" },
            { platform: "cursor", path: ".cursor/mcp.json", action: "create", content: "{}" },
          ],
          warnings: [],
        } as never)
        .mockResolvedValueOnce({
          harnessName: "default",
          targets: ["cursor"],
          files: [{ platform: "cursor", path: ".cursor/mcp.json", action: "create", content: "{}" }],
          warnings: [],
        } as never);
      setCurrentProjectDir("/repo/stale");
      render(
        <MemoryRouter>
          <SyncPage />
          <CommandPalette open onClose={() => {}} sections={[]} />
        </MemoryRouter>,
      );
      const palette = () => within(screen.getByRole("dialog", { name: "Command palette" }));
      await screen.findByText(/Directory found/i);
      const previewButton = screen.getByRole("button", { name: "Preview Changes" });
      await waitFor(() => expect(previewButton).toBeEnabled());
      fireEvent.click(previewButton);
      expect(await screen.findByRole("button", { name: "Apply 2 files" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^claude-code/ }));

      // The old preview is gone, button and command alike, and nothing was written.
      expect(screen.queryByRole("button", { name: /^Apply/ })).not.toBeInTheDocument();
      expect(palette().queryByRole("button", { name: /^Apply/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Preview Changes" })).toBeEnabled();
      expect(syncCreateBackup).not.toHaveBeenCalled();
      expect(syncWriteFiles).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Preview Changes" }));
      await waitFor(() => expect(compile).toHaveBeenCalledTimes(2));
      expect(vi.mocked(compile).mock.calls[1][1]).toEqual(["cursor"]);
      fireEvent.click(await screen.findByRole("button", { name: "Apply 1 file" }));

      await screen.findByText("Sync complete");
      expect(syncCreateBackup).toHaveBeenCalledTimes(1);
      expect(syncCreateBackup).toHaveBeenCalledWith("/repo/stale", "default", ["cursor"], []);
      expect(syncWriteFiles).toHaveBeenCalledTimes(1);
      expect(syncWriteFiles).toHaveBeenCalledWith("/repo/stale", [{ relativePath: ".cursor/mcp.json", content: "{}" }]);
    });

    it("drops a preview that finishes after the project changed", async () => {
      const cursorOnly = [{ platform: "cursor" as const, indicators: [".cursor"], needsConfirmation: false }];
      vi.mocked(detectPlatforms).mockResolvedValueOnce(cursorOnly).mockResolvedValueOnce(cursorOnly);
      let finish: (value: unknown) => void = () => {};
      vi.mocked(compile).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }) as never);
      setCurrentProjectDir("/repo/first");
      renderPage();
      await screen.findByText(/Directory found/i);
      const previewButton = screen.getByRole("button", { name: "Preview Changes" });
      await waitFor(() => expect(previewButton).toBeEnabled());
      fireEvent.click(previewButton);
      await waitFor(() => expect(compile).toHaveBeenCalledTimes(1));

      act(() => setCurrentProjectDir("/repo/second"));
      await waitFor(() => expect(mockSyncFileExists).toHaveBeenCalledWith("/repo/second", "."));
      await act(async () => {
        finish({
          harnessName: "default",
          targets: ["cursor"],
          files: [{ platform: "cursor", path: ".cursor/mcp.json", action: "create", content: "{}" }],
          warnings: [],
        });
      });

      expect(screen.queryByRole("button", { name: /^Apply/ })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: "Preview Changes" })).toBeEnabled());
    });
  });

  describe("project directory (AC-17)", () => {
    beforeEach(() => {
      mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"', path: "/home/user/.claude/harness.yaml" });
      mockSyncFileExists.mockResolvedValue(true);
    });

    it("has no directory control of its own, and points to the title bar's Project menu", async () => {
      renderPage();
      await screen.findByTestId("compile-project-dir");
      expect(screen.queryByPlaceholderText("~/repos/my-project")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /choose folder/i })).not.toBeInTheDocument();
      expect(screen.getByTestId("compile-project-dir")).toHaveTextContent(
        "No project chosen. Choose one from the Project menu in the title bar.",
      );
    });

    it("reads the project restored at launch, granting it before the bridge checks it", async () => {
      // Seeded as a previous session left it: nothing in this session has
      // granted the directory, so Compile must grant it itself.
      localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["/repo/restored"]));
      renderPage();

      await screen.findByText(/Directory found/i);
      expect(screen.getByTestId("compile-project-dir")).toHaveTextContent("/repo/restored");
      expect(mockGrantProjectScope).toHaveBeenCalledWith("/repo/restored");
      expect(mockSyncFileExists).toHaveBeenCalledWith("/repo/restored", ".");
      expect(mockGrantProjectScope.mock.invocationCallOrder[0]).toBeLessThan(
        mockSyncFileExists.mock.invocationCallOrder[0],
      );
    });

    it("rechecks when the title bar's project changes", async () => {
      setCurrentProjectDir("/repo/one");
      renderPage();
      await screen.findByText(/Directory found/i);

      act(() => setCurrentProjectDir("/repo/two"));
      await waitFor(() => expect(mockSyncFileExists).toHaveBeenCalledWith("/repo/two", "."));
      expect(screen.getByTestId("compile-project-dir")).toHaveTextContent("/repo/two");
    });
  });
});
