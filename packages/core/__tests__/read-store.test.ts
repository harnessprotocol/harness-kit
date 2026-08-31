import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readStore } from "../src/observe/read-store.js";
import type { StoreReadResult } from "../src/observe/read-store.js";
import type { ConfigStore } from "../src/surfaces/types.js";
import { getSurface } from "../src/surfaces/registry.js";
import { loadFixtureProject } from "./helpers/load-fixture-tree.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "..", "fixtures", "observe");
const HOME = "/home/user";

/** Seed a MockFsProvider from fixtures/observe/<name>/, rooted at $HOME. */
function fixtureFs(name: string): MockFsProvider {
  return loadFixtureProject(resolve(FIXTURES_DIR, name), HOME, HOME);
}

function store(surfaceId: Parameters<typeof getSurface>[0], predicate: (s: ConfigStore) => boolean): ConfigStore {
  const found = getSurface(surfaceId).stores.find(predicate);
  if (!found) throw new Error(`no matching store on surface ${surfaceId}`);
  return found;
}

function expectEmpty(result: StoreReadResult): void {
  expect(result.entries).toEqual([]);
  expect(result.skipped).toEqual([]);
}

describe("readStore: json-mcpservers", () => {
  it("reads claude-desktop's claude_desktop_config.json into MCP entries with provenance", async () => {
    const fs = fixtureFs("claude-desktop");
    const configStore = store("claude-desktop", (s) => s.kind === "mcp-server");
    const path = `${HOME}/Library/Application Support/Claude/claude_desktop_config.json`;

    const result = await readStore(fs, configStore, path);

    expect(result.skipped).toEqual([]);
    expect(result.entries).toHaveLength(2);
    const names = result.entries.map((e) => e.name).sort();
    expect(names).toEqual(["filesystem", "github"]);

    const filesystem = result.entries.find((e) => e.name === "filesystem")!;
    expect(filesystem.kind).toBe("mcp-server");
    expect(filesystem.value).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/someone/Documents"],
    });
    expect(filesystem.provenance).toEqual({ file: path, formatId: "json-mcpservers" });

    const github = result.entries.find((e) => e.name === "github")!;
    expect(github.value).toMatchObject({
      transport: "stdio",
      command: "docker",
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_FAKE1234567890" },
    });
  });

  it("reads copilot-cli's .copilot/mcp-config.json under the default mcpServers root key", async () => {
    const fs = fixtureFs("copilot-cli");
    const configStore = store("copilot-cli", (s) => s.kind === "mcp-server");
    const path = `${HOME}/.copilot/mcp-config.json`;

    const result = await readStore(fs, configStore, path);

    expect(result.skipped).toEqual([]);
    expect(result.entries.map((e) => e.name).sort()).toEqual(["docs", "playwright"]);
    const docs = result.entries.find((e) => e.name === "docs")!;
    expect(docs.value).toEqual({
      transport: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer sk-FAKE-copilot-token" },
    });
  });

  it("honors shape.rootKey for copilot-vscode's .vscode/mcp.json (servers)", async () => {
    const fs = fixtureFs("copilot-vscode");
    const configStore = store(
      "copilot-vscode",
      (s) => s.kind === "mcp-server" && s.scope === "project",
    );
    expect(configStore.shape?.rootKey).toBe("servers");
    const path = `${HOME}/.vscode/mcp.json`;

    const result = await readStore(fs, configStore, path);

    expect(result.skipped).toEqual([]);
    expect(result.entries.map((e) => e.name).sort()).toEqual(["issues", "memory"]);
    const issues = result.entries.find((e) => e.name === "issues")!;
    expect(issues.value).toEqual({ transport: "sse", url: "https://issues.example.com/sse" });
  });

  it("pinned: a servers-rootKey store pointed at a mcpServers-shaped file yields zero entries plus one skipped diagnostic", async () => {
    // Honest behavior: the file exists and clearly holds MCP servers, just
    // under the other well-known root key — silence would hide a
    // misconfiguration, so it is reported via skipped[], never guessed at.
    const fs = fixtureFs("claude-desktop");
    const configStore = store(
      "copilot-vscode",
      (s) => s.kind === "mcp-server" && s.scope === "project",
    );
    const path = `${HOME}/Library/Application Support/Claude/claude_desktop_config.json`;

    const result = await readStore(fs, configStore, path);

    expect(result.entries).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].file).toBe(path);
    expect(result.skipped[0].reason).toContain("'servers'");
    expect(result.skipped[0].reason).toContain("'mcpServers'");
  });

  it("pinned: a plainly absent root key means not-configured — empty, no skipped noise", async () => {
    const path = `${HOME}/.claude.json`;
    const fs = new MockFsProvider(
      { [path]: JSON.stringify({ numStartups: 12, theme: "dark" }) },
      "/project",
      HOME,
    );
    const configStore = store("claude-code", (s) => s.kind === "mcp-server" && s.scope === "user");

    expectEmpty(await readStore(fs, configStore, path));
  });

  it("reports malformed JSON as skipped with a human-readable reason, never throws", async () => {
    const path = `${HOME}/.claude.json`;
    const fs = new MockFsProvider({ [path]: "{ not json" }, "/project", HOME);
    const configStore = store("claude-code", (s) => s.kind === "mcp-server" && s.scope === "user");

    const result = await readStore(fs, configStore, path);
    expect(result.entries).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/JSON/);
  });

  it("records unreversible server entries in skipped[] with the server name", async () => {
    const path = `${HOME}/.claude.json`;
    const fs = new MockFsProvider(
      {
        [path]: JSON.stringify({
          mcpServers: {
            good: { command: "npx", args: ["-y", "ok-mcp"] },
            bad: { type: "quantum-entanglement" },
          },
        }),
      },
      "/project",
      HOME,
    );
    const configStore = store("claude-code", (s) => s.kind === "mcp-server" && s.scope === "user");

    const result = await readStore(fs, configStore, path);
    expect(result.entries.map((e) => e.name)).toEqual(["good"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("'bad'");
  });
});

