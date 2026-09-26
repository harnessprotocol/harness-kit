import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import McpServersPage from "../McpServersPage";

// ── In-memory home directory behind the Tauri calls ─────────────

const HOME = "/home/user";
const files = new Map<string, string>();
let storePath = ".claude.json";

const mockInvoke = vi.fn(async (command: string, args: { files: Array<{ relativePath: string; content: string | null }> }) => {
  if (command !== "apply_surface_transaction") throw new Error(`unexpected command ${command}`);
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
  default: ({ content }: { content: string }) => <div data-testid="monaco-editor">{content}</div>,
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
    const editor = await screen.findByTestId("monaco-editor");
    expect(editor).toHaveTextContent('"github"');
    expect(editor).not.toHaveTextContent("userID");
  });
});
