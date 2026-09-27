import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PluginsPage from "../PluginsPage";
import { describeImportError } from "../plugins/import-errors";
import { resetImportQueueForTests } from "../plugins/import-queue";
import { CommandPalette } from "../../../components/CommandPalette";

// ── Tauri seams ─────────────────────────────────────────────────

type DragDropPayload =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

type DragDropHandler = (event: { payload: DragDropPayload }) => void;

let dragDropHandler: DragDropHandler | null = null;
const mockUnlisten = vi.fn();
const mockOnDragDropEvent = vi.fn(async (handler: DragDropHandler): Promise<() => void> => {
  dragDropHandler = handler;
  return mockUnlisten;
});

vi.mock("@tauri-apps/api/webview", () => ({
  // Like the real API, this throws when there is no Tauri runtime.
  getCurrentWebview: () => {
    if (!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) {
      throw new TypeError("Cannot read properties of undefined (reading 'metadata')");
    }
    return { onDragDropEvent: (handler: DragDropHandler) => mockOnDragDropEvent(handler) };
  },
}));

// Paths whose import waits until the test releases it.
const held = new Map<string, Promise<void>>();
function holdImport(path: string): () => Promise<void> {
  let release!: () => void;
  held.set(path, new Promise<void>((resolve) => { release = resolve; }));
  return async () => {
    await act(async () => { release(); });
  };
}

const mockInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  switch (command) {
    case "list_installed_plugins":
    case "check_plugin_updates":
      return [];
    case "import_plugin_from_path": {
      const path = String(args?.sourcePath);
      await held.get(path);
      if (path.endsWith(".zip") || path.endsWith(".md")) throw `Not a directory: ${path}`;
      if (path.endsWith("not-a-plugin")) throw "Invalid plugin: missing .claude-plugin/plugin.json";
      return { name: path.split("/").pop(), version: "1.0.0" };
    }
    case "import_plugin_from_zip": {
      const path = String(args?.zipPath);
      return { name: path.split("/").pop()!.replace(/\.zip$/, ""), version: "1.0.0" };
    }
    default:
      throw new Error(`unexpected command ${command}`);
  }
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => mockInvoke(command, args),
}));

