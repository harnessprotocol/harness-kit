import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  SyncFsProvider: vi.fn().mockImplementation(() => ({})),
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

const REAL_SCAN = {
  mcpServersJson: JSON.stringify({ mcpServers: { tauri: {}, grafana: {} } }),
  settingsJson: JSON.stringify({ permissions: { allow: Array(16).fill("Bash") } }),
  mcpSource: "~/.claude/mcp.json",
  settingsSource: "~/.claude/settings.local.json",
};

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
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  it("does not fall back to template when scan returns real data", async () => {
    mockScanClaudeConfig.mockResolvedValue(REAL_SCAN);
    const { generateHarnessYaml } = await import("../../../lib/harness-generator");

    renderPage();

    // Wait for loading to complete so the Generate button is visible
    await waitFor(() => {
      expect(screen.queryByText(/Generate from Claude Code setup/i)).not.toBeNull();
    });

    fireEvent.click(screen.getByText(/Generate from Claude Code setup/i));

    await waitFor(() => {
      expect(generateHarnessYaml).toHaveBeenCalledWith(
        expect.objectContaining({ mcpServersJson: expect.stringContaining("mcpServers") }),
      );
    });
  });

  it("shows error message when scanClaudeConfig throws", async () => {
    mockScanClaudeConfig.mockRejectedValue(new Error("command not found"));

    renderPage();

    // Wait for loading to complete so the Generate button is visible
    await waitFor(() => {
      expect(screen.queryByText(/Generate from Claude Code setup/i)).not.toBeNull();
    });

    fireEvent.click(screen.getByText(/Generate from Claude Code setup/i));

    await waitFor(() => {
      expect(screen.queryByText(/command not found/i)).not.toBeNull();
    });
  });
});
