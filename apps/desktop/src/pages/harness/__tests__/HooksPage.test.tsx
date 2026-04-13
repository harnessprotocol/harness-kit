import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HooksPage from "../HooksPage";

const mockReadClaudeMd = vi.fn().mockResolvedValue('{"hooks": {}}');

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
      <HooksPage />
    </MemoryRouter>,
  );
}

describe("HooksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    });
  });
});
