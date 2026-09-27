import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HarnessFilePage from "../HarnessFilePage";
import { CommandPalette } from "../../../components/CommandPalette";

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

  it("offers Save harness.yaml in the palette while editing, saving the latest content (AC-21)", async () => {
    mockReadHarnessFile.mockResolvedValue({
      found: true,
      content: 'version: "1"\n',
      path: "~/.claude/harness.yaml",
    });
    mockWriteHarnessFile.mockResolvedValue("~/.claude/harness.yaml");
    render(
      <MemoryRouter>
        <HarnessFilePage />
        <CommandPalette open onClose={() => {}} sections={[]} />
      </MemoryRouter>,
    );
    const palette = () => within(screen.getByRole("dialog", { name: "Command palette" }));
    fireEvent.click(await screen.findByText("Editor"));
    const editor = await screen.findByTestId("fake-editor");
    // Nothing changed yet: listed, but off like the Save button.
    expect(palette().getByRole("button", { name: /Save harness\.yaml/ })).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(editor, { target: { value: 'version: "1"\nmetadata:\n  name: first\n' } });
    fireEvent.change(editor, { target: { value: 'version: "1"\nmetadata:\n  name: second\n' } });
    const save = palette().getByRole("button", { name: /Save harness\.yaml/ });
    expect(save).not.toHaveAttribute("aria-disabled");
    fireEvent.click(save);

    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
    expect(mockWriteHarnessFile).toHaveBeenCalledWith('version: "1"\nmetadata:\n  name: second\n');
  });

  it("says harness.yaml couldn't be read, raw error behind Details, and Retry reads it again (AC-20)", async () => {
    mockReadHarnessFile
      .mockRejectedValueOnce(new Error("command not found"))
      .mockResolvedValue({ found: false, content: null, path: null });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read harness.yaml");
    expect(screen.getByText("command not found")).not.toBeVisible();
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText("command not found")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No harness.yaml found")).toBeInTheDocument();
    expect(mockReadHarnessFile).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