describe("readStore: json-generic", () => {
  it("returns the parsed object as a single entry keyed by the store kind", async () => {
    const path = `${HOME}/.claude/settings.json`;
    const settings = { permissions: { allow: ["Bash(ls:*)"], deny: [] } };
    const fs = new MockFsProvider({ [path]: JSON.stringify(settings) }, "/project", HOME);
    const configStore = store("claude-code", (s) => s.kind === "permissions" && s.scope === "user");

    const result = await readStore(fs, configStore, path);

    expect(result.skipped).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].kind).toBe("permissions");
    expect(result.entries[0].name).toBe("permissions");
    expect(result.entries[0].value).toEqual(settings);
    expect(result.entries[0].provenance).toEqual({ file: path, formatId: "json-generic" });
  });

  it("reports malformed JSON as skipped", async () => {
    const path = `${HOME}/.claude/settings.json`;
    const fs = new MockFsProvider({ [path]: "]]" }, "/project", HOME);
    const configStore = store("claude-code", (s) => s.kind === "permissions" && s.scope === "user");

    const result = await readStore(fs, configStore, path);
    expect(result.entries).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/JSON/);
  });
});

describe("readStore: skills-dir", () => {
  it("enumerates <dir>/*/SKILL.md and names entries by frontmatter name", async () => {
    const fs = fixtureFs("copilot-cli");
    const configStore = store("copilot-cli", (s) => s.kind === "skill" && s.scope === "user");
    const dir = `${HOME}/.copilot/skills`;

    const result = await readStore(fs, configStore, dir);

    expect(result.skipped).toEqual([]);
    expect(result.entries).toHaveLength(2);
    // pdf-tools/ declares `name: pdf-toolkit` — frontmatter wins over the dir name.
    expect(result.entries.map((e) => e.name).sort()).toEqual(["pdf-toolkit", "web-research"]);

    const pdf = result.entries.find((e) => e.name === "pdf-toolkit")!;
    expect(pdf.kind).toBe("skill");
    expect(pdf.value).toEqual({
      name: "pdf-toolkit",
      skillPath: `${dir}/pdf-tools/SKILL.md`,
      description: "Extract text and tables from PDF files.",
    });
    expect(pdf.provenance).toEqual({ file: `${dir}/pdf-tools/SKILL.md`, formatId: "skills-dir" });
  });

  it("falls back to the directory name when frontmatter has no name", async () => {
    const dir = `${HOME}/.claude/skills`;
    const fs = new MockFsProvider(
      { [`${dir}/anon-skill/SKILL.md`]: "---\ndescription: No name given.\n---\n\nBody.\n" },
      "/project",
      HOME,
    );
    const configStore = store("claude-code", (s) => s.kind === "skill" && s.scope === "user");

    const result = await readStore(fs, configStore, dir);
    expect(result.entries.map((e) => e.name)).toEqual(["anon-skill"]);
  });
});

