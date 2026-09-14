import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PluginExplorerPage from "../PluginExplorerPage";
import { setConfirmSave } from "../../../lib/preferences";

// Names are exactly what PluginExplorerPage.tsx and hooks/usePluginExplorer.ts import from lib/tauri.
const mockSave = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("../../../lib/tauri", () => ({
  listInstalledPlugins: vi.fn(async () => [
    { name: "demo", version: "1.0.0", source: "/plugins/demo" },
  ]),
  readPluginTree: vi.fn(async () => ({
    name: "demo",
    path: "/plugins/demo",
    kind: "directory",
    children: [
      // plugin.json is critical per lib/criticalFiles.ts
      { name: "plugin.json", path: "/plugins/demo/plugin.json", kind: "file" },
      // run.sh is not critical per lib/criticalFiles.ts, and unlike .md it opens in
      // the editor view (lib/viewModes.ts), so Monaco mounts.
      { name: "run.sh", path: "/plugins/demo/run.sh", kind: "file" },
    ],
  })),
  readPluginFile: vi.fn(async () => "{}"),
  writePluginFile: (...args: unknown[]) => mockSave(...args),
  exportPluginAsZip: vi.fn(),
  exportPluginToFolder: vi.fn(),
  readFileHistory: vi.fn(async () => []),
  pushFileHistory: vi.fn(async () => undefined),
}));

// Mimics @monaco-editor/react rather than replacing MonacoEditor: the library stores
// onMount in a ref at first render and never refreshes it, so whatever the real
// MonacoEditor's Cmd+S action captures at mount is what the "monaco-save" button runs.
vi.mock("@monaco-editor/react", async () => {
  const { useRef, useEffect, useState } = await import("react");
  type Action = { id: string; run: () => void };
  type Props = {
    onMount: (editor: unknown, monaco: unknown) => void;
    onChange: (value: string | undefined) => void;
  };
  return {
    loader: { config: vi.fn() },
    default: ({ onMount, onChange }: Props) => {
      const mountAtFirstRender = useRef(onMount);
      const [actions] = useState<Action[]>([]);
      useEffect(() => {
        const editor = { addAction: (a: Action) => actions.push(a) };
        const monaco = {
          KeyMod: { CtrlCmd: 2048 },
          KeyCode: { KeyS: 49 },
          editor: { setTheme: () => {} },
        };
        mountAtFirstRender.current(editor, monaco);
      }, [actions]);
      return (
        <div>
          <button onClick={() => onChange('{"changed":true}')}>edit</button>
          <button onClick={() => actions.find((a) => a.id === "harness-kit-save")?.run()}>
            monaco-save
          </button>
        </div>
      );
    },
  };
});
vi.mock("monaco-editor", () => ({}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/harness/plugins/demo"]}>
      <Routes>
        <Route path="/harness/plugins/:pluginName" element={<PluginExplorerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openAndEditCriticalFile() {
  fireEvent.click(await screen.findByText("plugin.json"));
  fireEvent.click(await screen.findByText("edit"));
}

describe("PluginExplorerPage save path (AC-31)", () => {
  beforeEach(() => {
    mockSave.mockClear();
    setConfirmSave(true);
  });

  it("asks before saving a critical file from the editor's own Cmd+S", async () => {
    renderPage();
    await openAndEditCriticalFile();
    fireEvent.click(screen.getByText("monaco-save"));
    expect(await screen.findByText(/Save changes\?/)).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("asks before saving a critical file from the toolbar Save button", async () => {
    renderPage();
    await openAndEditCriticalFile();
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Save changes\?/)).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("asks before saving a critical file from the window's Cmd+S", async () => {
    renderPage();
    await openAndEditCriticalFile();
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(await screen.findByText(/Save changes\?/)).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("saves a non-critical file once from the editor's own Cmd+S without asking", async () => {
    // The confirm-save preference defaults to on and would show the inline popover
    // even for non-critical files; turn it off so only the critical gate applies.
    setConfirmSave(false);
    renderPage();
    fireEvent.click(await screen.findByText("run.sh"));
    fireEvent.click(await screen.findByText("edit"));
    fireEvent.click(screen.getByText("monaco-save"));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Save changes\?/)).not.toBeInTheDocument();
  });
});
