import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HarnessFilePage from "../HarnessFilePage";

// ── Mocks ──────────────────────────────────────────────────────

const mockReadHarnessFile = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  readHarnessFile: () => mockReadHarnessFile(),
}));

// @harness-kit/core may not build cleanly in jsdom — mock the whole module
vi.mock("@harness-kit/core", () => ({
  parseHarness: vi.fn((_content: string) => ({
    config: { version: "1", metadata: { name: "test" } },
  })),
  validateHarnessYaml: vi.fn(() => ({
    valid: true,
    isLegacyFormat: false,
    errors: [],
  })),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <HarnessFilePage />
    </MemoryRouter>,
  );
}

// ── Tests ──────────────────────────────────────────────────────

describe("HarnessFilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockReadHarnessFile.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("shows not-found state when harness file is absent", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No harness\.yaml found/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Loading/)).toBeNull();
  });

  it("shows file content when harness file exists", async () => {
    mockReadHarnessFile.mockResolvedValue({
      found: true,
      content: 'version: "1"\nmetadata:\n  name: my-harness\n',
      path: "~/.claude/harness.yaml",
    });
    renderPage();
    await waitFor(() => {
      // The file path now appears in the EditorToolbar subtitle
      expect(screen.getByText("~/.claude/harness.yaml")).toBeInTheDocument();
    });
  });

  it("shows error when readHarnessFile throws", async () => {
    mockReadHarnessFile.mockRejectedValue(new Error("command not found"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/command not found/i)).toBeInTheDocument();
    });
  });
});
