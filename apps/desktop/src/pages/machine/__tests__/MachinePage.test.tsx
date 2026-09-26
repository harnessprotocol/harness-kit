import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { buildMachineInventory } from "@harness-kit/core";
import MachinePage from "../MachinePage";
import { applyCellActionViaTauri } from "../cell-actions";
import { ToastProvider } from "../../../components/ToastProvider";
import { buildDriftScopes, collectDrift } from "../../drift/drift-data";
import { acknowledgeDriftItem } from "../../../lib/tauri";
import { setCurrentProjectDir } from "../../../lib/project-dir";

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

// MachinePage renders the Drift view (AC-18, AC-37), so this mock must also
// satisfy what Drift's module tree imports from core. `importOriginal` would
// be tidier, but core pulls node builtins the jsdom environment cannot
// resolve — the reason this mock is exhaustive in the first place.
// The definitions feed is not what this file tests. Mocking it here rather
// than adding its three core exports to the mock below keeps this test from
// breaking every time the resolver reaches for something new in core.
vi.mock("../../../lib/definitions.js", () => ({
  resolveDesktopDefinitions: vi.fn(async () => ({
    surfaces: [],
    source: "snapshot" as const,
    reason: "test",
  })),
}));

vi.mock("@harness-kit/core", async () => ({
  buildMachineInventory: vi.fn(),
  getSurface: vi.fn((id: string) => ({
    id,
    label: id,
    family: FAMILY_BY_ID[id],
    notApplicable: [],
    stores: [],
  })),
  // Pulled in by the Drift view's module tree (AC-37).
  COMPILE_SURFACE_IDS: [
    "claude-code",
    "cursor",
    "copilot-vscode",
    "codex",
    "opencode",
    "windsurf",
    "gemini",
    "junie",
  ],
  // TauriFsProvider (lib/harness-fs) pulls these from core
  posixJoin: vi.fn((...args: string[]) => args.join("/")),
  posixDirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
}));

const mockGrantProjectScope = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
  // DriftPage's acknowledgement round-trips. It calls getAcknowledgedDriftItems
  // synchronously while assembling its Promise.all, so a missing export here
  // is not a rejected promise it can catch — it throws the whole load into the
  // error state and the populated header never renders.
  getAcknowledgedDriftItems: vi.fn(async () => []),
  migrateDriftAcknowledgements: vi.fn(async () => 0),
  acknowledgeDriftItem: vi.fn(async () => undefined),
  unacknowledgeDriftItem: vi.fn(async () => undefined),
}));

// Drift's scans. The fixture has no harness.yaml, so the real collectDrift
// yields nothing and DriftView only ever shows its empty state; the filter
// test needs one entry to reach the populated header. driftItemKey stays real
// because DriftView keys its rows with it.
vi.mock("../../drift/drift-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../drift/drift-data")>()),
  buildDriftScopes: vi.fn(async () => []),
  collectDrift: vi.fn(),
}));