const mockDialogOpen = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockDialogOpen(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────

const POS = { x: 10, y: 10 };

function fire(payload: DragDropPayload) {
  act(() => {
    dragDropHandler!({ payload });
  });
}

const drop = (...paths: string[]) => fire({ type: "drop", paths, position: POS });

async function renderPage() {
  const view = render(<MemoryRouter><PluginsPage /></MemoryRouter>);
  await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  return view;
}

const overlay = () => screen.queryByTestId("plugin-import-overlay");
const importCalls = () => mockInvoke.mock.calls.filter(([command]) => command.startsWith("import_plugin_"));
const importButton = () => screen.getByRole("button", { name: "Import Plugin" });

describe("PluginsPage drag-to-import (Tauri drag-drop event)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    held.clear();
    resetImportQueueForTests();
    dragDropHandler = null;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it("shows the overlay on enter and hides it on leave", async () => {
    await renderPage();
    expect(overlay()).not.toBeInTheDocument();

    fire({ type: "enter", paths: ["/Users/me/research"], position: POS });
    expect(overlay()).toBeInTheDocument();
    expect(screen.getByText("Drop a plugin folder or .zip to import it")).toBeInTheDocument();

    fire({ type: "leave" });
    await waitFor(() => expect(overlay()).not.toBeInTheDocument());
  });

  it("hides the overlay when the window loses focus", async () => {
    await renderPage();
    fire({ type: "over", position: POS });
    expect(overlay()).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    await waitFor(() => expect(overlay()).not.toBeInTheDocument());
  });

  it("hides the overlay on Escape", async () => {
    await renderPage();
    fire({ type: "over", position: POS });
    expect(overlay()).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(overlay()).not.toBeInTheDocument());
  });

  it("imports a dropped plugin folder through the same command as the folder picker", async () => {
    await renderPage();

    fire({ type: "enter", paths: ["/Users/me/research"], position: POS });
    drop("/Users/me/research");

    await waitFor(() => expect(overlay()).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent("Successfully imported research");
    expect(importCalls()).toEqual([["import_plugin_from_path", { sourcePath: "/Users/me/research" }]]);

    // The picker lands on the very same command with the chosen path.
    mockDialogOpen.mockResolvedValueOnce("/Users/me/harness-share");
    fireEvent.click(importButton());
    await waitFor(() => expect(importCalls()).toHaveLength(2));
    expect(importCalls()[1]).toEqual(["import_plugin_from_path", { sourcePath: "/Users/me/harness-share" }]);
  });

  it("routes a dropped .zip to the zip import command", async () => {
    await renderPage();

    drop("/Users/me/research.zip");

    expect(await screen.findByText("Successfully imported research")).toBeInTheDocument();
    expect(importCalls()).toEqual([["import_plugin_from_zip", { zipPath: "/Users/me/research.zip" }]]);
  });

  it("says what failed and what to do when a file is dropped, with the raw error only behind Details", async () => {
    await renderPage();

    drop("/Users/me/notes.md");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "notes.md is a file, not a folder. Drop the plugin's folder, or a .zip of it, instead.",
    );
    const raw = screen.getByText("Not a directory: /Users/me/notes.md");
    expect(raw.closest("details")).not.toBeNull();
    expect(raw).not.toBeVisible();
    expect(alert).not.toHaveTextContent("Not a directory");
    expect(screen.getByText("Details").tagName).toBe("SUMMARY");
    // Its one action is Dismiss. (The exit animation never completes in jsdom,
    // so removal itself is not asserted here.)
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("says what failed and what to do when a folder is not a plugin", async () => {
    await renderPage();

    drop("/Users/me/not-a-plugin");

    expect(
      await screen.findByText(
        "not-a-plugin is not a plugin folder: it has no .claude-plugin/plugin.json. Choose the folder that contains .claude-plugin/.",
      ),
    ).toBeInTheDocument();
  });

  it("names the one failed folder in a multi-folder drop and imports the rest", async () => {
    await renderPage();

    drop("/Users/me/research", "/Users/me/notes.md", "/Users/me/harness-share");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("notes.md is a file, not a folder.");
    expect(alert).toHaveTextContent("Imported research, harness-share.");
    expect(importCalls().map(([, args]) => args?.sourcePath)).toEqual([
      "/Users/me/research", "/Users/me/notes.md", "/Users/me/harness-share",
    ]);
  });

  it("names every failed folder when several fail", async () => {
    await renderPage();

    drop("/Users/me/notes.md", "/Users/me/research", "/Users/me/not-a-plugin");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2 failed: notes.md, not-a-plugin. Imported research.");
    // Each folder's reason and raw error stay available behind Details.
    const details = screen.getByText("Details").closest("details")!;
    expect(details).toHaveTextContent("Not a directory: /Users/me/notes.md");
    expect(details).toHaveTextContent("Invalid plugin: missing .claude-plugin/plugin.json");
  });

  it("imports a folder dropped twice in quick succession once", async () => {
    await renderPage();
    const release = holdImport("/Users/me/research");

    drop("/Users/me/research");
    drop("/Users/me/research");
    await release();

    expect(await screen.findByText("Successfully imported research")).toBeInTheDocument();
    expect(importCalls()).toHaveLength(1);
    expect(screen.queryByText(/research, research/)).not.toBeInTheDocument();
  });

  it("queues a drop made during an import instead of running a second import alongside it", async () => {
    await renderPage();
    const releaseFirst = holdImport("/Users/me/research");

    drop("/Users/me/research");
    await waitFor(() => expect(screen.getByText("Importing research...")).toBeInTheDocument());
    expect(importButton()).toBeDisabled();

    drop("/Users/me/harness-share");
    // The second folder waits: no second command while the first is in flight.
    await act(async () => { await Promise.resolve(); });
    expect(importCalls()).toHaveLength(1);
    expect(screen.getByText("Importing research...")).toBeInTheDocument();

    await releaseFirst();

    expect(await screen.findByText("Successfully imported research, harness-share")).toBeInTheDocument();
    expect(importCalls().map(([, args]) => args?.sourcePath)).toEqual([
      "/Users/me/research", "/Users/me/harness-share",
    ]);
    expect(importButton()).toBeEnabled();
  });

  it("keeps one queue across leaving and returning to the page mid-batch", async () => {
    // Rust checks "already installed" and then copies: a second loop importing
    // the same folder alongside the first would race it.
    const view = await renderPage();
    const release = holdImport("/Users/me/research");
    drop("/Users/me/research");
    await waitFor(() => expect(screen.getByText("Importing research...")).toBeInTheDocument());

    view.unmount();
    render(<MemoryRouter><PluginsPage /></MemoryRouter>);
    await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalledTimes(2));
    // The returning page shows the batch still running.
    expect(screen.getByText("Importing research...")).toBeInTheDocument();
    expect(importButton()).toBeDisabled();

    drop("/Users/me/research");
    await release();

    expect(await screen.findByText("Successfully imported research")).toBeInTheDocument();
    expect(importCalls()).toHaveLength(1);
    expect(importButton()).toBeEnabled();
  });

  it("removes the drag-drop listener on unmount", async () => {
    const view = await renderPage();
    expect(mockUnlisten).not.toHaveBeenCalled();

    view.unmount();
    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it("removes a listener that registers after the page has unmounted", async () => {
    let resolveListen!: (fn: () => void) => void;
    mockOnDragDropEvent.mockImplementationOnce(
      () => new Promise<() => void>((resolve) => { resolveListen = resolve; }),
    );
    const view = await renderPage();

    view.unmount();
    expect(mockUnlisten).not.toHaveBeenCalled();

    await act(async () => { resolveListen(mockUnlisten); });
    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it("warns when the drag-drop listener cannot be registered", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new Error("not allowed");
    mockOnDragDropEvent.mockImplementationOnce(async () => { throw failure; });

    await renderPage();

    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("drag-and-drop"), failure));
  });

  it("keeps the page up when the webview throws synchronously", async () => {
    // getCurrentWebview() throws before returning a promise when Tauri's window
    // metadata is missing (the e2e bridge does this); that must not reach the
    // error boundary.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new TypeError("Cannot read properties of undefined (reading 'currentWindow')");
    mockOnDragDropEvent.mockImplementationOnce(() => {
      throw failure;
    });

    await renderPage();

    expect(importButton()).toBeEnabled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("drag-and-drop"), failure);
  });

  it("Import plugin from the palette runs the folder picker import, disabled in step with the button (AC-21)", async () => {
    render(
      <MemoryRouter>
        <PluginsPage />
        <CommandPalette open onClose={() => {}} sections={[]} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    const option = () =>
      within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("button", {
        name: "Import plugin from folder…",
      });
    expect(option()).not.toHaveAttribute("aria-disabled");

    const release = holdImport("/Users/me/picked");
    mockDialogOpen.mockResolvedValueOnce("/Users/me/picked");
    fireEvent.click(option());
    await waitFor(() => expect(importCalls()).toEqual([["import_plugin_from_path", { sourcePath: "/Users/me/picked" }]]));
    // While the import runs the button is off, and so is the command.
    expect(importButton()).toBeDisabled();
    expect(option()).toHaveAttribute("aria-disabled", "true");
    await release();
    await waitFor(() => expect(option()).not.toHaveAttribute("aria-disabled"));
  });

  it("renders the browser preview without touching the Tauri webview", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    render(<MemoryRouter><PluginsPage /></MemoryRouter>);

    // getCurrentWebview throws outside Tauri; reaching it would take the page down.
    expect(await screen.findByText(/Browser preview mode/)).toBeInTheDocument();
    expect(screen.getByText("Index source material and synthesize reusable project research.")).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
    expect(importButton()).toHaveAttribute("title", expect.stringMatching(/desktop runtime/));
    expect(mockOnDragDropEvent).not.toHaveBeenCalled();
  });
});

