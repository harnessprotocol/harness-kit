import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HarnessFilePage from "../HarnessFilePage";
import { CommandPalette } from "../../../components/CommandPalette";
import { loadedDigest } from "../../../lib/loaded-digest";
import { setCurrentProjectDir } from "../../../lib/project-dir";

// ── Mocks ──────────────────────────────────────────────────────

const mockReadHarnessFile = vi.fn();
const mockWriteHarnessFile = vi.fn();
const mockGrantProjectScope = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  readHarnessFile: () => mockReadHarnessFile(),
  writeHarnessFile: (content: string, expectedSha256?: string) => mockWriteHarnessFile(content, expectedSha256),
  grantProjectScope: (dir: string) => mockGrantProjectScope(dir),
}));

// A chosen project is read through the sync bridge; these are its files.
const projectFiles: Record<string, string> = {};
vi.mock("../../../lib/sync-fs", () => ({
  SyncFsProvider: vi.fn(function SyncFsProvider(this: Record<string, unknown>) {
    this.joinPath = (...segs: string[]) => segs.join("/");
    this.exists = async (p: string) => p in projectFiles;
    this.readFile = async (p: string) => projectFiles[p];
  }),
}));
vi.mock("../../../lib/harness-fs", () => ({ TauriFsProvider: vi.fn() }));

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

  it("tells the user a ~/harness.yaml needs moving when ~/.claude/harness.yaml is absent", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null, legacy_home_file: true });
    renderPage();
    expect(await screen.findByTestId("legacy-harness-notice")).toHaveTextContent(
      "Found ~/harness.yaml. Harness Kit now reads ~/.claude/harness.yaml; move the file there.",
    );
  });

  it("shows no legacy notice when there is no file at ~/harness.yaml", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
    renderPage();
    await screen.findByText("No harness.yaml found");
    expect(screen.queryByTestId("legacy-harness-notice")).not.toBeInTheDocument();
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
    expect(palette().getByRole("option", { name: /Save harness\.yaml/ })).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(editor, { target: { value: 'version: "1"\nmetadata:\n  name: first\n' } });
    fireEvent.change(editor, { target: { value: 'version: "1"\nmetadata:\n  name: second\n' } });
    const save = palette().getByRole("option", { name: /Save harness\.yaml/ });
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

describe("HarnessFilePage follows the title-bar project (AC-55)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(projectFiles)) delete projectFiles[key];
    mockGrantProjectScope.mockResolvedValue(undefined);
    act(() => setCurrentProjectDir(null));
  });

  it("labels the personal profile when no project is chosen", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"\n', path: "~/.claude/harness.yaml" });
    renderPage();
    expect(await screen.findByTestId("profile-scope")).toHaveTextContent("Personal profile");
  });

  it("shows the project's committed harness.yaml, read-only, with the scope in the header", async () => {
    projectFiles["/work/acme/harness.yaml"] = 'version: "1"\nmetadata:\n  name: team\n';
    act(() => setCurrentProjectDir("/work/acme"));
    renderPage();
    expect(await screen.findByText("/work/acme/harness.yaml")).toBeInTheDocument();
    expect(screen.getByTestId("profile-scope")).toHaveTextContent("Team baseline · acme");
    expect(mockReadHarnessFile).not.toHaveBeenCalled();
    // No Editor view, so nothing here can write to the project file.
    expect(screen.queryByText("Editor")).toBeNull();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("says the project has no harness.yaml and offers no personal-profile actions", async () => {
    act(() => setCurrentProjectDir("/work/acme"));
    renderPage();
    expect(await screen.findByText(/No harness\.yaml in acme/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate from Claude Code setup" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create from scratch" })).toBeNull();
    expect(screen.getByTestId("profile-scope")).toHaveTextContent("Team baseline · acme");
  });

  it("returns to the personal profile when the project is cleared", async () => {
    projectFiles["/work/acme/harness.yaml"] = 'version: "1"\n';
    mockReadHarnessFile.mockResolvedValue({ found: true, content: 'version: "1"\n', path: "~/.claude/harness.yaml" });
    act(() => setCurrentProjectDir("/work/acme"));
    renderPage();
    await screen.findByText("/work/acme/harness.yaml");
    act(() => setCurrentProjectDir(null));
    expect(await screen.findByText("~/.claude/harness.yaml")).toBeInTheDocument();
    expect(screen.getByTestId("profile-scope")).toHaveTextContent("Personal profile");
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });
});
