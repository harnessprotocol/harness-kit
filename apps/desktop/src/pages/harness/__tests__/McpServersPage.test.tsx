import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import McpServersPage from "../McpServersPage";

const mockReadClaudeMd = vi.fn().mockResolvedValue('{"mcpServers": {}}');

vi.mock("../../../lib/tauri", () => ({
  readClaudeMd: (...args: unknown[]) => mockReadClaudeMd(...args),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../components/plugin-explorer/MonacoEditor", () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="monaco-editor">{content}</div>
  ),
}));

function renderPage() {
  return render(<MemoryRouter><McpServersPage /></MemoryRouter>);
}

describe("McpServersPage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows loading state initially", () => {
    mockReadClaudeMd.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("shows editor with mcp.json content after loading", async () => {
    mockReadClaudeMd.mockResolvedValue('{"mcpServers": {}}');
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
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
