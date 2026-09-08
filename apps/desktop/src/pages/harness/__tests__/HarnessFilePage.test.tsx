import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HarnessFilePage from "../HarnessFilePage";

// ── Mocks ──────────────────────────────────────────────────────

const mockReadHarnessFile = vi.fn();
const mockWriteHarnessFile = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  readHarnessFile: () => mockReadHarnessFile(),
  writeHarnessFile: (content: string) => mockWriteHarnessFile(content),
}));

// The page passes no onSave to MonacoEditor and relies on its own window keydown
// listener for Cmd+S. Stand in for the lazy editor with a textarea so the test can
// dirty the content without loading Monaco.
vi.mock("../../../components/plugin-explorer/MonacoEditor", () => ({
  default: ({ content, onChange }: { content: string; onChange: (v: string) => void }) => (
    <textarea data-testid="fake-editor" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
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

  it("saves once on Cmd+S in editor view with dirty content", async () => {
    mockReadHarnessFile.mockResolvedValue({
      found: true,
      content: 'version: "1"\n',
      path: "~/.claude/harness.yaml",
    });
    mockWriteHarnessFile.mockResolvedValue("~/.claude/harness.yaml");
    renderPage();
    fireEvent.click(await screen.findByText("Editor"));
    const editor = await screen.findByTestId("fake-editor");
    fireEvent.change(editor, { target: { value: 'version: "1"\nmetadata:\n  name: edited\n' } });

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
    // waitFor resolves on the first call; flush pending work and confirm no second save landed.
    await act(async () => {});
    expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1);
    expect(mockWriteHarnessFile).toHaveBeenCalledWith('version: "1"\nmetadata:\n  name: edited\n');
  });

  it("shows error when readHarnessFile throws", async () => {
    mockReadHarnessFile.mockRejectedValue(new Error("command not found"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/command not found/i)).toBeInTheDocument();
    });
  });
});