describe("PluginsPage load failure (AC-20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetImportQueueForTests();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it("says the list couldn't load, keeps the raw error behind Details, and Retry reloads", async () => {
    const raw = "Failed to read ~/.claude/plugins/installed_plugins.json: Permission denied (os error 13)";
    const fallback = mockInvoke.getMockImplementation()!;
    mockInvoke.mockImplementation(async (command, args) => {
      if (command === "list_installed_plugins") throw raw;
      return fallback(command, args);
    });
    render(<MemoryRouter><PluginsPage /></MemoryRouter>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load installed plugins");
    expect(screen.getByText(raw)).not.toBeVisible();

    mockInvoke.mockImplementation(fallback);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No plugins installed")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("describeImportError", () => {
  it("tells a manifest the disk refused apart from one that is not valid JSON, keeping Rust's text", () => {
    const read = describeImportError(
      "Failed to read plugin manifest: Permission denied (os error 13)", "research",
    );
    expect(read.title).toBe("research/.claude-plugin/plugin.json could not be read from disk.");
    expect(read.action).toMatch(/permissions/);
    expect(read.details).toBe("Failed to read plugin manifest: Permission denied (os error 13)");

    const parse = describeImportError(
      "Failed to parse plugin manifest: missing field `version` at line 1 column 20", "research",
    );
    expect(parse.title).toBe("research/.claude-plugin/plugin.json is not a valid manifest.");
    expect(parse.action).toMatch(/valid JSON/);
    expect(parse.details).toBe("Failed to parse plugin manifest: missing field `version` at line 1 column 20");
  });

  it("keeps the raw text out of the message for errors it does not recognise", () => {
    const unknown = describeImportError(new Error("Failed to copy file: disk full"), "research");
    expect(unknown.title).toBe("Could not import research.");
    expect(`${unknown.title} ${unknown.action}`).not.toContain("disk full");
    expect(unknown.details).toBe("Failed to copy file: disk full");
  });
});
