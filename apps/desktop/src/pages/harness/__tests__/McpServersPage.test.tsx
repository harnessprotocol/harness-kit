import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import McpServersPage from "../McpServersPage";

const mockReadClaudeMd = vi.fn().mockResolvedValue('{"mcpServers": {}}');

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

function renderPage() {
  return render(
    <MemoryRouter>
      <McpServersPage />
    </MemoryRouter>,
  );
}

describe("McpServersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockReadClaudeMd.mockReturnValue(new Promise(() => {}));
    renderPage();
    // Toolbar renders the filename immediately; editor content is still loading
    expect(screen.getByText("mcp.json")).toBeInTheDocument();
  });

  it("shows formatted view with mcp.json content after loading", async () => {
    mockReadClaudeMd.mockResolvedValue('{"mcpServers": {}}');
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no mcp servers configured/i)).toBeInTheDocument();
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