describe("readStore: markdown-instructions", () => {
  it("reads a single instructions file as one entry named by filename", async () => {
    const path = `${HOME}/.claude/CLAUDE.md`;
    const fs = new MockFsProvider({ [path]: "# Global rules\n\nBe terse.\n" }, "/project", HOME);
    const configStore = store(
      "claude-code",
      (s) => s.kind === "instructions" && s.scope === "user",
    );

    const result = await readStore(fs, configStore, path);

    expect(result.skipped).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("CLAUDE.md");
    expect(result.entries[0].kind).toBe("instructions");
    expect(result.entries[0].value).toEqual({ content: "# Global rules\n\nBe terse.\n" });
    expect(result.entries[0].provenance).toEqual({ file: path, formatId: "markdown-instructions" });
  });

  it("with shape.directory reads every *.md and *.mdc in .cursor/rules, one entry per file, ignoring other extensions", async () => {
    const fs = fixtureFs("cursor");
    const configStore = store("cursor", (s) => s.kind === "instructions");
    expect(configStore.shape?.directory).toBe(true);
    const dir = `${HOME}/.cursor/rules`;

    const result = await readStore(fs, configStore, dir);

    expect(result.skipped).toEqual([]);
    expect(result.entries.map((e) => e.name)).toEqual(["overview.md", "style.mdc", "testing.mdc"]);
    const style = result.entries.find((e) => e.name === "style.mdc")!;
    expect((style.value as { content: string }).content).toContain("two-space indentation");
    expect(style.provenance).toEqual({ file: `${dir}/style.mdc`, formatId: "markdown-instructions" });
  });
});

describe("readStore: absence and degradation", () => {
  it("a missing file is not-configured: empty result, no error, no skipped", async () => {
    const fs = new MockFsProvider({}, "/project", HOME);
    const mcpStore = store("claude-code", (s) => s.kind === "mcp-server" && s.scope === "user");
    const skillsStore = store("claude-code", (s) => s.kind === "skill" && s.scope === "user");
    const rulesStore = store("cursor", (s) => s.kind === "instructions");

    expectEmpty(await readStore(fs, mcpStore, `${HOME}/.claude.json`));
    expectEmpty(await readStore(fs, skillsStore, `${HOME}/.claude/skills`));
    expectEmpty(await readStore(fs, rulesStore, `${HOME}/.cursor/rules`));
  });

  it("an unknown formatId degrades to a skipped diagnostic, never a throw", async () => {
    const path = `${HOME}/.future/config.xyz`;
    const fs = new MockFsProvider({ [path]: "whatever" }, "/project", HOME);
    const futureStore = {
      kind: "mcp-server",
      scope: "user",
      formatId: "xml-futuristic",
      path: ".future/config.xyz",
    } as unknown as ConfigStore;

    const result = await readStore(fs, futureStore, path);
    expect(result.entries).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("no executor for formatId 'xml-futuristic'");
  });
});
