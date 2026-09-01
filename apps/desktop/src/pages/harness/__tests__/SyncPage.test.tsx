import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { compile, detectPlatforms } from "@harness-kit/core";
import SyncPage from "../SyncPage";

// ── Mocks ──────────────────────────────────────────────────────

const mockReadHarnessFile = vi.fn();
const mockScanClaudeConfig = vi.fn();
const mockSyncFileExists = vi.fn();
const mockSyncListBackups = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  readHarnessFile: () => mockReadHarnessFile(),
  scanClaudeConfig: () => mockScanClaudeConfig(),
  syncFileExists: (...args: unknown[]) => mockSyncFileExists(...args),
  syncListBackups: (...args: unknown[]) => mockSyncListBackups(...args),
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

// Tauri dialog used by openDirectoryPicker (dynamic import — mock the module)
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
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
      expect(screen.getByText(/Sync/i)).toBeInTheDocument();
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

    renderPage();

    const dirInput = await screen.findByPlaceholderText("~/repos/my-project");
    fireEvent.change(dirInput, { target: { value: "/repo/with-pi" } });

    // Debounced (300ms) validation + detection
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
});
