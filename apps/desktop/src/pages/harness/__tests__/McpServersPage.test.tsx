import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import McpServersPage from "../McpServersPage";
import digestFixture from "../../../lib/__tests__/fixtures/precondition-digest.json";

// ── In-memory home directory behind the Tauri calls ─────────────

const HOME = "/home/user";
const files = new Map<string, string>();
let storePath = ".claude.json";

type WriteArgs = { files: Array<{ relativePath: string; content: string | null; expectedSha256?: string }> };

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

// Behaves like the Rust command, precondition included: a stale
// expectedSha256 is refused with the same phrase the Rust error uses.
const mockInvoke = vi.fn(async (command: string, args: WriteArgs) => {
  if (command !== "apply_surface_transaction") throw new Error(`unexpected command ${command}`);
  for (const file of args.files) {
    if (file.expectedSha256 === undefined) continue;
    const current = files.get(`${HOME}/${file.relativePath}`);
    const actual = current === undefined ? "absent" : sha256(current);
    if (actual !== file.expectedSha256) {
      throw `Refusing to write '${file.relativePath}': it changed on disk since it was read (expected ${file.expectedSha256}, found ${actual})`;
    }
  }
  for (const file of args.files) {
    if (file.content === null) files.delete(`${HOME}/${file.relativePath}`);
    else files.set(`${HOME}/${file.relativePath}`, file.content);
  }
  return args.files.map((file) => `${HOME}/${file.relativePath}`);
});
const mockExists = vi.fn(async (path: string) => files.has(path));
const mockReadTextFile = vi.fn(async (path: string) => {
  const content = files.get(path);
  if (content === undefined) throw new Error(`ENOENT ${path}`);
  return content;
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: never) => mockInvoke(command, args),
}));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => HOME }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: (path: string) => mockExists(path),
  readTextFile: (path: string) => mockReadTextFile(path),
}));

// The registry in force. Tests move the store to prove the page follows it
// rather than a hard-coded path.
vi.mock("../../../lib/definitions", () => ({
  resolveDesktopDefinitions: vi.fn(async () => ({
    source: "snapshot",
    surfaces: [
      {
        id: "claude-code",
        label: "Claude Code",
        family: "claude",
        detect: [],
        notApplicable: [],
        stores: [
          { kind: "mcp-server", scope: "project", formatId: "json-mcpservers", path: ".mcp.json" },
          { kind: "mcp-server", scope: "user", formatId: "json-mcpservers", path: storePath },
        ],
      },
    ],
  })),
}));
vi.mock("../../machine/machine-data", () => ({ detectDesktopPlatform: () => "darwin" }));