// The drawer's action strip. The selectors (presentSources, missingTargets,
// divergentTargets) stay real so the drawer offers the targets the fixture's
// gaps actually allow. Only the two that plan through core's engine and
// write through Tauri are replaced: they render an enabled Apply and report
// a successful apply so the page's onApplied wiring can be asserted.
vi.mock("../cell-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cell-actions")>()),
  buildCellAction: vi.fn(
    async (row: { key: string; kind: string; name: string }, from: string, to: string) => ({
      request: { kind: row.kind, name: row.name, from, to, scope: "user" },
      plan: { supported: true, noop: false, requiresConfirmation: false, changes: [] },
      cli: `harness-kit sync --from ${from} --to ${to} --only ${row.key.replace(":", "/")}`,
      prompt: `Install ${row.kind} ${row.name} on ${to}.`,
    }),
  ),
  applyCellActionViaTauri: vi.fn(async () => ({ written: [] })),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/home/user")),
  // DriftPage locates the legacy comparator.db before it scans; both calls
  // sit ahead of collectDrift in its load, so they must resolve for the
  // populated header to be reachable at all.
  appDataDir: vi.fn(() => Promise.resolve("/home/user/appdata")),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
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
      // Only claude-code and codex declare a marketplace store; everywhere
      // else an empty list means "not readable", not "none registered".
      marketplaces:
        id === "claude-code"
          ? [
              {
                id: "harness-kit",
                sourceType: "github",
                source: "harnessprotocol/harness-kit",
                scope: "user",
                provenance: {
                  file: "/home/user/.claude/plugins/known_marketplaces.json",
                  formatId: "json-claude-marketplaces",
                },
              },
              {
                id: "official",
                scope: "user",
                provenance: {
                  file: "/home/user/.claude/plugins/known_marketplaces.json",
                  formatId: "json-claude-marketplaces",
                },
              },
            ]
          : [],
      marketplacesReadable: id === "claude-code" || id === "codex",
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
        key: "plugin:board@harness-kit",
        kind: "plugin",
        name: "board@harness-kit",
        cells: makeCells({
          "claude-code": {
            status: "present",
            effectiveDigest: "sha256:b0a4d17e55",
            entries: [
              {
                scope: "user",
                digest: "sha256:b0a4d17e55",
                provenance: {
                  file: "/home/user/.claude/plugins/installed_plugins.json",
                  formatId: "json-claude-plugins",
                },
              },
            ],
          },
          codex: {
            status: "present",
            effectiveDigest: "sha256:b0a4d17e55",
            entries: [
              {
                scope: "user",
                digest: "sha256:b0a4d17e55",
                provenance: { file: "/home/user/.codex/config.toml", formatId: "toml-codex-plugins" },
              },
            ],
          },
          "claude-desktop": { status: "not-applicable", entries: [] },
          pi: { status: "not-applicable", entries: [] },
          cursor: { status: "unmanaged", entries: [] },
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

// A sidebar stand-in: navigates only when clicked, so the test controls
// whether the grid is already on screen when the request arrives.
function NavigateOnClick({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go to drift
    </button>
  );
}

/** Records every location it sees, so a test can count history entries. */
function LocationLog({ log }: { log: string[] }) {
  const location = useLocation();
  useEffect(() => {
    log.push(location.search);
  }, [location, log]);
  return null;
}

/** Renders the current search string so a test can assert on the URL. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function gridRowKeys(): string[] {
  // queryAll: a filter can leave the grid empty. The drawer's test id shares
  // the prefix, so it is excluded.
  return screen
    .queryAllByTestId(/^machine-row-(?!drawer$)/)
    .map((row) => row.getAttribute("data-testid")!.replace("machine-row-", ""));
}

function stripCell(label: string): HTMLElement {
  // Scoped to the strip: the view tabs have a "Resources" tab too.
  return within(screen.getByRole("group", { name: "Summary" })).getByText(label).parentElement!;
}

/** One drift item in the global scope, for claude-code unless `adapter` says otherwise. */
function driftEntry(cls: string, path: string, adapter = "claude-code") {
  return {
    scope: { kind: "global", root: "/home/user", label: "Global", fs: {} as never },
    item: {
      class: cls,
      path,
      adapter,
      target: adapter,
      harnessName: "test",
      slot: "operational",
      detail: `${path} drifted.`,
    } as never,
  } as never;
}

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
    // clearAllMocks does not drain a mockResolvedValueOnce queue; a leftover
    // from the rescan test would otherwise feed the next test's first scan.
    vi.mocked(buildMachineInventory).mockReset();
    vi.mocked(buildMachineInventory).mockResolvedValue(makeInventory() as never);
    mockGrantProjectScope.mockResolvedValue(undefined);
    vi.mocked(collectDrift).mockReset();
    vi.mocked(collectDrift).mockResolvedValue([]);
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

  it("opens the drawer on row click with verbatim delta paths and the three actions", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
    const drawer = await screen.findByTestId("machine-row-drawer");

    // Delta path rendered verbatim (display-only path contract)
    expect(within(drawer).getByText("env.PORT")).toBeInTheDocument();
    expect(within(drawer).getByText(/"5432" → "5433"/)).toBeInTheDocument();

    // All three action surfaces are present (AC-11); the M1 "arrives in M2"
    // affordance is gone.
    for (const label of ["Apply", "Copy CLI command", "Copy prompt"]) {
      expect(within(drawer).getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
    expect(drawer).not.toHaveTextContent("Sync arrives in M2");
  });

  it("badges a surface's registered plugin marketplaces, naming them in the title (AC-4)", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    const badge = screen.getByTestId("surface-marketplaces-claude-code");
    expect(badge).toHaveTextContent("2");
    expect(badge).toHaveAttribute("title", expect.stringContaining("harness-kit"));
    expect(badge).toHaveAttribute("title", expect.stringContaining("official"));
  });

  it("separates 'none registered' from 'cannot be read' (AC-2 semantics)", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    // codex CAN be read and registers none here: a badge reading 0.
    const codex = screen.getByTestId("surface-marketplaces-codex");
    expect(codex).toHaveTextContent("0");
    expect(codex).toHaveAttribute("title", "no plugin marketplaces registered");

    // cursor declares no marketplace store at all, so HarnessKit cannot say
    // — no badge, rather than a badge claiming zero.
    expect(screen.queryByTestId("surface-marketplaces-cursor")).not.toBeInTheDocument();
  });

  it("renders plugin rows in the grid under their own kind section (AC-4)", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    expect(screen.getByText("Plugins")).toBeInTheDocument();
    expect(screen.getByText("board@harness-kit")).toBeInTheDocument();
  });

  it("draws an 'unmanaged' cell distinctly from both absent and not-applicable", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    // cursor HAS a plugin concept but HarnessKit reads no store for it, so
    // the cell must not be the blank that means "could hold this, doesn't".
    const cell = screen.getByLabelText("unmanaged locally");
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveAttribute("title", expect.stringContaining("not managed locally"));
    expect(cell).toHaveAttribute("title", expect.stringContaining("not a gap"));
    // not-applicable keeps its own em-dash glyph.
    expect(cell).not.toHaveTextContent("—");
  });

  describe("Drift view (AC-18)", () => {
    function renderAt(url: string) {
      return render(
        <MemoryRouter initialEntries={[url]}>
          <MachinePage />
          <LocationProbe />
        </MemoryRouter>,
      );
    }

    function urlParams(): URLSearchParams {
      return new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
    }

    function viewToggle(): HTMLElement {
      return screen.getByRole("tablist", { name: "Machine view" });
    }

    function driftCell(value: string): HTMLElement {
      return within(screen.getByRole("group", { name: "Summary" })).getByRole("button", {
        name: `Drift vs harness.yaml ${value}`,
      });
    }

    it("does not scan for drift on a plain /machine load", async () => {
      // Not cosmetic. Drift asks Tauri to grant access to the project
      // directory when it scans; the grid runs machine-only by default and
      // must not trigger a permission request nobody asked for.
      renderAt("/machine");
      await screen.findByTestId("machine-grid");
      // Structural first: Drift never mounted. The mock assertions alone would
      // race Drift's async load, which is how an eager mount once looked green
      // locally and failed on a slower serial CI run.
      expect(screen.queryByTestId("machine-drift-view")).not.toBeInTheDocument();
      expect(screen.queryByTestId("drift-view")).not.toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(buildDriftScopes).not.toHaveBeenCalled();
      expect(collectDrift).not.toHaveBeenCalled();
      expect(mockGrantProjectScope).not.toHaveBeenCalled();
    });

    it("view=drift renders the Drift view only (no grid)", async () => {
      renderAt("/machine?view=drift");
      expect(await screen.findByTestId("drift-view")).toBeInTheDocument();
      // The strip lands with the inventory; only then is a missing grid meaningful.
      await screen.findByRole("group", { name: "Summary" });
      expect(screen.getByTestId("machine-drift-view")).toBeInTheDocument();
      expect(screen.queryByTestId("machine-grid")).not.toBeInTheDocument();
      expect(screen.queryByTestId("machine-grid-legend")).not.toBeInTheDocument();
      expect(screen.queryByTestId("skipped-toggle")).not.toBeInTheDocument();
      // Embedded: no second <h1>, no page container nested in the page.
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(document.querySelectorAll(".hk-page .hk-page")).toHaveLength(0);
      // No accordion left behind.
      expect(screen.queryByRole("button", { expanded: false })).not.toBeInTheDocument();
      expect(screen.queryByTestId("machine-drift-section")).not.toBeInTheDocument();
    });

    it("drift=1 still lands on the drift view, filtered by harness=", async () => {
      // Links and redirects from before the view existed, and Fleet's row
      // click via /drift?harness=<adapter>.
      vi.mocked(collectDrift).mockResolvedValue([driftEntry("missing", "CLAUDE.md")]);
      renderAt("/machine?drift=1&harness=claude-code");
      expect(await screen.findByText("Showing drift for Claude Code.")).toBeInTheDocument();
      await screen.findByRole("group", { name: "Summary" });
      expect(screen.queryByTestId("machine-grid")).not.toBeInTheDocument();
      expect(within(viewToggle()).getByRole("tab", { name: "Drift vs harness.yaml" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("switches to Drift when the URL changes without a remount", async () => {
      // The palette's Open Drift while already on Machine: React Router keeps
      // MachinePage mounted, so the view must follow the URL, not state
      // copied from it on mount.
      render(
        <MemoryRouter initialEntries={["/machine"]}>
          <NavigateOnClick to="/machine?view=drift" />
          <MachinePage />
        </MemoryRouter>,
      );
      await screen.findByTestId("machine-grid");
      fireEvent.click(screen.getByRole("button", { name: "go to drift" }));
      expect(await screen.findByTestId("drift-view")).toBeInTheDocument();
      expect(screen.queryByTestId("machine-grid")).not.toBeInTheDocument();
    });

    it("has an accessible view toggle that reflects and sets the view", async () => {
      renderAt("/machine?harness=cursor");
      await screen.findByTestId("machine-grid");
      const resources = within(viewToggle()).getByRole("tab", { name: "Resources" });
      const drift = within(viewToggle()).getByRole("tab", { name: "Drift vs harness.yaml" });
      expect(resources).toHaveAttribute("aria-selected", "true");
      expect(drift).toHaveAttribute("aria-selected", "false");

      fireEvent.click(drift);
      expect(await screen.findByTestId("drift-view")).toBeInTheDocument();
      expect(screen.queryByTestId("machine-grid")).not.toBeInTheDocument();
      expect(resources).toHaveAttribute("aria-selected", "false");
      expect(drift).toHaveAttribute("aria-selected", "true");
      expect(urlParams().get("view")).toBe("drift");
      expect(urlParams().get("harness")).toBe("cursor");

      fireEvent.click(resources);
      expect(await screen.findByTestId("machine-grid")).toBeInTheDocument();
      expect(screen.queryByTestId("drift-view")).not.toBeInTheDocument();
      expect(resources).toHaveAttribute("aria-selected", "true");
      expect(urlParams().has("view")).toBe(false);
      expect(urlParams().get("harness")).toBe("cursor");
    });

    it("shows — in the strip's Drift cell before any scan, and Drift's count after", async () => {
      vi.mocked(collectDrift).mockResolvedValue([
        driftEntry("missing", "CLAUDE.md"),
        driftEntry("missing", "AGENTS.md"),
      ]);
      renderAt("/machine");
      await screen.findByTestId("machine-grid");
      const before = driftCell("not scanned");
      expect(before).toHaveTextContent("—");
      expect(before).not.toHaveTextContent("…");
      expect(before).toHaveAttribute("aria-pressed", "false");

      // The cell is a way into Drift, and Drift's scan fills it in.
      fireEvent.click(before);
      await waitFor(() => expect(driftCell("2")).toBeInTheDocument());
      expect(driftCell("2")).toHaveAttribute("aria-pressed", "true");
      expect(driftCell("2").querySelector(".hk-summary-value")).toHaveAttribute("data-tone", "warning");
      expect(screen.queryByTestId("machine-grid")).not.toBeInTheDocument();

      // Back on the grid the count stays, without Drift scanning again.
      fireEvent.click(within(viewToggle()).getByRole("tab", { name: "Resources" }));
      await screen.findByTestId("machine-grid");
      expect(driftCell("2")).toHaveAttribute("aria-pressed", "false");
      expect(collectDrift).toHaveBeenCalledTimes(1);
    });

    it("keeps acknowledge working in the view, and the count drops with it (AC-37)", async () => {
      vi.mocked(collectDrift).mockResolvedValue([driftEntry("user-modified-outside", "CLAUDE.md")]);
      renderAt("/machine?view=drift");
      await waitFor(() => expect(driftCell("1")).toBeInTheDocument());

      fireEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));
      await waitFor(() => expect(driftCell("0")).toBeInTheDocument());
      expect(acknowledgeDriftItem).toHaveBeenCalledTimes(1);
      expect(driftCell("0").querySelector(".hk-summary-value")).toHaveAttribute("data-tone", "default");
    });

    it("choosing Gaps from the Drift view shows the grid filtered, in one URL update", async () => {
      const locations: string[] = [];
      render(
        <MemoryRouter initialEntries={["/machine?view=drift&filter=differs&harness=claude-code"]}>
          <MachinePage />
          <LocationLog log={locations} />
        </MemoryRouter>,
      );
      await screen.findByTestId("drift-view");
      const strip = await screen.findByRole("group", { name: "Summary" });
      // The grid's filter (differs, left in the URL) is not in force here, so
      // no filter cell reads as pressed and no status line claims a filter.
      expect(within(strip).getByRole("button", { name: /^Gaps/ })).toHaveAttribute("aria-pressed", "false");
      expect(within(strip).getByRole("button", { name: /^Differs/ })).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByTestId("machine-filter-status")).not.toBeInTheDocument();

      fireEvent.click(within(strip).getByRole("button", { name: /^Gaps/ }));
      await screen.findByTestId("machine-grid");
      expect(gridRowKeys()).toEqual(["mcp-server:postgres"]);
      expect(within(strip).getByRole("button", { name: /^Gaps/ })).toHaveAttribute("aria-pressed", "true");
      expect(locations).toHaveLength(2);
      const search = new URLSearchParams(locations[1]);
      expect(search.get("filter")).toBe("gaps");
      expect(search.has("view")).toBe(false);
      expect(search.get("harness")).toBe("claude-code");
    });

    it("closes the row drawer when switching to Drift", async () => {
      renderAt("/machine");
      await screen.findByTestId("machine-grid");
      fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
      expect(await screen.findByTestId("machine-row-drawer")).toBeInTheDocument();

      fireEvent.click(within(viewToggle()).getByRole("tab", { name: "Drift vs harness.yaml" }));
      await screen.findByTestId("drift-view");
      expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument();

      // Coming back does not reopen it.
      fireEvent.click(within(viewToggle()).getByRole("tab", { name: "Resources" }));
      await screen.findByTestId("machine-grid");
      expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument();
    });

    it("offers Drift when the machine scan fails", async () => {
      vi.mocked(buildMachineInventory).mockRejectedValue(new Error("boom"));
      renderAt("/machine?view=drift");
      expect(await screen.findByTestId("drift-view")).toBeInTheDocument();
      await screen.findByText(/Scan failed/);
      expect(within(viewToggle()).getByRole("tab", { name: "Drift vs harness.yaml" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("is a tab list whose panel is labelled by the selected tab, driven by arrow keys", async () => {
      renderAt("/machine");
      await screen.findByTestId("machine-grid");
      const resources = within(viewToggle()).getByRole("tab", { name: "Resources" });
      const drift = within(viewToggle()).getByRole("tab", { name: "Drift vs harness.yaml" });
      const panel = screen.getByRole("tabpanel", { name: "Resources" });
      expect(panel).toContainElement(screen.getByTestId("machine-grid"));
      for (const tab of [resources, drift]) expect(tab).toHaveAttribute("aria-controls", panel.id);
      // Roving tabindex: only the selected tab is in the Tab order.
      expect(resources).toHaveAttribute("tabindex", "0");
      expect(drift).toHaveAttribute("tabindex", "-1");

      resources.focus();
      fireEvent.keyDown(resources, { key: "ArrowRight" });
      expect(await screen.findByTestId("drift-view")).toBeInTheDocument();
      expect(drift).toHaveFocus();
      expect(drift).toHaveAttribute("aria-selected", "true");
      expect(drift).toHaveAttribute("tabindex", "0");
      expect(resources).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tabpanel", { name: "Drift vs harness.yaml" })).toContainElement(
        screen.getByTestId("drift-view"),
      );
      expect(urlParams().get("view")).toBe("drift");

      // Wraps at both ends.
      fireEvent.keyDown(drift, { key: "ArrowRight" });
      expect(await screen.findByTestId("machine-grid")).toBeInTheDocument();
      expect(resources).toHaveFocus();
      fireEvent.keyDown(resources, { key: "ArrowLeft" });
      expect(await screen.findByTestId("drift-view")).toBeInTheDocument();
      expect(drift).toHaveFocus();

      fireEvent.keyDown(drift, { key: "Home" });
      expect(await screen.findByTestId("machine-grid")).toBeInTheDocument();
      expect(resources).toHaveFocus();
      fireEvent.keyDown(resources, { key: "End" });
      expect(await screen.findByTestId("drift-view")).toBeInTheDocument();
      expect(drift).toHaveFocus();
    });

    it("adds no history entry when the selected tab is chosen again", async () => {
      const locations: string[] = [];
      render(
        <MemoryRouter initialEntries={["/machine?view=drift"]}>
          <MachinePage />
          <LocationLog log={locations} />
        </MemoryRouter>,
      );
      await screen.findByTestId("drift-view");
      await screen.findByRole("group", { name: "Summary" });
      const drift = within(viewToggle()).getByRole("tab", { name: "Drift vs harness.yaml" });
      fireEvent.click(drift);
      drift.focus();
      fireEvent.keyDown(drift, { key: "End" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(locations).toEqual(["?view=drift"]);
      expect(drift).toHaveFocus();
    });

    it("keeps focus on the tabs when the first scan lands and the strip appears above them", async () => {
      let resolve!: (value: unknown) => void;
      vi.mocked(buildMachineInventory).mockReturnValueOnce(
        new Promise((r) => { resolve = r; }) as never,
      );
      renderAt("/machine");
      expect(screen.getByText(/Scanning this machine/)).toBeInTheDocument();
      const resources = within(viewToggle()).getByRole("tab", { name: "Resources" });
      resources.focus();

      resolve(makeInventory());
      await screen.findByTestId("machine-grid");
      expect(screen.getByRole("group", { name: "Summary" })).toBeInTheDocument();
      expect(within(viewToggle()).getByRole("tab", { name: "Resources" })).toBe(resources);
      expect(resources).toHaveFocus();
    });

    it("counts the drift the list shows under harness=, and says whose it is", async () => {
      vi.mocked(collectDrift).mockResolvedValue([
        driftEntry("user-modified-outside", "CLAUDE.md"),
        driftEntry("user-modified-outside", "AGENTS.md"),
        driftEntry("user-modified-outside", ".cursor/rules/main.mdc", "cursor"),
      ]);
      render(
        <MemoryRouter initialEntries={["/machine?view=drift&harness=cursor"]}>
          <NavigateOnClick to="/machine?view=drift" />
          <MachinePage />
        </MemoryRouter>,
      );
      expect(await screen.findByText("Showing drift for Cursor.")).toBeInTheDocument();
      await waitFor(() => expect(driftCell("1 for Cursor")).toHaveTextContent("1"));
      expect(screen.getAllByRole("button", { name: "Acknowledge" })).toHaveLength(1);

      // Unfiltered, the same scan counts every harness: no rescan needed.
      fireEvent.click(screen.getByRole("button", { name: "go to drift" }));
      await waitFor(() => expect(driftCell("3")).toBeInTheDocument());
      expect(screen.getAllByRole("button", { name: "Acknowledge" })).toHaveLength(3);
      expect(collectDrift).toHaveBeenCalledTimes(1);
    });

    describe("bringing Drift on screen (AC-7)", () => {
      // AppLayout's scroll container keeps its offset across routes and
      // views, so a user scrolled down the grid would land below Drift. jsdom
      // lays nothing out: the view region's position is set by hand.
      let scrollIntoView: ReturnType<typeof vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>>;
      let regionTop: number;
      let rectSpy: { mockRestore: () => void };
      beforeEach(() => {
        scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        regionTop = -400; // scrolled past, above the viewport (768px tall in jsdom)
        rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
          this: Element,
        ) {
          const inRegion = (this as HTMLElement).dataset?.testid === "machine-view-region";
          const top = inRegion ? regionTop : 0;
          const height = inRegion ? 900 : 0;
          return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) };
        });
      });
      afterEach(() => {
        rectSpy.mockRestore();
        // jsdom has no scrollIntoView of its own, so deleting is the restore.
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      });

      function region(): HTMLElement {
        return screen.getByTestId("machine-view-region");
      }

      it("on arrival, once the first scan has put the strip above it, and only once", async () => {
        let resolve!: (value: unknown) => void;
        vi.mocked(buildMachineInventory).mockReturnValueOnce(
          new Promise((r) => { resolve = r; }) as never,
        );
        renderAt("/machine?drift=1&harness=cursor");
        await screen.findByTestId("drift-view");
        await new Promise((r) => setTimeout(r, 0));
        // The strip is still to arrive above the view and would push it down.
        expect(scrollIntoView).not.toHaveBeenCalled();

        resolve(makeInventory());
        await screen.findByRole("group", { name: "Summary" });
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
        expect(scrollIntoView.mock.contexts[0]).toBe(region());
        expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start" });

        // A Refresh is not a new request: the page stays where the user put it.
        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
      });

      it("on a switch from the grid, by the strip cell or a link, but not back to the grid", async () => {
        render(
          <MemoryRouter initialEntries={["/machine"]}>
            <NavigateOnClick to="/machine?view=drift" />
            <MachinePage />
          </MemoryRouter>,
        );
        await screen.findByTestId("machine-grid");
        expect(scrollIntoView).not.toHaveBeenCalled();

        fireEvent.click(driftCell("not scanned"));
        await screen.findByTestId("drift-view");
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
        expect(scrollIntoView.mock.contexts[0]).toBe(region());

        fireEvent.click(within(viewToggle()).getByRole("tab", { name: "Resources" }));
        await screen.findByTestId("machine-grid");
        expect(scrollIntoView).toHaveBeenCalledTimes(1);

        // The palette's Open Drift while already on Machine.
        fireEvent.click(screen.getByRole("button", { name: "go to drift" }));
        await screen.findByTestId("drift-view");
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      });

      it("again when harness= changes while Drift shows", async () => {
        // Fleet's row click while already on Drift: the view does not change,
        // only the harness, and that is still a new request.
        render(
          <MemoryRouter initialEntries={["/machine?view=drift"]}>
            <NavigateOnClick to="/machine?view=drift&harness=cursor" />
            <MachinePage />
          </MemoryRouter>,
        );
        await screen.findByRole("group", { name: "Summary" });
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole("button", { name: "go to drift" }));
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
        expect(scrollIntoView.mock.contexts[1]).toBe(region());
      });

      it("not when the top of the view is already on screen", async () => {
        regionTop = 200;
        render(
          <MemoryRouter initialEntries={["/machine"]}>
            <NavigateOnClick to="/machine?view=drift&harness=cursor" />
            <MachinePage />
          </MemoryRouter>,
        );
        await screen.findByTestId("machine-grid");
        fireEvent.click(driftCell("not scanned"));
        await screen.findByTestId("drift-view");
        fireEvent.click(screen.getByRole("button", { name: "go to drift" }));
        await new Promise((r) => setTimeout(r, 0));
        expect(scrollIntoView).not.toHaveBeenCalled();

        // Visible only in part (the tabs, not the start of Drift) counts as not visible.
        regionTop = 700;
        fireEvent.click(within(viewToggle()).getByRole("tab", { name: "Resources" }));
        await screen.findByTestId("machine-grid");
        fireEvent.click(within(viewToggle()).getByRole("tab", { name: "Drift vs harness.yaml" }));
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      });
    });
  });

  it("derives totals from the inventory rows/gaps/diffs, not resourceCount", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    // resourceCount is 99 on every surface — if totals used it, these fail.
    expect(stripCell("Resources")).toHaveTextContent("Resources3");
    expect(stripCell("Gaps")).toHaveTextContent("Gaps1");
    expect(stripCell("Differs")).toHaveTextContent("Differs1");
    expect(stripCell("Surfaces detected")).toHaveTextContent("4/11");
    expect(screen.queryByText("99")).not.toBeInTheDocument();
  });

  describe("summary strip filters (AC-14)", () => {
    // In this file's inventory, postgres is the only row with a gap chip
    // (codex) and the only row with a differs chip (cursor departs from
    // claude-code's baseline). board and reviewer have neither.
    it("counts rows with a gap chip and rows with a differs chip", async () => {
      // Two pairwise diffs on the same row: the strip still counts one row,
      // because the filter reveals rows, not pairs.
      const inventory = makeInventory();
      inventory.diffs.push({
        row: "mcp-server:postgres",
        surfaces: ["cursor", "claude-code"],
        delta: [{ path: "env.HOST", kind: "changed", left: "a", right: "b" }],
      });
      vi.mocked(buildMachineInventory).mockResolvedValue(inventory as never);
      renderPage();
      await screen.findByTestId("machine-grid");
      expect(stripCell("Gaps")).toHaveTextContent("Gaps1");
      expect(stripCell("Differs")).toHaveTextContent("Differs1");
      // The accessible name separates label and count.
      expect(screen.getByRole("button", { name: "Gaps 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Differs 1" })).toBeInTheDocument();
      expect(screen.queryByText("Diffs")).not.toBeInTheDocument();
    });

    it("filters the grid to the rows with a gap chip, and toggles back", async () => {
      renderPage();
      await screen.findByTestId("machine-grid");
      expect(gridRowKeys()).toHaveLength(3);
      const gaps = screen.getByRole("button", { name: /Gaps/ });
      expect(gaps).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(gaps);
      await waitFor(() => expect(gridRowKeys()).toEqual(["mcp-server:postgres"]));
      expect(screen.getByRole("button", { name: /Gaps/ })).toHaveAttribute("aria-pressed", "true");
      for (const key of gridRowKeys()) {
        expect(
          within(screen.getByTestId(`machine-row-${key}`)).queryAllByText("+ copy").length,
        ).toBeGreaterThan(0);
      }
      expect(screen.getByTestId("machine-filter-status")).toHaveTextContent(
        "Showing 1 of 3 resources with a closable gap",
      );

      fireEvent.click(screen.getByRole("button", { name: /Gaps/ }));
      await waitFor(() => expect(gridRowKeys()).toHaveLength(3));
      expect(screen.getByRole("button", { name: /Gaps/ })).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByTestId("machine-filter-status")).not.toBeInTheDocument();
    });

    it("filters to differing rows, and Show all restores every row", async () => {
      renderPage();
      await screen.findByTestId("machine-grid");
      fireEvent.click(screen.getByRole("button", { name: /Differs/ }));
      await waitFor(() => expect(gridRowKeys()).toEqual(["mcp-server:postgres"]));
      for (const key of gridRowKeys()) {
        expect(
          within(screen.getByTestId(`machine-row-${key}`)).queryAllByText("differs").length,
        ).toBeGreaterThan(0);
      }
      expect(screen.getByTestId("machine-filter-status")).toHaveTextContent(
        "Showing 1 of 3 resources whose content differs",
      );
      const showAll = screen.getByRole("button", { name: "Show all" });
      showAll.focus();
      fireEvent.click(showAll);
      await waitFor(() => expect(gridRowKeys()).toHaveLength(3));
      const differs = screen.getByRole("button", { name: /Differs/ });
      expect(differs).toHaveAttribute("aria-pressed", "false");
      // Show all unmounts itself; focus lands on the cell it un-pressed.
      expect(differs).toHaveFocus();
    });

    it("reads the filter from the URL and keeps other params when toggling", async () => {
      render(
        <MemoryRouter initialEntries={["/machine?harness=claude-code&filter=gaps"]}>
          <MachinePage />
          <LocationProbe />
        </MemoryRouter>,
      );
      await screen.findByTestId("machine-grid");
      expect(gridRowKeys()).toEqual(["mcp-server:postgres"]);
      expect(screen.getByRole("button", { name: /Gaps/ })).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(screen.getByRole("button", { name: /Gaps/ }));
      await waitFor(() => expect(gridRowKeys()).toHaveLength(3));
      let search = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
      expect(search.get("harness")).toBe("claude-code");
      expect(search.has("filter")).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: /Differs/ }));
      await waitFor(() => {
        search = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
        expect(search.get("filter")).toBe("differs");
      });
      expect(search.get("harness")).toBe("claude-code");
    });

    it("closes the drawer when its row is filtered out", async () => {
      renderPage();
      await screen.findByTestId("machine-grid");
      fireEvent.click(screen.getByTestId("machine-row-skill:reviewer"));
      expect(await screen.findByTestId("machine-row-drawer")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Gaps/ }));
      await waitFor(() => expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument());
    });

    it("keeps the drawer open when its row survives the filter", async () => {
      renderPage();
      await screen.findByTestId("machine-grid");
      fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
      expect(await screen.findByTestId("machine-row-drawer")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Gaps/ }));
      await waitFor(() => expect(gridRowKeys()).toEqual(["mcp-server:postgres"]));
      expect(screen.getByTestId("machine-row-drawer")).toBeInTheDocument();
    });

    it("keeps a URL filter with no matches as a pressed cell that clears it", async () => {
      const inventory = makeInventory();
      inventory.gaps = [];
      vi.mocked(buildMachineInventory).mockResolvedValue(inventory as never);
      render(
        <MemoryRouter initialEntries={["/machine?filter=gaps"]}>
          <MachinePage />
        </MemoryRouter>,
      );
      await screen.findByTestId("machine-grid");
      expect(gridRowKeys()).toEqual([]);
      expect(screen.getByTestId("machine-filter-status")).toHaveTextContent(
        "Showing 0 of 3 resources with a closable gap",
      );
      const gaps = screen.getByRole("button", { name: "Gaps 0" });
      expect(gaps).toHaveAttribute("aria-pressed", "true");
      gaps.focus();
      fireEvent.click(gaps);
      await waitFor(() => expect(gridRowKeys()).toHaveLength(3));
      expect(screen.queryByRole("button", { name: /Gaps/ })).not.toBeInTheDocument();
      // The pressed cell became plain text; focus falls back to the strip.
      expect(screen.getByRole("group", { name: "Summary" })).toHaveFocus();
    });

    it("renders a zero-count cell as plain text, not a button", async () => {
      const inventory = makeInventory();
      inventory.gaps = [];
      vi.mocked(buildMachineInventory).mockResolvedValue(inventory as never);
      renderPage();
      await screen.findByTestId("machine-grid");
      expect(stripCell("Gaps")).toHaveTextContent("Gaps0");
      expect(screen.queryByRole("button", { name: /Gaps/ })).not.toBeInTheDocument();
      expect(stripCell("Gaps").tagName).toBe("DIV");
      // Resources and Surfaces detected are never filters. (The view tabs'
      // "Resources" tab sits outside the strip.)
      const strip = screen.getByRole("group", { name: "Summary" });
      expect(within(strip).queryByRole("button", { name: /Resources/ })).not.toBeInTheDocument();
      expect(within(strip).queryByRole("button", { name: /Surfaces detected/ })).not.toBeInTheDocument();
    });
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

  describe("project directory from the title bar (AC-17)", () => {
    function projectRoots(): Array<string | null> {
      return vi
        .mocked(buildMachineInventory)
        .mock.calls.map((call) => (call[1] as { projectRoot: string | null }).projectRoot);
    }

    it("has no project-directory field of its own", async () => {
      renderPage();
      await screen.findByTestId("machine-grid");
      expect(screen.queryByPlaceholderText(/Project directory/)).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Browse/ })).not.toBeInTheDocument();
    });

    it("rescans with the new projectRoot and nothing selected when the project changes", async () => {
      renderPage();
      await screen.findByTestId("machine-grid");
      fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
      await screen.findByTestId("machine-row-drawer");

      act(() => setCurrentProjectDir("/repo/app"));
      await waitFor(() => expect(projectRoots()).toEqual([null, "/repo/app"]));
      expect(mockGrantProjectScope).toHaveBeenCalledWith("/repo/app");
      await waitFor(() => expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument());

      // Clear in the title bar goes back to machine-only.
      act(() => setCurrentProjectDir(null));
      await waitFor(() => expect(projectRoots()).toEqual([null, "/repo/app", null]));
    });

    it("scans the project restored from the last session, and Refresh keeps it", async () => {
      localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["/repo/last", "/repo/older"]));
      renderPage();
      await screen.findByTestId("machine-grid");
      expect(projectRoots()).toEqual(["/repo/last"]);

      await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() => expect(projectRoots()).toEqual(["/repo/last", "/repo/last"]));
    });
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

  it("shows a machine-only notice when the project scope grant fails", async () => {
    mockGrantProjectScope.mockRejectedValue(new Error("forbidden"));
    renderPage();
    await screen.findByTestId("machine-grid");
    expect(screen.queryByTestId("project-degraded-notice")).not.toBeInTheDocument();

    act(() => setCurrentProjectDir("/repo/gone"));

    await screen.findByTestId("project-degraded-notice");
    expect(
      screen.getByText("Project directory could not be scanned — showing machine-only results."),
    ).toBeInTheDocument();
    // The scan proceeded machine-only: projectRoot dropped to null.
    const opts = vi.mocked(buildMachineInventory).mock.calls.at(-1)?.[1] as { projectRoot: string | null };
    expect(opts.projectRoot).toBeNull();
  });

  it("supports keyboard activation of rows and Escape to close the drawer", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    const row = screen.getByTestId("machine-row-skill:reviewer");
    expect(row).toHaveAttribute("role", "button");
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row, { key: "Enter" });
    const drawer = await screen.findByTestId("machine-row-drawer");
    expect(within(drawer).getByText("reviewer")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument(),
    );
  });

  it("waits for the scan and shows the loading state first", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(buildMachineInventory).mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    renderPage();
    expect(screen.getByText(/Scanning this machine/)).toBeInTheDocument();
    resolve(makeInventory());
    await waitFor(() => expect(screen.getByTestId("machine-grid")).toBeInTheDocument());
  });

  it("rescans after a successful apply so the grid reflects the write", async () => {
    // AC-16. Without this the cell still read "absent" after a write until
    // the user clicked Refresh.
    //
    // mcp-server:postgres is the fixture's only engine gap (missingOn codex),
    // so the real missingTargets offers codex as the default target. The
    // second scan is the same fixture with that one cell written.
    const before = makeInventory();
    const after = makeInventory();
    const postgres = after.rows.find((row) => row.key === "mcp-server:postgres")!;
    postgres.cells.codex = {
      status: "present",
      effectiveDigest: "sha256:abc1234567",
      entries: [
        {
          scope: "user",
          digest: "sha256:abc1234567",
          provenance: { file: "/home/user/.codex/config.toml", formatId: "toml-codex-mcp" },
        },
      ],
    };
    after.gaps = [];
    vi.mocked(buildMachineInventory)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);

    renderPage();
    await screen.findByTestId("machine-grid");
    expect(vi.mocked(buildMachineInventory)).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cell-mcp-server:postgres-codex")).toHaveAttribute(
      "data-status",
      "absent",
    );

    fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
    const drawer = await screen.findByTestId("machine-row-drawer");
    const apply = within(drawer).getByRole("button", { name: "Apply" });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);

    await waitFor(() => expect(vi.mocked(buildMachineInventory)).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("cell-mcp-server:postgres-codex")).toHaveAttribute(
        "data-status",
        "present",
      ),
    );
  });

  it("keeps the row selected after an apply rescans", async () => {
    const after = makeInventory();
    after.gaps = [];
    vi.mocked(buildMachineInventory)
      .mockResolvedValueOnce(makeInventory() as never)
      .mockResolvedValueOnce(after as never);

    renderPage();
    await screen.findByTestId("machine-grid");
    fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
    const drawer = await screen.findByTestId("machine-row-drawer");
    const apply = within(drawer).getByRole("button", { name: "Apply" });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);

    await waitFor(() => expect(vi.mocked(buildMachineInventory)).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
    // Still open, on the same row, now showing the rescanned row: with the
    // gap gone the drawer offers only the diff target.
    expect(screen.getByTestId("machine-row-drawer")).toHaveAttribute("aria-label", "postgres details");
    await waitFor(() =>
      expect(
        Array.from((screen.getByLabelText("To") as HTMLSelectElement).options).map(
          (option) => option.value,
        ),
      ).toEqual(["cursor"]),
    );
  });

  describe("apply toast (AC-16)", () => {
    function renderWithToasts() {
      return render(
        <ToastProvider>
          <MemoryRouter>
            <MachinePage />
          </MemoryRouter>
        </ToastProvider>,
      );
    }

    async function applyPostgres() {
      renderWithToasts();
      await screen.findByTestId("machine-grid");
      fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
      const drawer = await screen.findByTestId("machine-row-drawer");
      const apply = within(drawer).getByRole("button", { name: "Apply" });
      await waitFor(() => expect(apply).toBeEnabled());
      fireEvent.click(apply);
    }

    it("names the resource and the target surface", async () => {
      await applyPostgres();
      const toast = await screen.findByText("Copied postgres to Codex");
      expect(toast.closest(".hk-toast")).toHaveAttribute("data-variant", "success");
    });

    it("warns, and keeps the reason, when the rollback point was not recorded", async () => {
      vi.mocked(applyCellActionViaTauri).mockResolvedValueOnce({
        written: [],
        ledgerError: "state db locked",
      });
      await applyPostgres();
      const toast = (await screen.findByText("Copied postgres to Codex")).closest(".hk-toast");
      expect(toast).toHaveAttribute("data-variant", "warning");
      expect(toast).toHaveTextContent("Not added to the rollback list (state db locked)");
    });
  });

  it("does not reopen a drawer closed while the apply's rescan ran", async () => {
    let resolveRescan!: (value: unknown) => void;
    vi.mocked(buildMachineInventory)
      .mockResolvedValueOnce(makeInventory() as never)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveRescan = resolve)) as never);

    renderPage();
    await screen.findByTestId("machine-grid");
    fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
    const drawer = await screen.findByTestId("machine-row-drawer");
    const apply = within(drawer).getByRole("button", { name: "Apply" });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);
    await waitFor(() => expect(vi.mocked(buildMachineInventory)).toHaveBeenCalledTimes(2));

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument());
    resolveRescan(makeInventory());
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
    expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument();
  });

  it("ignores an older scan that resolves after a newer one", async () => {
    // The apply's rescan hangs; meanwhile the user starts a fresh scan
    // (choosing a project in the title bar), which clears the selection and lands.
    let resolveStale!: (value: unknown) => void;
    const newer = makeInventory();
    newer.rows = newer.rows.filter((row) => row.key !== "skill:reviewer");
    vi.mocked(buildMachineInventory)
      .mockResolvedValueOnce(makeInventory() as never)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveStale = resolve)) as never)
      .mockResolvedValueOnce(newer as never);

    renderPage();
    await screen.findByTestId("machine-grid");
    fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
    const drawer = await screen.findByTestId("machine-row-drawer");
    const apply = within(drawer).getByRole("button", { name: "Apply" });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);
    await waitFor(() => expect(vi.mocked(buildMachineInventory)).toHaveBeenCalledTimes(2));

    act(() => setCurrentProjectDir("/repo"));
    await waitFor(() => expect(vi.mocked(buildMachineInventory)).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(gridRowKeys()).not.toContain("skill:reviewer"));
    expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument();

    // The stale apply rescan lands last: it must not repopulate the grid or
    // reopen the drawer on postgres.
    resolveStale(makeInventory());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gridRowKeys()).not.toContain("skill:reviewer");
    expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  it("closes the drawer after an apply when the rescan no longer has the row", async () => {
    const after = makeInventory();
    after.rows = after.rows.filter((row) => row.key !== "mcp-server:postgres");
    after.gaps = [];
    after.diffs = [];
    vi.mocked(buildMachineInventory)
      .mockResolvedValueOnce(makeInventory() as never)
      .mockResolvedValueOnce(after as never);

    renderPage();
    await screen.findByTestId("machine-grid");
    fireEvent.click(screen.getByTestId("machine-row-mcp-server:postgres"));
    const drawer = await screen.findByTestId("machine-row-drawer");
    const apply = within(drawer).getByRole("button", { name: "Apply" });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);

    await waitFor(() => expect(vi.mocked(buildMachineInventory)).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument());
  });

  it("reserves the drawer's width on the page while a row is selected (AC-19)", async () => {
    const { container } = renderPage();
    await screen.findByTestId("machine-grid");
    const page = container.querySelector(".hk-page")!;
    expect(page).not.toHaveAttribute("data-drawer-open");

    fireEvent.click(screen.getByTestId("machine-row-skill:reviewer"));
    await screen.findByTestId("machine-row-drawer");
    expect(page).toHaveAttribute("data-drawer-open");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(page).not.toHaveAttribute("data-drawer-open"));
  });
});
