import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HooksPage from "../HooksPage";

const mockReadClaudeMd = vi.fn().mockResolvedValue('{"hooks": {}}');
const mockWriteConfigFile = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../lib/tauri", () => ({
  readClaudeMd: (...args: unknown[]) => mockReadClaudeMd(...args),
  writeConfigFile: (...args: unknown[]) => mockWriteConfigFile(...args),
}));

vi.mock("../../../lib/preferences", () => ({
  getMarkdownFont: vi.fn(() => "sans"),
}));

vi.mock("../../../components/plugin-explorer/MonacoEditor", () => ({
  default: ({ content, onChange }: { content: string; onChange: (v: string) => void }) => (
    <textarea data-testid="monaco-editor" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
}));

function renderPage() {
  return render(<MemoryRouter><HooksPage /></MemoryRouter>);
}

describe("HooksPage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows formatted view with settings.json content after loading", async () => {
    mockReadClaudeMd.mockResolvedValue('{"hooks": {}}');
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no hooks configured/i)).toBeInTheDocument();
    });
  });

  it("shows error message when file load fails", async () => {
    mockReadClaudeMd.mockRejectedValue(new Error("permission denied"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read settings.json");
    // The raw error waits behind Details (AC-20).
    expect(screen.getByText("permission denied")).not.toBeVisible();
  });

  it("keeps the edits in the editor when a save fails, with Retry save (AC-20)", async () => {
    mockReadClaudeMd.mockResolvedValue('{"hooks": {}}');
    mockWriteConfigFile.mockRejectedValueOnce(new Error("read-only file system")).mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Editor" }));
    const editor = await screen.findByTestId("monaco-editor");
    fireEvent.change(editor, { target: { value: '{"hooks": {"x": 1}}' } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save settings.json");
    expect(screen.getByTestId("monaco-editor")).toHaveValue('{"hooks": {"x": 1}}');

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(mockWriteConfigFile).toHaveBeenCalledTimes(2));
    expect(mockWriteConfigFile).toHaveBeenLastCalledWith("~/.claude/settings.json", '{"hooks": {"x": 1}}');
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
