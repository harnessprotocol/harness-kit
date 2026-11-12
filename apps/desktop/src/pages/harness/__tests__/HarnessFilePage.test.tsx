import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HarnessFilePage from "../HarnessFilePage";
import { CommandPalette } from "../../../components/CommandPalette";
import { loadedDigest } from "../../../lib/loaded-digest";

// ── Mocks ──────────────────────────────────────────────────────

const mockReadHarnessFile = vi.fn();
const mockWriteHarnessFile = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  readHarnessFile: () => mockReadHarnessFile(),
  writeHarnessFile: (content: string, expectedSha256?: string) => mockWriteHarnessFile(content, expectedSha256),
}));

// AC-56: "Generate from Claude Code setup" builds from the machine inventory.
const mockImportPersonalHarness = vi.fn();
vi.mock("../../../lib/personal-inventory", () => ({
  importPersonalHarness: () => mockImportPersonalHarness(),
}));

vi.mock("../../../lib/harness-generator", () => ({
  HARNESS_TEMPLATE: "# template\n",
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
    expect(mockWriteHarnessFile).toHaveBeenCalledWith(
      'version: "1"\nmetadata:\n  name: edited\n',
      await loadedDigest('version: "1"\n'),
    );
  });

  it("sends no digest when the page loaded ~/harness.yaml, since the write target was absent (AC-50)", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"\n', path: "~/harness.yaml" });
    mockWriteHarnessFile.mockResolvedValue("~/.claude/harness.yaml");
    renderPage();
    fireEvent.click(await screen.findByText("Editor"));
    fireEvent.change(await screen.findByTestId("fake-editor"), { target: { value: "edited\n" } });
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledWith("edited\n", undefined));
  });

  it("names a changed-on-disk refusal and offers Reload from disk (AC-50)", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"\n', path: "~/.claude/harness.yaml" });
    mockWriteHarnessFile.mockRejectedValue("Refusing to write 'x': it changed on disk since it was read");
    renderPage();
    fireEvent.click(await screen.findByText("Editor"));
    fireEvent.change(await screen.findByTestId("fake-editor"), { target: { value: "edited\n" } });
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("harness.yaml changed on disk");
    expect(screen.getByRole("button", { name: "Reload from disk" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
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
    expect(mockWriteHarnessFile).toHaveBeenCalledWith(
      'version: "1"\nmetadata:\n  name: second\n',
      await loadedDigest('version: "1"\n'),
    );
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

  it("keeps a failed scan on the empty state with the error and Retry scan, not the template (AC-20)", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
    mockImportPersonalHarness
      .mockRejectedValueOnce("permission denied: ~/.claude")
      .mockResolvedValue({ harnessYaml: 'version: "1"\n# generated\n' });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Generate from Claude Code setup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't scan your Claude Code setup");
    expect(screen.getByText("permission denied: ~/.claude")).not.toBeVisible();
    // Still on the empty state; the blank template did not open as if it were the result.
    expect(screen.getByText("No harness.yaml found")).toBeInTheDocument();
    expect(screen.queryByTestId("fake-editor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry scan" }));
    const editor = await screen.findByTestId("fake-editor");
    expect(editor).toHaveValue('version: "1"\n# generated\n');
    expect(mockImportPersonalHarness).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
