import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { PageBoundary, pageBoundaryKey } from "../../../components/PageBoundary";
import HarnessFilePage from "../HarnessFilePage";
import { CommandPalette } from "../../../components/CommandPalette";
import { loadedDigest } from "../../../lib/loaded-digest";
import { setCurrentProjectDir } from "../../../lib/project-dir";
import { clearAllProfileDrafts, getProfileDraft } from "../../../lib/profile-draft";

// The draft store is module-level: no test may inherit another's unsaved edits.
beforeEach(() => clearAllProfileDrafts());

// ── Mocks ──────────────────────────────────────────────────────

const mockReadHarnessFile = vi.fn();
const mockWriteHarnessFile = vi.fn();
const mockGrantProjectScope = vi.fn();
const mockSaveShareFile = vi.fn();
vi.mock("../../../lib/tauri", () => ({
  saveShareFile: (...args: unknown[]) => mockSaveShareFile(...args),
  // The Compile tab mounts SyncPage.
  syncListBackups: async () => [],
  syncFileExists: async () => false,
  syncCreateBackup: vi.fn(),
  syncWriteFiles: vi.fn(),
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
  default: ({ content, onChange, readOnly }: { content: string; onChange: (v: string) => void; readOnly?: boolean }) => (
    <textarea
      data-testid={readOnly ? "fake-editor-readonly" : "fake-editor"}
      readOnly={readOnly}
      value={content}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// The real core: the panel and Share read what the editor holds.

function renderPage() {
  return render(
    <MemoryRouter>
      <HarnessFilePage />
    </MemoryRouter>,
  );
}

// The Name field, once the panel has read the loaded file.
async function nameField() {
  const field = await screen.findByRole("textbox", { name: /^Name$/ });
  await waitFor(() => expect(field).toHaveValue("my-harness"));
  return field;
}

const PERSONAL = 'version: "2"\n# mine\nmetadata:\n  name: my-harness\n  description: Mine\n';

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
    fireEvent.change(await screen.findByTestId("fake-editor"), { target: { value: 'version: "1"\nmetadata:\n  name: edited\n' } });
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
    fireEvent.click(await screen.findByRole("button", { name: "Scan this machine" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't scan your Claude Code setup");
    expect(screen.getByText("permission denied: ~/.claude")).not.toBeVisible();
    // Still on the empty state; the blank template did not open as if it were the result.
    expect(screen.getByText("No harness.yaml found")).toBeInTheDocument();
    expect(screen.queryByTestId("fake-editor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry scan" }));
    // The result is shown read-only for review; nothing has been written.
    const review = await screen.findByTestId("fake-editor-readonly");
    expect(review).toHaveValue('version: "1"\n# generated\n');
    expect(mockWriteHarnessFile).not.toHaveBeenCalled();
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
    // No editor, and the panel has no fields, so nothing here can write to the project file.
    expect(screen.queryByTestId("fake-editor")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("says the project has no harness.yaml and offers no personal-profile actions", async () => {
    act(() => setCurrentProjectDir("/work/acme"));
    renderPage();
    expect(await screen.findByText(/No harness\.yaml in acme/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scan this machine" })).toBeNull();
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
    expect(await screen.findByTestId("fake-editor")).toBeInTheDocument();
  });
});

describe("Profile with no harness.yaml: scan, review, write (AC-22)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => setCurrentProjectDir(null));
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
    mockImportPersonalHarness.mockResolvedValue({ harnessYaml: PERSONAL });
  });

  it("offers Scan this machine as the primary action, with the profile picker and a blank start, and no Generate button", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Scan this machine" })).toHaveClass("hk-btn-primary");
    expect(screen.getByRole("button", { name: "Start from a profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create from scratch" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate from Claude Code setup/ })).toBeNull();
  });

  it("shows the scan read-only and writes nothing until Write harness.yaml, then loads the file", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Scan this machine" }));
    expect(await screen.findByTestId("fake-editor-readonly")).toHaveValue(PERSONAL);
    expect(mockWriteHarnessFile).not.toHaveBeenCalled();

    mockWriteHarnessFile.mockResolvedValue("~/.claude/harness.yaml");
    mockReadHarnessFile.mockResolvedValue({ found: true, content: PERSONAL, path: "~/.claude/harness.yaml" });
    fireEvent.click(screen.getByRole("button", { name: "Write harness.yaml" }));

    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledWith(PERSONAL, undefined));
    // The page now shows the written file: editor beside the panel.
    expect(await screen.findByTestId("fake-editor")).toHaveValue(PERSONAL);
    await nameField();
  });

  it("Cancel drops the scan and returns to the empty state without writing", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Scan this machine" }));
    await screen.findByTestId("fake-editor-readonly");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("No harness.yaml found")).toBeInTheDocument();
    expect(mockWriteHarnessFile).not.toHaveBeenCalled();
  });

  it("keeps the scan and offers Retry when the write fails", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Scan this machine" }));
    await screen.findByTestId("fake-editor-readonly");
    mockWriteHarnessFile.mockRejectedValueOnce("disk full");
    fireEvent.click(screen.getByRole("button", { name: "Write harness.yaml" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't write harness.yaml");
    expect(screen.getByTestId("fake-editor-readonly")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("Profile editor and panel side by side (AC-23)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => setCurrentProjectDir(null));
    mockReadHarnessFile.mockResolvedValue({ found: true, content: PERSONAL, path: "~/.claude/harness.yaml" });
  });

  it("shows the editor and the structured panel together", async () => {
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    await waitFor(() => expect(editor).toHaveValue(PERSONAL));
    await nameField();
    expect(screen.getByRole("separator", { name: "Resize editor and panel" })).toBeInTheDocument();
  });

  it("a panel edit patches the YAML in the editor, keeping comments, and marks it unsaved", async () => {
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    const name = await nameField();
    fireEvent.change(name, { target: { value: "renamed" } });
    fireEvent.blur(name);
    expect((editor as HTMLTextAreaElement).value).toContain("name: renamed");
    expect((editor as HTMLTextAreaElement).value).toContain("# mine");
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
  });

  it("an editor edit re-reads into the panel", async () => {
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    fireEvent.change(editor, { target: { value: PERSONAL.replace("my-harness", "typed-in-editor") } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Name$/ })).toHaveValue("typed-in-editor"));
  });

  it("saves a panel edit through the same save flow", async () => {
    mockWriteHarnessFile.mockResolvedValue("~/.claude/harness.yaml");
    renderPage();
    await screen.findByTestId("fake-editor");
    const name = await nameField();
    fireEvent.change(name, { target: { value: "renamed" } });
    fireEvent.blur(name);
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
    expect(mockWriteHarnessFile.mock.calls[0][0]).toContain("name: renamed");
    expect(mockWriteHarnessFile.mock.calls[0][1]).toBe(await loadedDigest(PERSONAL));
  });

  it("Cmd+S while typing in a panel field saves with that field's draft", async () => {
    mockWriteHarnessFile.mockResolvedValue("~/.claude/harness.yaml");
    renderPage();
    await screen.findByTestId("fake-editor");
    const name = await nameField();
    name.focus();
    fireEvent.change(name, { target: { value: "typed-not-blurred" } });
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
    expect(mockWriteHarnessFile.mock.calls[0][0]).toContain("name: typed-not-blurred");
  });

  it("a panel edit made while a save is running shows in the panel afterwards", async () => {
    let finish!: (path: string) => void;
    mockWriteHarnessFile.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    const name = await nameField();
    fireEvent.change(name, { target: { value: "first" } });
    fireEvent.blur(name);
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
    const description = screen.getByRole("textbox", { name: /^Description$/ });
    fireEvent.change(description, { target: { value: "during the save" } });
    fireEvent.blur(description);
    await act(async () => finish("~/.claude/harness.yaml"));
    expect((editor as HTMLTextAreaElement).value).toContain("during the save");
    expect(screen.getByRole("textbox", { name: /^Description$/ })).toHaveValue("during the save");
    // The edit made mid-save is still unsaved.
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
  });

  it("does not replace unsaved edits when a load lands; asks, and Discard loads the disk version", async () => {
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    await nameField();
    fireEvent.change(editor, { target: { value: PERSONAL.replace("my-harness", "unsaved-name") } });
    // The project changes and comes back: the personal file is read again.
    projectFiles["/work/acme/harness.yaml"] = PERSONAL;
    act(() => setCurrentProjectDir("/work/acme"));
    await screen.findByText(/\(read-only\)/);
    act(() => setCurrentProjectDir(null));
    const notice = await screen.findByTestId("pending-disk-notice");
    expect((screen.getByTestId("fake-editor") as HTMLTextAreaElement).value).toContain("unsaved-name");
    fireEvent.click(within(notice).getByRole("button", { name: /Discard edits/ }));
    await waitFor(() => expect((screen.getByTestId("fake-editor") as HTMLTextAreaElement).value).toBe(PERSONAL));
    expect(screen.queryByTestId("pending-disk-notice")).toBeNull();
  });

  it("says when the YAML does not parse instead of showing a stale panel", async () => {
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    fireEvent.change(editor, { target: { value: "a: [unclosed" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't parse harness.yaml");
    expect(screen.queryByRole("textbox", { name: /^Name$/ })).toBeNull();
  });
});

describe("Profile tabs (AC-24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => setCurrentProjectDir(null));
    mockReadHarnessFile.mockResolvedValue({ found: true, content: PERSONAL, path: "~/.claude/harness.yaml" });
  });

  // The app's shape: one route for both tabs, inside a boundary keyed as AppLayout keys it.
  function Shell() {
    const { pathname } = useLocation();
    return (
      <PageBoundary locationKey={pageBoundaryKey(pathname)}>
        <Outlet />
      </PageBoundary>
    );
  }

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/harness/file/*" element={<HarnessFilePage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it("switching tabs keeps the page mounted, so unsaved edits survive", async () => {
    renderAt("/harness/file");
    const editor = await screen.findByTestId("fake-editor");
    fireEvent.change(editor, { target: { value: PERSONAL.replace("my-harness", "unsaved-name") } });
    fireEvent.click(screen.getByRole("tab", { name: "Compile to project" }));
    expect(await screen.findByRole("button", { name: "Preview Changes" })).toBeInTheDocument();
    expect(screen.getByTestId("compile-unsaved-note")).toHaveTextContent("unsaved edits");
    fireEvent.click(screen.getByRole("tab", { name: "harness.yaml" }));
    expect((await screen.findByTestId("fake-editor") as HTMLTextAreaElement).value).toContain("unsaved-name");
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
  });

  it("the Compile tab has no unsaved note when nothing is unsaved", async () => {
    renderAt("/harness/file/compile");
    await screen.findByRole("button", { name: "Preview Changes" });
    expect(screen.queryByTestId("compile-unsaved-note")).toBeNull();
  });

  it("selects harness.yaml on /harness/file and Compile to project on its own route", async () => {
    const view = renderAt("/harness/file");
    expect(await screen.findByRole("tab", { name: "harness.yaml" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Compile to project" })).toHaveAttribute("aria-selected", "false");
    view.unmount();
    renderAt("/harness/file/compile");
    expect(await screen.findByRole("tab", { name: "Compile to project" })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking Compile to project shows the compile form in place of the editor", async () => {
    renderAt("/harness/file");
    await screen.findByTestId("fake-editor");
    fireEvent.click(screen.getByRole("tab", { name: "Compile to project" }));
    expect(await screen.findByRole("button", { name: "Preview Changes" })).toBeInTheDocument();
    expect(screen.queryByTestId("fake-editor")).toBeNull();
  });
});

describe("Profile Share (AC-25)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(projectFiles)) delete projectFiles[key];
    mockGrantProjectScope.mockResolvedValue(undefined);
    act(() => setCurrentProjectDir(null));
  });

  it("is in the header once a harness.yaml is loaded, and opens the sheet", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: PERSONAL, path: "~/.claude/harness.yaml" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    expect(await screen.findByRole("dialog", { name: "Share this profile" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agent prompt" })).toBeInTheDocument();
  });

  it("is disabled, with the reason, when harness.yaml exists but is empty", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: "", path: "~/.claude/harness.yaml" });
    renderPage();
    const share = await screen.findByRole("button", { name: "Share" });
    expect(share).toBeDisabled();
    expect(share).toHaveAccessibleDescription(/is empty/);
  });

  it("is also offered for a project's team baseline", async () => {
    projectFiles["/work/acme/harness.yaml"] = PERSONAL;
    act(() => setCurrentProjectDir("/work/acme"));
    renderPage();
    expect(await screen.findByRole("button", { name: "Share" })).toBeEnabled();
  });

  it("is not offered with no harness.yaml", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
    renderPage();
    await screen.findByText("No harness.yaml found");
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("is disabled, with the reason, while the YAML does not parse", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: PERSONAL, path: "~/.claude/harness.yaml" });
    renderPage();
    fireEvent.change(await screen.findByTestId("fake-editor"), { target: { value: "a: [unclosed" } });
    const share = screen.getByRole("button", { name: "Share" });
    expect(share).toBeDisabled();
    expect(share).toHaveAccessibleDescription(/does not parse/);
  });
});

describe("Profile editor: adversarial-review regressions", () => {
  const EXTERNAL = PERSONAL.replace("my-harness", "external-name");
  const ENV_FILE = 'version: "2"\nmetadata:\n  name: my-harness\nenv:\n  - name: AAA\n    description: first\n  - name: BBB\n    description: second\n';

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(projectFiles)) delete projectFiles[key];
    act(() => setCurrentProjectDir(null));
    mockReadHarnessFile.mockResolvedValue({ found: true, content: PERSONAL, path: "~/.claude/harness.yaml" });
  });

  // The project changes and comes back: the personal file is read again.
  async function reloadFromDisk() {
    projectFiles["/work/acme/harness.yaml"] = PERSONAL;
    act(() => setCurrentProjectDir("/work/acme"));
    await screen.findByText(/\(read-only\)/);
    act(() => setCurrentProjectDir(null));
  }

  it("Save while a changed disk version is pending sends the digest of the text the buffer was synced with", async () => {
    mockWriteHarnessFile.mockRejectedValue("Refusing to write 'x': it changed on disk since it was read");
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    await nameField();
    fireEvent.change(editor, { target: { value: PERSONAL.replace("my-harness", "unsaved-name") } });
    mockReadHarnessFile.mockResolvedValue({ found: true, content: EXTERNAL, path: "~/.claude/harness.yaml" });
    await reloadFromDisk();
    await screen.findByTestId("pending-disk-notice");
    expect(screen.getByTestId("pending-disk-notice")).toHaveTextContent(/will not overwrite/i);
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
    expect(mockWriteHarnessFile.mock.calls[0][1]).toBe(await loadedDigest(PERSONAL));
    expect(mockWriteHarnessFile.mock.calls[0][1]).not.toBe(await loadedDigest(EXTERNAL));
    expect(await screen.findByRole("button", { name: "Reload from disk" })).toBeInTheDocument();
  });

  it("Discard edits clears the panel debounce so a stale keystroke does not overwrite the panel", async () => {
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    await nameField();
    fireEvent.change(editor, { target: { value: PERSONAL.replace("my-harness", "first-edit") } });
    mockReadHarnessFile.mockResolvedValue({ found: true, content: EXTERNAL, path: "~/.claude/harness.yaml" });
    await reloadFromDisk();
    const notice = await screen.findByTestId("pending-disk-notice");
    fireEvent.change(screen.getByTestId("fake-editor"), { target: { value: PERSONAL.replace("my-harness", "late-keystroke") } });
    fireEvent.click(within(notice).getByRole("button", { name: /Discard edits/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(screen.getByRole("textbox", { name: /^Name$/ })).toHaveValue("external-name");
  });

  it("a failed Reload from disk does not let a later unrelated load discard unsaved edits", async () => {
    mockWriteHarnessFile.mockRejectedValue("Refusing to write 'x': it changed on disk since it was read");
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    await nameField();
    fireEvent.change(editor, { target: { value: PERSONAL.replace("my-harness", "unsaved-name") } });
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    mockReadHarnessFile.mockReset();
    mockReadHarnessFile.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(await screen.findByRole("button", { name: "Reload from disk" }));
    await screen.findByText("Couldn't read harness.yaml");
    mockReadHarnessFile.mockResolvedValue({ found: true, content: EXTERNAL, path: "~/.claude/harness.yaml" });
    await reloadFromDisk();
    expect((await screen.findByTestId("fake-editor") as HTMLTextAreaElement).value).toContain("unsaved-name");
    expect(await screen.findByTestId("pending-disk-notice")).toBeInTheDocument();
  });

  it("a panel remove right after an editor edit that shifts the list removes the intended entry", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: ENV_FILE, path: "~/.claude/harness.yaml" });
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    await screen.findByRole("button", { name: "Remove variable AAA" });
    const shifted = ENV_FILE.replace("env:\n", "env:\n  - name: NEW\n    description: inserted\n");
    fireEvent.change(editor, { target: { value: shifted } });
    fireEvent.click(screen.getByRole("button", { name: "Remove variable AAA" }));
    const value = (screen.getByTestId("fake-editor") as HTMLTextAreaElement).value;
    expect(value).not.toContain("AAA");
    expect(value).toContain("NEW");
    expect(value).toContain("BBB");
  });

  it("a second save sent before the page re-renders is ignored", async () => {
    mockWriteHarnessFile.mockReturnValue(new Promise(() => {}));
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    await nameField();
    fireEvent.change(editor, { target: { value: PERSONAL.replace("my-harness", "edited") } });
    const press = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, cancelable: true }));
    press();
    press();
    // Save awaits the digest before writing: wait for the first write, then
    // give a second one every chance to arrive.
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1);
  });

  for (const [label, content] of [
    ["env as a scalar", "env: foo\n"],
    ["env holding null", "env: [null]\n"],
    ["a numeric metadata.name", "metadata:\n  name: 123\n"],
    ["a list root", "- a\n- b\n"],
  ] as const) {
    it(`Share does not take down the page for ${label}`, async () => {
      mockReadHarnessFile.mockResolvedValue({ found: true, content, path: "~/.claude/harness.yaml" });
      renderPage();
      const editor = await screen.findByTestId("fake-editor");
      fireEvent.change(editor, { target: { value: `${content}# unsaved\n` } });
      const share = await screen.findByRole("button", { name: "Share" });
      if (!(share as HTMLButtonElement).disabled) fireEvent.click(share);
      await act(async () => {});
      expect((screen.getByTestId("fake-editor") as HTMLTextAreaElement).value).toBe(`${content}# unsaved\n`);
    });
  }
});

describe("Profile keeps unsaved edits when the page unmounts", () => {
  const EXTERNAL = PERSONAL.replace("my-harness", "external-name");
  const EDITED = PERSONAL.replace("my-harness", "unsaved-name");

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(projectFiles)) delete projectFiles[key];
    act(() => setCurrentProjectDir(null));
    mockReadHarnessFile.mockResolvedValue({ found: true, content: PERSONAL, path: "~/.claude/harness.yaml" });
  });

  function profileDraftCount() {
    return getProfileDraft("~/.claude/harness.yaml") ? 1 : 0;
  }

  async function editThenLeave() {
    const view = renderPage();
    fireEvent.change(await screen.findByTestId("fake-editor"), { target: { value: EDITED } });
    expect(profileDraftCount()).toBe(1);
    view.unmount();
  }

  it("restores the edits, in the editor and the panel, after leaving and coming back", async () => {
    await editThenLeave();
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    await waitFor(() => expect((editor as HTMLTextAreaElement).value).toBe(EDITED));
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Name$/ })).toHaveValue("unsaved-name"));
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-disk-notice")).toBeNull();
  });

  it("a save clears the draft", async () => {
    mockWriteHarnessFile.mockResolvedValue("~/.claude/harness.yaml");
    await editThenLeave();
    renderPage();
    await waitFor(() => expect((screen.getByTestId("fake-editor") as HTMLTextAreaElement).value).toBe(EDITED));
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(profileDraftCount()).toBe(0));
  });

  it("typing back to the synced text clears the draft", async () => {
    renderPage();
    const editor = await screen.findByTestId("fake-editor");
    fireEvent.change(editor, { target: { value: EDITED } });
    expect(profileDraftCount()).toBe(1);
    fireEvent.change(editor, { target: { value: PERSONAL } });
    expect(profileDraftCount()).toBe(0);
  });

  it("Discard edits clears the draft", async () => {
    await editThenLeave();
    mockReadHarnessFile.mockResolvedValue({ found: true, content: EXTERNAL, path: "~/.claude/harness.yaml" });
    renderPage();
    const notice = await screen.findByTestId("pending-disk-notice");
    fireEvent.click(within(notice).getByRole("button", { name: /Discard edits/ }));
    await waitFor(() => expect((screen.getByTestId("fake-editor") as HTMLTextAreaElement).value).toBe(EXTERNAL));
    expect(profileDraftCount()).toBe(0);
  });

  it("a draft synced to older text than the disk shows the notice, and Save sends the synced text's digest", async () => {
    mockWriteHarnessFile.mockRejectedValue("Refusing to write 'x': it changed on disk since it was read");
    await editThenLeave();
    mockReadHarnessFile.mockResolvedValue({ found: true, content: EXTERNAL, path: "~/.claude/harness.yaml" });
    renderPage();
    await screen.findByTestId("pending-disk-notice");
    expect((screen.getByTestId("fake-editor") as HTMLTextAreaElement).value).toBe(EDITED);
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(mockWriteHarnessFile).toHaveBeenCalledTimes(1));
    expect(mockWriteHarnessFile.mock.calls[0][1]).toBe(await loadedDigest(PERSONAL));
    expect(mockWriteHarnessFile.mock.calls[0][1]).not.toBe(await loadedDigest(EXTERNAL));
  });

  it("the read-only team baseline never uses the store", async () => {
    await editThenLeave();
    projectFiles["/work/acme/harness.yaml"] = PERSONAL;
    act(() => setCurrentProjectDir("/work/acme"));
    renderPage();
    await screen.findByText(/\(read-only\)/);
    expect(getProfileDraft("~/.claude/harness.yaml")?.buffer).toBe(EDITED);
    expect(screen.queryByTestId("fake-editor")).toBeNull();
    act(() => setCurrentProjectDir(null));
  });
});
