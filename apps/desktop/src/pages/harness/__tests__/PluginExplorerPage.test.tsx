import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PluginExplorerPage from "../PluginExplorerPage";

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
    ],
  })),
  readPluginFile: vi.fn(async () => "{}"),
  writePluginFile: (...args: unknown[]) => mockSave(...args),
  exportPluginAsZip: vi.fn(),
  exportPluginToFolder: vi.fn(),
  readFileHistory: vi.fn(async () => []),
  pushFileHistory: vi.fn(async () => undefined),
}));

vi.mock("../../../components/plugin-explorer/MonacoEditor", () => ({
  default: ({ onSave, onChange }: { onSave?: () => void; onChange: (v: string) => void }) => (
    <div>
      <button onClick={() => onChange('{"changed":true}')}>edit</button>
      {/* Stands in for Monaco's own Cmd+S action, which calls onSave directly */}
      <button onClick={() => onSave?.()}>monaco-save</button>
    </div>
  ),
}));

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
});
