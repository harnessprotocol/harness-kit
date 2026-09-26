import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import McpServersPage from "../McpServersPage";

// ── In-memory home directory behind the Tauri calls ─────────────

const HOME = "/home/user";
const files = new Map<string, string>();
let storePath = ".claude.json";

type WriteArgs = { files: Array<{ relativePath: string; content: string | null; expectedSha256?: string }> };

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

// Behaves like the Rust command, precondition included: a stale
// expectedSha256 is refused with the same phrase the Rust error uses.
const recorded: unknown[] = [];
let ledgerFails = false;
const rustCommand = async (command: string, args: WriteArgs) => {
  if (command === "record_transaction") {
    if (ledgerFails) throw "ledger unavailable";
    recorded.push((args as unknown as { record: unknown }).record);
    return null;
  }
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
};
const mockInvoke = vi.fn(rustCommand);
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
  // The engine's provider also probes for symlinks. Nothing here is one, and
  // it never writes through the plugin (Rust does).
  lstat: async () => ({ isDirectory: false, isSymlink: false }),
  writeTextFile: async () => {
    throw new Error("the webview must not write directly");
  },
  rename: async () => {
    throw new Error("the webview must not rename directly");
  },
  remove: async () => {
    throw new Error("the webview must not remove directly");
  },
  mkdir: async () => {},
  readDir: async () => [],
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

/** Writes to the store file itself. The engine also writes a backup and a
 *  manifest through the same command, so counting raw calls says nothing. */
function storeWrites(path = ".claude.json") {
  return mockInvoke.mock.calls
    .filter(([command]) => command === "apply_surface_transaction")
    .flatMap(([, args]) => (args as WriteArgs).files)
    .filter((file) => file.relativePath === path);
}

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
    mockInvoke.mockImplementation(rustCommand);
    files.clear();
    recorded.length = 0;
    ledgerFails = false;
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
    expect(screen.getByText("Details")).toBeInTheDocument();
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

    await waitFor(() => expect(storeWrites()).toHaveLength(1));
    expect(storeWrites()[0].relativePath).toBe(".claude.json");
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

    await waitFor(() => expect(storeWrites()).toHaveLength(1));
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
    await waitFor(() => expect(storeWrites()).toHaveLength(1));
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

    await waitFor(() => expect(storeWrites()).toHaveLength(1));
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

    await waitFor(() => expect(storeWrites()).toHaveLength(1));
    expect(files.get(`${HOME}/.claude.json`)!.endsWith("\n")).toBe(endsWithNewline);
  });

  it("gives a new file a trailing newline", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add server/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "x" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(storeWrites()).toHaveLength(1));
    expect(files.get(`${HOME}/.claude.json`)!.endsWith("}\n")).toBe(true);
    expect(storeWrites()[0].expectedSha256).toBe("absent");
  });

  it("keeps entries that aren't server objects through a form save", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO, legacy: "disabled" } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Command"), { target: { value: "bunx" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(storeWrites()).toHaveLength(1));
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

    await waitFor(() => expect(storeWrites()).toHaveLength(1));
    const doc = writtenJson();
    expect(doc.mcpServers.github.command).toBe("bunx");
    expect(doc.mcpServers.legacy).toBe("disabled");
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

    await waitFor(() => expect(storeWrites()).toHaveLength(1));
    expect(storeWrites()[0].expectedSha256).toBe(sha256(rewritten));
    expect(writtenJson().numStartups).toBe(2);
  });

  it("says the file changed while editing when the Rust precondition refuses", async () => {
    files.set(`${HOME}/.claude.json`, JSON.stringify({ mcpServers: { github: STDIO } }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit github" }));
    const dialog = await screen.findByRole("dialog");
    // Claude Code writes between the page's re-read and the rename.
    const rust = rustCommand;
    mockInvoke.mockImplementation(async (command: string, args: WriteArgs) => {
      if (args.files?.some((file) => file.relativePath === ".claude.json")) {
        throw "Refusing to write '.claude.json': it changed on disk since it was read (expected aa, found bb)";
      }
      return rust(command, args);
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

describe("writeMcpServers on the transaction engine", () => {
  const original = `${JSON.stringify({ numStartups: 3, mcpServers: { github: STDIO } }, null, 2)}\n`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(rustCommand);
    files.clear();
    recorded.length = 0;
    ledgerFails = false;
    storePath = ".claude.json";
  });

  async function save(update: (current: Record<string, unknown>) => Record<string, unknown>) {
    const { locateClaudeMcpStore, readMcpStore, writeMcpServers } = await import("../../../lib/mcp-store");
    const snapshot = await readMcpStore(await locateClaudeMcpStore());
    return writeMcpServers(snapshot.location, snapshot.entries, update);
  }

  it("backs the file up before writing and records a rollback point", async () => {
    files.set(`${HOME}/.claude.json`, original);
    const outcome = await save((current) => ({ ...current, extra: { command: "x" } }));

    expect(outcome).toEqual({});
    // The preimage is a verbatim copy, under the state directory.
    const backups = [...files.entries()].filter(([path]) => path.includes("/.harness/backups/") && path.endsWith("/.claude.json"));
    expect(backups).toHaveLength(1);
    expect(backups[0][1]).toBe(original);
    expect(JSON.parse(files.get(`${HOME}/.claude.json`)!).mcpServers.extra).toEqual({ command: "x" });
    const manifest = [...files.entries()].find(([path]) => path.endsWith("/transaction.json"))!;
    expect(JSON.parse(manifest[1]).status).toBe("committed");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      roots: ["home"],
      manifestRoot: HOME,
      surfaces: ["claude-code"],
      kinds: ["mcp-server"],
      identityKeys: ["mcp-server:extra"],
    });
  });

  it("never sends a temp path to the Rust command", async () => {
    files.set(`${HOME}/.claude.json`, original);
    await save((current) => ({ ...current, extra: {} }));
    const paths = mockInvoke.mock.calls.flatMap(([, args]) => (args as WriteArgs).files?.map((f) => f.relativePath) ?? []);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((path) => path.includes("harness-tmp"))).toEqual([]);
  });

  it("reports a ledger failure without failing the save", async () => {
    files.set(`${HOME}/.claude.json`, original);
    ledgerFails = true;
    const outcome = await save((current) => ({ ...current, extra: {} }));
    expect(outcome.ledgerError).toContain("ledger unavailable");
    expect(JSON.parse(files.get(`${HOME}/.claude.json`)!).mcpServers.extra).toEqual({});
  });

  it("restores the file and records nothing when the destination write fails", async () => {
    files.set(`${HOME}/.claude.json`, original);
    const rust = rustCommand;
    let failed = false;
    mockInvoke.mockImplementation(async (command: string, args: WriteArgs) => {
      const file = args.files?.find((entry) => entry.relativePath === ".claude.json");
      if (file && file.content !== original && !failed) {
        failed = true;
        throw "disk full";
      }
      return rust(command, args);
    });

    await expect(save((current) => ({ ...current, extra: {} }))).rejects.toMatchObject({ kind: "write" });
    expect(files.get(`${HOME}/.claude.json`)).toBe(original);
    expect(recorded).toEqual([]);
  });
});
