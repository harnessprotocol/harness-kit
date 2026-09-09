import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { buildMachineInventory } from "@harness-kit/core";
import MachinePage from "../MachinePage";
import { collectDrift } from "../../drift/drift-data";

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

// MachinePage now renders the Drift section (AC-37), so this mock must also
// satisfy what Drift's module tree imports from core. `importOriginal` would
// be tidier, but core pulls node builtins the jsdom environment cannot
// resolve — the reason this mock is exhaustive in the first place.
vi.mock("@harness-kit/core", async () => ({
  buildMachineInventory: vi.fn(),
  getSurface: vi.fn((id: string) => ({
    id,
    label: id,
    family: FAMILY_BY_ID[id],
    notApplicable: [],
    stores: [],
  })),
  // Pulled in by the Drift section's module tree (AC-37).
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

/** Pushes a route change after mount, without remounting the page. */
function NavigateTo({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
}

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

  it("presents Drift inside the Machine view (AC-37)", async () => {
    // The M2 attempt at this routed /drift here and deleted the acknowledge
    // and fix workflow, so it was reverted. Absorption means the workflow
    // moves, not that it disappears — Drift compares harness.yaml against
    // compiled output, which the surface grid never did.
    renderPage();
    await screen.findByTestId("machine-grid");

    expect(screen.getByTestId("machine-drift-section")).toBeInTheDocument();
    expect(screen.getByText("Drift from harness.yaml")).toBeInTheDocument();
  });

  it("does not run Drift's scans until the section is opened", async () => {
    // Not cosmetic. Drift asks Tauri to grant access to the project directory
    // on mount; the Machine view runs machine-only by default and must not
    // trigger a permission request nobody asked for. Mounting Drift eagerly
    // made this fire on every Machine load — caught only because a serial CI
    // run was slow enough for the async grant to land before the assertion.
    renderPage();
    await screen.findByTestId("machine-grid");

    // Structural, not timing-based: Drift's own heading is absent because the
    // component never mounted. Asserting "grantProjectScope was not called"
    // alone races the grant's own promise — which is exactly why the eager
    // version looked green locally and failed on a slower serial run.
    const toggle = screen.getByRole("button", { name: /Drift from harness.yaml/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("drift-view")).not.toBeInTheDocument();
    expect(mockGrantProjectScope).not.toHaveBeenCalled();
  });

  it("opens the section on ?drift=1, cold AND on navigation", async () => {
    // The sidebar and cmd-4 point at /machine?drift=1. React Router does not
    // remount MachinePage when only the search string changes, so reading the
    // param in a useState initializer worked on a cold load and did nothing on
    // the common path — arriving from anywhere the user had already seen
    // Machine. Both are asserted here.
    const { unmount } = render(
      <MemoryRouter initialEntries={["/machine?drift=1"]}>
        <MachinePage />
      </MemoryRouter>,
    );
    await screen.findByTestId("machine-grid");
    expect(
      screen.getByRole("button", { name: /Drift from harness.yaml/ }),
    ).toHaveAttribute("aria-expanded", "true");
    unmount();

    // Navigating within an already-mounted Machine route.
    render(
      <MemoryRouter initialEntries={["/machine", "/machine?drift=1"]} initialIndex={0}>
        <NavigateTo to="/machine?drift=1" />
        <MachinePage />
      </MemoryRouter>,
    );
    await screen.findByTestId("machine-grid");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Drift from harness.yaml/ }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
  });

  describe("Drift scroll", () => {
    let scrollIntoView: ReturnType<typeof vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>>;
    beforeEach(() => {
      scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(() => {
      // jsdom has no scrollIntoView of its own, so deleting is the restore.
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    });

    it("scrolls the Drift section into view once the scan above it has rendered", async () => {
      // The section sits below the summary strip and the grid. Scrolling on
      // first commit, while the page still reads "Scanning this machine…",
      // lands on a layout the grid then pushes below the fold.
      let resolve!: (value: unknown) => void;
      vi.mocked(buildMachineInventory).mockReturnValueOnce(
        new Promise((r) => { resolve = r; }) as never,
      );
      render(
        <MemoryRouter initialEntries={["/machine?drift=1"]}>
          <MachinePage />
        </MemoryRouter>,
      );
      expect(screen.getByText(/Scanning this machine/)).toBeInTheDocument();
      expect(scrollIntoView).not.toHaveBeenCalled();

      resolve(makeInventory());
      await screen.findByTestId("machine-grid");
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId("machine-drift-section"));

      // One scroll per request: a manual rescan must not yank the page back.
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it("scrolls the Drift section into view when requested after the scan has already rendered", async () => {
      // The sidebar path: the user is on Machine, the scan is done, and clicks
      // Drift (or presses ⌘4). `loading` does not change here, so the scroll
      // must key on the request itself.
      render(
        <MemoryRouter initialEntries={["/machine"]}>
          <NavigateOnClick to="/machine?drift=1" />
          <MachinePage />
        </MemoryRouter>,
      );
      await screen.findByTestId("machine-grid");
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "go to drift" }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId("machine-drift-section"));

      // Consumed once: a later Refresh must not scroll again.
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it("re-arms the scroll when the harness changes while Drift is already requested", async () => {
      // Fleet's row click while already viewing Drift: ?drift=1 stays true, so
      // only the harness param changes. The request is still a new one.
      render(
        <MemoryRouter initialEntries={["/machine?drift=1"]}>
          <NavigateOnClick to="/machine?drift=1&harness=claude-code" />
          <MachinePage />
        </MemoryRouter>,
      );
      await screen.findByTestId("machine-grid");
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole("button", { name: "go to drift" }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      expect(scrollIntoView.mock.contexts[1]).toBe(screen.getByTestId("machine-drift-section"));
    });
  });

  it("filters the Drift section to the harness named in the URL", async () => {
    // Fleet's row click goes to /drift?harness=<adapter>; the redirect keeps
    // the query (src/routes/DriftRedirect.tsx), so this is what Machine sees.
    vi.mocked(collectDrift).mockResolvedValue([
      {
        scope: { kind: "global", root: "/home/user", label: "Global", fs: {} as never },
        item: {
          class: "missing",
          path: "CLAUDE.md",
          adapter: "claude-code",
          target: "claude-code",
          harnessName: "test",
          slot: "operational",
          detail: "CLAUDE.md is missing.",
        } as never,
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/machine?drift=1&harness=claude-code"]}>
        <MachinePage />
      </MemoryRouter>,
    );
    await screen.findByTestId("drift-view");
    expect(await screen.findByText("Showing drift for Claude Code.")).toBeInTheDocument();
  });

  it("mounts Drift when the section is opened", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");
    fireEvent.click(screen.getByRole("button", { name: /Drift from harness.yaml/ }));
    // Embedded, so Drift contributes no second <h1> and no nested page
    // container — its subtitle is what identifies it here.
    expect(await screen.findByTestId("drift-view")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.querySelectorAll(".hk-page .hk-page")).toHaveLength(0);
  });

  it("derives totals from the inventory rows/gaps/diffs, not resourceCount", async () => {
    renderPage();
    await screen.findByTestId("machine-grid");

    // resourceCount is 99 on every surface — if totals used it, these fail.
    expect(screen.getByText("Resources").parentElement).toHaveTextContent("Resources3");
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

  it("shows a machine-only notice when the project scope grant fails", async () => {
    mockGrantProjectScope.mockRejectedValue(new Error("forbidden"));
    renderPage();
    await screen.findByTestId("machine-grid");
    expect(screen.queryByTestId("project-degraded-notice")).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText(/Project directory/),
      { target: { value: "/repo/gone" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

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
});