vi.mock("../../../components/plugin-explorer/MonacoEditor", () => ({
  default: ({ content, onChange }: { content: string; onChange: (value: string) => void }) => (
    <textarea data-testid="monaco-editor" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
}));

function renderPage() {
  return render(<MemoryRouter><McpServersPage /></MemoryRouter>);
}

function writtenJson(path = `${HOME}/.claude.json`) {
  return JSON.parse(files.get(path)!);
}

const STDIO = {
  type: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
  timeout: 30,
};

describe("McpServersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    files.clear();
    storePath = ".claude.json";
  });

  it("reads the store path the surface registry declares, not a hard-coded one", async () => {
    storePath = ".config/claude/state.json";
    files.set(`${HOME}/.config/claude/state.json`, JSON.stringify({ mcpServers: { github: STDIO } }));
    renderPage();

    expect(await screen.findByText("GitHub")).toBeInTheDocument();
    expect(mockReadTextFile).toHaveBeenCalledWith(`${HOME}/.config/claude/state.json`);
    expect(mockReadTextFile).not.toHaveBeenCalledWith(`${HOME}/.claude/mcp.json`);
    expect(screen.getByTestId("mcp-store-path")).toHaveTextContent("~/.config/claude/state.json");
  });

  it("shows the teaching empty state with Add server when the store does not exist", async () => {
    renderPage();

    expect(await screen.findByText("No MCP servers yet")).toBeInTheDocument();
    expect(screen.getByText(/gives Claude Code extra tools/)).toBeInTheDocument();
    expect(screen.getByText(/~\/\.claude\.json doesn't exist yet/)).toBeInTheDocument();
    expect(mockExists).toHaveBeenCalledWith(`${HOME}/.claude.json`);

    fireEvent.click(screen.getByRole("button", { name: /add server/i }));
    expect(await screen.findByRole("dialog", { name: "Add MCP server" })).toBeInTheDocument();
  });

  it("says what failed and offers a retry when the file can't be read", async () => {
    mockExists.mockRejectedValueOnce(new Error("forbidden path: /home/user/.claude.json"));
    renderPage();

    expect(await screen.findByText("Couldn't read ~/.claude.json.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't read ~/.claude.json.");
    // The raw error waits behind Details (AC-20), outside the live region so
    // opening it does not re-announce the notice.
    expect(screen.getByRole("alert")).not.toHaveTextContent("forbidden path");
    const raw = screen.getByText("forbidden path: /home/user/.claude.json");
    expect(raw).not.toBeVisible();
    fireEvent.click(screen.getByText("Details"));
    expect(raw).toBeVisible();
    // An unreadable file must not look like an empty one.
    expect(screen.queryByText("No MCP servers yet")).not.toBeInTheDocument();
  });

  it("adds a server through the form and keeps every other key in the file", async () => {
    files.set(`${HOME}/.claude.json`, `${JSON.stringify({ numStartups: 5, projects: { "/p": { a: 1 } }, mcpServers: {} }, null, 2)}\n`);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /add server/i }));
    const dialog = await screen.findByRole("dialog");

    // Required fields are checked inline before anything is written.
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Enter a name for this server.")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the command that starts the server.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "github" } });
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "npx" } });
    fireEvent.change(within(dialog).getByLabelText("Arguments"), {
      target: { value: "-y\n@modelcontextprotocol/server-github" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke.mock.calls[0][1].files[0].relativePath).toBe(".claude.json");
    const doc = writtenJson();
    expect(doc.numStartups).toBe(5);
    expect(doc.projects).toEqual({ "/p": { a: 1 } });
    expect(doc.mcpServers.github).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
    });
    expect(await screen.findByText("GitHub")).toBeInTheDocument();
  });

  it("edits one field and leaves the rest of the entry alone", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ userID: "u", mcpServers: { github: STDIO } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    const command = within(dialog).getByLabelText("Command");
    expect(command).toHaveValue("npx");
    fireEvent.change(command, { target: { value: "bunx" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    const doc = writtenJson();
    expect(doc.userID).toBe("u");
    expect(doc.mcpServers.github).toEqual({ ...STDIO, command: "bunx" });
  });

  it("asks for confirmation before deleting a server", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ userID: "u", mcpServers: { github: STDIO, other: { type: "http", url: "https://x.test/mcp" } } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Delete github" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete github?" });
    expect(mockInvoke).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete server" }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    const doc = writtenJson();
    expect(Object.keys(doc.mcpServers)).toEqual(["other"]);
    expect(doc.userID).toBe("u");
  });

  it("refuses to save over MCP servers someone else changed since the page loaded", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO, added: { command: "x" } } }));
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "bunx" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText(/changed since this page loaded/)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("keeps the raw JSON view, showing only the servers object", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ userID: "secret-ish", mcpServers: { github: STDIO } }));
    renderPage();

    await screen.findByText("GitHub");
    fireEvent.click(screen.getByRole("button", { name: "Raw JSON" }));
    const editor = (await screen.findByTestId("monaco-editor")) as HTMLTextAreaElement;
    expect(editor.value).toContain('"github"');
    expect(editor.value).not.toContain("userID");
  });

  // ── Refusing to write what it can't read safely ──────────────────

  it("refuses to show or write a file that isn't valid JSON", async () => {
    files.set(`${HOME}/.claude.json`, '{ "mcpServers": { "github": ');
    renderPage();

    expect(await screen.findByText(/is not valid JSON/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add server/i })).not.toBeInTheDocument();
    expect(screen.queryByText("No MCP servers yet")).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it.each([
    ["an array", []],
    ["a string", "github"],
    ["a number", 3],
  ])("treats mcpServers as %s as invalid, never as empty, so Add can't replace it", async (_label, value) => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: value }));
    renderPage();

    expect(await screen.findByText(/mcpServers in ~\/\.claude\.json is not a JSON object/)).toBeInTheDocument();
    expect(screen.queryByText("No MCP servers yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add server/i })).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // ── What a save writes ────────────────────────────────────────────

  it("switching stdio to http drops command, args and env and writes type and url", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Type"), { target: { value: "http" } });
    fireEvent.change(within(dialog).getByLabelText("URL"), { target: { value: "https://api.example.test/mcp" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    // timeout is not a form key, so it rides along; the stdio keys do not.
    expect(writtenJson().mcpServers.github).toEqual({ timeout: 30, type: "http", url: "https://api.example.test/mcp" });
  });

  it.each([
    ["keeps a trailing newline the file had", `${JSON.stringify({ mcpServers: {} })}\n`, true],
    ["adds none the file didn't have", JSON.stringify({ mcpServers: {} }), false],
  ])("%s", async (_label, original, endsWithNewline) => {
    files.set(`${HOME}/.claude.json`, original);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /add server/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "x" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(files.get(`${HOME}/.claude.json`)!.endsWith("\n")).toBe(endsWithNewline);
  });

  it("gives a new file a trailing newline", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add server/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "x" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(files.get(`${HOME}/.claude.json`)!.endsWith("}\n")).toBe(true);
    expect(mockInvoke.mock.calls[0][1].files[0].expectedSha256).toBe("absent");
  });

  it("keeps entries that aren't server objects through a form save", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO, legacy: "disabled" } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "bunx" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(writtenJson().mcpServers.legacy).toBe("disabled");
  });

  it("keeps entries that aren't server objects through a Raw JSON save, and says so", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO, legacy: "disabled" } }));
    renderPage();

    await screen.findByText("GitHub");
    fireEvent.click(screen.getByRole("button", { name: "Raw JSON" }));
    const editor = (await screen.findByTestId("monaco-editor")) as HTMLTextAreaElement;
    expect(editor.value).not.toContain("legacy");
    expect(screen.getByRole("note")).toHaveTextContent(/Not shown: legacy/);

    const next = JSON.parse(editor.value);
    next.github.command = "bunx";
    fireEvent.change(editor, { target: { value: JSON.stringify(next, null, 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    const doc = writtenJson();
    expect(doc.mcpServers.github.command).toBe("bunx");
    expect(doc.mcpServers.legacy).toBe("disabled");
  });

  it("keeps non-server entries named toString and __proto__ through a Raw JSON save", async () => {
    // Written as text: an object literal can't carry an own "__proto__" key.
    files.set(
      `${HOME}/.claude.json`,
      `{"mcpServers":{"github":${JSON.stringify(STDIO)},"toString":"x","__proto__":"y","constructor":1}}`,
    );
    renderPage();

    await screen.findByText("GitHub");
    fireEvent.click(screen.getByRole("button", { name: "Raw JSON" }));
    const editor = (await screen.findByTestId("monaco-editor")) as HTMLTextAreaElement;
    expect(screen.getByRole("note")).toHaveTextContent(/toString/);
    expect(screen.getByRole("note")).toHaveTextContent(/__proto__/);

    const next = JSON.parse(editor.value);
    next.github.command = "bunx";
    fireEvent.change(editor, { target: { value: JSON.stringify(next, null, 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    // Own entries only: doc.mcpServers.__proto__ would read the prototype.
    const servers: Record<string, any> = Object.fromEntries(Object.entries(writtenJson().mcpServers));
    expect(Object.keys(servers).sort()).toEqual(["__proto__", "constructor", "github", "toString"]);
    expect(Object.getOwnPropertyDescriptor(servers, "__proto__")?.value).toBe("y");
    expect(servers.toString).toBe("x");
    expect(servers.constructor).toBe(1);
    expect(servers.github.command).toBe("bunx");
  });

  it("a Raw JSON parse error keeps the draft and offers Back to editing, not Reload", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO } }));
    renderPage();

    await screen.findByText("GitHub");
    fireEvent.click(screen.getByRole("button", { name: "Raw JSON" }));
    const editor = (await screen.findByTestId("monaco-editor")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '{ "github": ' } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That JSON doesn't parse, so nothing was saved.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));

    expect(screen.queryByText("That JSON doesn't parse, so nothing was saved.")).not.toBeInTheDocument();
    expect((screen.getByTestId("monaco-editor") as HTMLTextAreaElement).value).toBe('{ "github": ');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // ── The on-disk precondition ──────────────────────────────────────

  it("sends the sha256 of the exact text it re-read at save time", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ numStartups: 1, mcpServers: { github: STDIO } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    // Claude Code rewrites another key after the page loaded: the save must
    // hash THIS text, not the one it loaded.
    const rewritten = `${JSON.stringify({ numStartups: 2, mcpServers: { github: STDIO } }, null, 2)}\n`;
    files.set(`${HOME}/.claude.json`, rewritten);
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "bunx" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke.mock.calls[0][1].files[0].expectedSha256).toBe(sha256(rewritten));
    expect(writtenJson().numStartups).toBe(2);
  });

  // readTextFile is TextDecoder("utf-8") over the bytes, so the page only
  // ever sees decoded text. The fixture's sha256 is what the Rust rule
  // computes for the same bytes (checked in surface_write.rs).
  it.each(["bom", "invalid-utf8"])(
    "sends the digest the Rust rule computes for the %s fixture",
    async (name) => {
      const fixture = digestFixture.cases.find((c) => c.name === name)!;
      const bytes = Uint8Array.from(fixture.bytesHex.match(/../g)!, (h) => parseInt(h, 16));
      const decoded = new TextDecoder("utf-8").decode(bytes);
      expect(decoded).toBe(fixture.text);
      files.set(`${HOME}/.claude.json`, decoded);
      renderPage();

      fireEvent.click(await screen.findByRole("button", { name: /add server/i }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "github" } });
      fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "npx" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
      expect(mockInvoke.mock.calls[0][1].files[0].expectedSha256).toBe(fixture.sha256);
      expect(writtenJson().mcpServers.github.command).toBe("npx");
    },
  );

  it("says the file changed while editing when the Rust precondition refuses", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    // Claude Code writes between the page's re-read and the rename.
    mockInvoke.mockImplementationOnce(async () => {
      throw "Refusing to write '.claude.json': it changed on disk since it was read (expected aa, found bb)";
    });
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "bunx" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("~/.claude.json changed while you were editing. Reload and try again."))
      .toBeInTheDocument();
    const reloads = within(dialog).getAllByRole("button", { name: "Reload" });
    expect(reloads).toHaveLength(1);
  });

  // ── Form fields ──────────────────────────────────────────────────

  it("masks env values until revealed, per row", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: { ...STDIO, env: { A: "1", B: "2" } } } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    const first = within(dialog).getByLabelText("Environment variable 1 value");
    const second = within(dialog).getByLabelText("Environment variable 2 value");
    expect(first).toHaveAttribute("type", "password");
    expect(second).toHaveAttribute("type", "password");

    fireEvent.click(within(dialog).getByRole("button", { name: "Show environment variable 1 value" }));
    expect(first).toHaveAttribute("type", "text");
    expect(second).toHaveAttribute("type", "password");
    expect(within(dialog).getByRole("button", { name: "Hide environment variable 1 value" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("flags a duplicate env name inline and does not save", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: { ...STDIO, env: { TOKEN: "a" } } } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add environment variable" }));
    fireEvent.change(within(dialog).getByLabelText("Environment variable 2 name"), { target: { value: "TOKEN" } });

    const secondName = within(dialog).getByLabelText("Environment variable 2 name");
    expect(secondName).toHaveAttribute("aria-invalid", "true");
    expect(secondName).toHaveAccessibleDescription("TOKEN is used more than once. Each name can appear once.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    // A save that got through would re-read the file first; give it the time.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockReadTextFile).toHaveBeenCalledTimes(1);
  });
});
