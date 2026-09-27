import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClaudeMdPage from "../ClaudeMdPage";

const mockReadClaudeMd = vi.fn().mockResolvedValue("# Hello");

vi.mock("../../../lib/tauri", () => ({
  readClaudeMd: (...args: unknown[]) => mockReadClaudeMd(...args),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/preferences", () => ({
  getMarkdownFont: vi.fn(() => "sans"),
}));

vi.mock("../../../components/plugin-explorer/MonacoEditor", () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="monaco-editor">{content}</div>
  ),
}));

vi.mock("../../../components/MarkdownPanel", () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-panel">{content}</div>
  ),
}));

function renderPage() {
  return render(<MemoryRouter><ClaudeMdPage /></MemoryRouter>);
}

describe("ClaudeMdPage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows file content after loading", async () => {
    mockReadClaudeMd.mockResolvedValue("# Hello");
    renderPage();
    await waitFor(() => {
      const editor = screen.queryByTestId("monaco-editor") ?? screen.queryByTestId("markdown-panel");
      expect(editor).not.toBeNull();
    });
  });

  it("says the file couldn't be read, raw error behind Details, and Reload reads it again (AC-20)", async () => {
    mockReadClaudeMd.mockRejectedValueOnce(new Error("file not found")).mockResolvedValue("# Hello");
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read CLAUDE.md");
    expect(screen.getByText("file not found")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(mockReadClaudeMd).toHaveBeenCalledTimes(2);
  });
});
