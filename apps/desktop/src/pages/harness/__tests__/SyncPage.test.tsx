import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SyncPage from "../SyncPage";

vi.mock("../../../contexts/ChatContext", () => ({
  useChat: () => ({ state: { status: "disconnected" } }),
  ChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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
});
