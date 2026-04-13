import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  default: ({ content }: { content: string }) => <div data-testid="monaco-editor">{content}</div>,
}));

vi.mock("../../../components/MarkdownPanel", () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-panel">{content}</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ClaudeMdPage />
    </MemoryRouter>,
  );
}

describe("ClaudeMdPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows file content after loading", async () => {
    mockReadClaudeMd.mockResolvedValue("# Hello");
    renderPage();
    await waitFor(() => {
      const editor =
        screen.queryByTestId("monaco-editor") ?? screen.queryByTestId("markdown-panel");
      expect(editor).not.toBeNull();
    });
  });

  it("shows error message when file load fails", async () => {
    mockReadClaudeMd.mockRejectedValue(new Error("file not found"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/file not found/i)).toBeInTheDocument();
    });
  });
});
