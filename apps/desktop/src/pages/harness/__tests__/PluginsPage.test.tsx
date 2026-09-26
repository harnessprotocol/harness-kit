import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PluginsPage from "../PluginsPage";

// ── Tauri seams ─────────────────────────────────────────────────

type DragDropPayload =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

let dragDropHandler: ((event: { payload: DragDropPayload }) => void) | null = null;
const mockUnlisten = vi.fn();
const mockOnDragDropEvent = vi.fn(async (handler: (event: { payload: DragDropPayload }) => void) => {
  dragDropHandler = handler;
  return mockUnlisten;
});

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (handler: (event: { payload: DragDropPayload }) => void) => mockOnDragDropEvent(handler),
  }),
}));

const mockInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  switch (command) {
    case "list_installed_plugins":
    case "check_plugin_updates":
      return [];
    case "import_plugin_from_path": {
      const path = String(args?.sourcePath);
      if (path.endsWith(".zip") || path.endsWith(".md")) throw `Not a directory: ${path}`;
      if (path.endsWith("not-a-plugin")) throw "Invalid plugin: missing .claude-plugin/plugin.json";
      return { name: path.split("/").pop(), version: "1.0.0" };
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

async function renderPage() {
  const view = render(<MemoryRouter><PluginsPage /></MemoryRouter>);
  await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  return view;
}

const overlay = () => screen.queryByTestId("plugin-import-overlay");
const importCalls = () => mockInvoke.mock.calls.filter(([command]) => command === "import_plugin_from_path");

describe("PluginsPage drag-to-import (Tauri drag-drop event)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dragDropHandler = null;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("shows the overlay on enter and hides it on leave", async () => {
    await renderPage();
    expect(overlay()).not.toBeInTheDocument();

    fire({ type: "enter", paths: ["/Users/me/research"], position: POS });
    expect(overlay()).toBeInTheDocument();
    expect(screen.getByText("Drop a plugin folder to import it")).toBeInTheDocument();

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

  it("imports a dropped plugin folder through the same command as the folder picker", async () => {
    await renderPage();

    fire({ type: "enter", paths: ["/Users/me/research"], position: POS });
    fire({ type: "drop", paths: ["/Users/me/research"], position: POS });

    await waitFor(() => expect(overlay()).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Successfully imported research")).toBeInTheDocument());
    expect(importCalls()).toEqual([["import_plugin_from_path", { sourcePath: "/Users/me/research" }]]);

    // The picker lands on the very same command with the chosen path.
    mockDialogOpen.mockResolvedValueOnce("/Users/me/harness-share");
    fireEvent.click(screen.getByRole("button", { name: "Import Plugin" }));
    await waitFor(() => expect(importCalls()).toHaveLength(2));
    expect(importCalls()[1]).toEqual(["import_plugin_from_path", { sourcePath: "/Users/me/harness-share" }]);
  });

  it("shows what failed and what to do when a file is dropped", async () => {
    await renderPage();

    fire({ type: "drop", paths: ["/Users/me/notes.md"], position: POS });

    expect(
      await screen.findByText("notes.md is a file, not a folder. Drop the plugin's folder instead."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Not a directory/)).not.toBeInTheDocument();
  });

  it("shows what failed and what to do when a folder is not a plugin", async () => {
    await renderPage();

    fire({ type: "drop", paths: ["/Users/me/not-a-plugin"], position: POS });

    expect(
      await screen.findByText(
        "not-a-plugin is not a plugin folder: it has no .claude-plugin/plugin.json. Choose the folder that contains .claude-plugin/.",
      ),
    ).toBeInTheDocument();
  });

  it("removes the drag-drop listener on unmount", async () => {
    const view = await renderPage();
    expect(mockUnlisten).not.toHaveBeenCalled();

    view.unmount();
    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it("does not listen for drops outside the desktop runtime", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    render(<MemoryRouter><PluginsPage /></MemoryRouter>);
    await screen.findByText(/Browser preview mode/);
    expect(mockOnDragDropEvent).not.toHaveBeenCalled();
  });
});
