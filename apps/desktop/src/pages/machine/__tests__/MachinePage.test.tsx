import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { buildMachineInventory } from "@harness-kit/core";
import MachinePage from "../MachinePage";

// ── Mocks ──────────────────────────────────────────────────────

const SURFACE_IDS = [
  "claude-code",
  "claude-desktop",
  "copilot-vscode",
  "copilot-cli",
  "codex",
  "cursor",
  "pi",
  "opencode",
  "windsurf",
  "gemini",
  "junie",
] as const;

const FAMILY_BY_ID: Record<string, string> = {
  "claude-code": "claude",
  "claude-desktop": "claude",
  "copilot-vscode": "copilot",
  "copilot-cli": "copilot",
  codex: "codex",
  cursor: "cursor",
  pi: "pi",
  opencode: "opencode",
  windsurf: "windsurf",
  gemini: "gemini",
  junie: "junie",
};

vi.mock("@harness-kit/core", () => ({
  buildMachineInventory: vi.fn(),
  getSurface: vi.fn((id: string) => ({
    id,
    label: id,
    family: FAMILY_BY_ID[id],
    notApplicable: [],
    stores: [],
  })),
  // TauriFsProvider (lib/harness-fs) pulls these from core
  posixJoin: vi.fn((...args: string[]) => args.join("/")),
  posixDirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
}));

const mockGrantProjectScope = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/home/user")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(() => Promise.resolve(false)),
  mkdir: vi.fn(),
  readDir: vi.fn(() => Promise.resolve([])),
  lstat: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

// ── Fixture ────────────────────────────────────────────────────

type Cell = { status: string; entries: unknown[]; effectiveDigest?: string };

function makeCells(overrides: Record<string, Cell> = {}): Record<string, Cell> {
  const cells: Record<string, Cell> = {};
  for (const id of SURFACE_IDS) {
    cells[id] = overrides[id] ?? { status: "absent", entries: [] };
  }
  return cells;
}

const DETECTED = new Set(["claude-code", "copilot-vscode", "cursor", "codex"]);

function makeInventory() {
  return {
    surfaces: SURFACE_IDS.map((id) => ({
      id,
      detected: DETECTED.has(id),
      // Deliberately bogus: totals must derive from rows/gaps/diffs, never
      // from resourceCount (raw entry count, duplicates included).
      resourceCount: 99,
      skipped:
        id === "codex"
          ? [
              { file: "/home/user/.codex/config.toml", reason: "parse error: bad TOML" },
              { file: "/home/user/.agents/skills/x", reason: "unreadable" },
            ]
          : [],
    })),
    rows: [
      {
        key: "mcp-server:postgres",
        kind: "mcp-server",
        name: "postgres",
        cells: makeCells({
          "claude-code": {
            status: "present",
            effectiveDigest: "sha256:abc1234567",
            entries: [
              {
                scope: "user",
                digest: "sha256:abc1234567",
                provenance: { file: "/home/user/.claude.json", formatId: "json-mcpservers" },
              },
            ],
          },
          cursor: {
            status: "present",
            effectiveDigest: "sha256:def7654321",
            entries: [
              {
                scope: "project",
                digest: "sha256:def7654321",
                provenance: { file: "/repo/.cursor/mcp.json", formatId: "json-mcpservers" },
              },
            ],
          },
          "copilot-vscode": { status: "unknown", entries: [] },
          pi: { status: "not-applicable", entries: [] },
        }),
      },
      {
        key: "skill:reviewer",
        kind: "skill",
        name: "reviewer",
        cells: makeCells({
          "claude-code": {
            status: "present",
            effectiveDigest: "sha256:beefbeef01",
            entries: [
              {
                scope: "user",
                digest: "sha256:beefbeef01",
                provenance: { file: "/home/user/.claude/skills/reviewer/SKILL.md", formatId: "skills-dir" },
              },
            ],
          },
        }),
      },
    ],
    gaps: [{ row: "mcp-server:postgres", presentOn: ["claude-code", "cursor"], missingOn: ["codex"] }],
    diffs: [
      {
        row: "mcp-server:postgres",
        surfaces: ["claude-code", "cursor"],
        delta: [{ path: "env.PORT", kind: "changed", left: "5432", right: "5433" }],
      },
    ],
  };
}

// ── Helpers ────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <MachinePage />
    </MemoryRouter>,
  );
}

// ── Tests ──────────────────────────────────────────────────────

describe("MachinePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildMachineInventory).mockResolvedValue(makeInventory() as never);
    mockGrantProjectScope.mockResolvedValue(undefined);
  });

  it("renders all 11 surface columns grouped by family, undetected dimmed and annotated", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    for (const id of SURFACE_IDS) {
      const col = screen.getByTestId(`surface-col-${id}`);
      expect(col).toHaveAttribute("data-detected", DETECTED.has(id) ? "true" : "false");
      if (!DETECTED.has(id)) {
        expect(within(col).getByText("not installed")).toBeInTheDocument();
      }
    }
    // Family group headers (one per contiguous family in registry order)
    for (const family of ["claude", "copilot", "codex", "cursor", "pi", "opencode", "windsurf", "gemini", "junie"]) {
      const group = screen.getByTestId(`family-group-${family}`);
      expect(group).toHaveTextContent(family);
    }
    // claude and copilot each span two surfaces
    expect(screen.getByTestId("family-group-claude")).toHaveAttribute("colspan", "2");
    expect(screen.getByTestId("family-group-copilot")).toHaveAttribute("colspan", "2");
  });

  it("renders NA cells as em-dash with tooltip and unknown cells as ? badge", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    const naCell = screen.getByTestId("cell-mcp-server:postgres-pi");
    expect(naCell).toHaveAttribute("data-status", "not-applicable");
    const dash = within(naCell).getByText("—");
    expect(dash).toHaveAttribute("title", expect.stringContaining("No concept of MCP servers"));

    const unknownCell = screen.getByTestId("cell-mcp-server:postgres-copilot-vscode");
    expect(unknownCell).toHaveAttribute("data-status", "unknown");
    const badge = within(unknownCell).getByText("?");
    expect(badge).toHaveAttribute("title", expect.stringContaining("Needs confirmation"));
  });

  it("opens the drawer on row click with verbatim delta paths and disabled M2 actions", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
    const drawer = await screen.findByTestId("machine-row-drawer");

    // Delta path rendered verbatim (display-only path contract)
    expect(within(drawer).getByText("env.PORT")).toBeInTheDocument();
    expect(within(drawer).getByText(/"5432" → "5433"/)).toBeInTheDocument();

    for (const label of ["Apply", "Copy CLI command", "Copy prompt"]) {
      const button = within(drawer).getByRole("button", { name: label });
      expect(button).toBeDisabled();
      expect(button.closest("span")).toHaveAttribute("title", "Sync arrives in M2");
    }
  });

  it("derives totals from the inventory rows/gaps/diffs, not resourceCount", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    // resourceCount is 99 on every surface — if totals used it, these fail.
    expect(screen.getByText("Resources").parentElement).toHaveTextContent("Resources2");
    expect(screen.getByText("Gaps").parentElement).toHaveTextContent("Gaps1");
    expect(screen.getByText("Diffs").parentElement).toHaveTextContent("Diffs1");
    expect(screen.getByText("Surfaces detected").parentElement).toHaveTextContent("4/11");
    expect(screen.queryByText("99")).not.toBeInTheDocument();
  });

  it("runs machine-only (projectRoot null) by default without error", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    expect(buildMachineInventory).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(buildMachineInventory).mock.calls[0][1] as {
      projectRoot: string | null;
      homeRoot: string;
      platform: string;
    };
    expect(opts.projectRoot).toBeNull();
    expect(opts.homeRoot).toBe("/home/user");
    expect(["darwin", "win32", "linux"]).toContain(opts.platform);
    // No project dir → no scope grant attempted
    expect(mockGrantProjectScope).not.toHaveBeenCalled();
    // User-scope data renders
    expect(screen.getByText("postgres")).toBeInTheDocument();
    expect(screen.queryByText(/Scan failed/)).not.toBeInTheDocument();
  });

  it("renders skipped diagnostics with a count and expands on toggle", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    const toggle = screen.getByTestId("skipped-toggle");
    expect(toggle).toHaveTextContent("Skipped diagnostics");
    expect(toggle).toHaveTextContent("2");
    // Column-header badge on the codex column
    expect(within(screen.getByTestId("surface-col-codex")).getByText("2")).toBeInTheDocument();

    expect(screen.queryByTestId("skipped-list")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    const list = screen.getByTestId("skipped-list");
    expect(within(list).getByText(/parse error: bad TOML/)).toBeInTheDocument();
    expect(within(list).getByText("/home/user/.codex/config.toml")).toBeInTheDocument();
  });

  it("waits for the scan and shows the loading state first", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(buildMachineInventory).mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    renderPage();
    expect(screen.getByText(/Scanning this machine/)).toBeInTheDocument();
    resolve(makeInventory());
    await waitFor(() => expect(screen.getByTestId("machine-grid")).toBeInTheDocument());
  });
});
