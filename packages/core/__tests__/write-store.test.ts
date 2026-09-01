import { describe, expect, it } from "vitest";
import { planStoreWrite } from "../src/write/write-store.js";
import type { ConfigStore } from "../src/surfaces/types.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const MCP = { transport: "stdio" as const, command: "pg-mcp", args: ["--local"] };

function store(overrides: Partial<ConfigStore>): ConfigStore {
  return {
    kind: "mcp-server",
    scope: "user",
    formatId: "json-mcpservers",
    path: ".claude.json",
    ...overrides,
  } as ConfigStore;
}

describe("store write executors (AC-12, AC-13)", () => {
  it("adds an MCP server to a JSON store, preserving sibling keys", async () => {
    const fs = new MockFsProvider({
      "/home/user/.claude.json": JSON.stringify(
        { theme: "dark", mcpServers: { github: { command: "gh-mcp" } } },
        null,
        2,
      ),
    });
    const plan = await planStoreWrite(fs, store({}), "/home/user/.claude.json", {
      kind: "mcp-server",
      name: "postgres",
      value: MCP,
    });
    expect(plan.supported).toBe(true);
    if (!plan.supported) return;
    const after = JSON.parse(plan.changes[0]!.after!);
    expect(after.theme).toBe("dark");
    expect(Object.keys(after.mcpServers).sort()).toEqual(["github", "postgres"]);
    expect(plan.changes[0]!.before).toContain("gh-mcp");
  });

  it("emits the surface's native key shape, not the portable one", async () => {
    const fs = new MockFsProvider();
    const plan = await planStoreWrite(fs, store({}), "/home/user/.claude.json", {
      kind: "mcp-server",
      name: "postgres",
      value: MCP,
    });
    if (!plan.supported) throw new Error("expected supported");
    const entry = JSON.parse(plan.changes[0]!.after!).mcpServers.postgres;
    // `type` is the native key; `transport` is ours and must never be written.
    expect(entry.type).toBe("stdio");
    expect(entry).not.toHaveProperty("transport");
  });

  it("creates the file when the store does not exist yet", async () => {
    const fs = new MockFsProvider();
    const plan = await planStoreWrite(fs, store({}), "/home/user/.claude.json", {
      kind: "mcp-server",
      name: "postgres",
      value: MCP,
    });
    expect(plan.supported).toBe(true);
    if (!plan.supported) return;
    expect(plan.changes[0]!.before).toBeNull();
    expect(JSON.parse(plan.changes[0]!.after!).mcpServers.postgres).toMatchObject({
      command: "pg-mcp",
    });
  });

  it("honours the store's declared root key", async () => {
    const fs = new MockFsProvider({ "/home/user/mcp.json": JSON.stringify({ servers: {} }) });
    const plan = await planStoreWrite(
      fs,
      store({ path: "mcp.json", shape: { rootKey: "servers" } }),
      "/home/user/mcp.json",
      { kind: "mcp-server", name: "postgres", value: MCP },
    );
    if (!plan.supported) throw new Error("expected supported");
    expect(JSON.parse(plan.changes[0]!.after!).servers.postgres).toBeDefined();
  });

  it("removes an MCP server", async () => {
    const fs = new MockFsProvider({
      "/home/user/.claude.json": JSON.stringify({ mcpServers: { gone: {}, kept: {} } }),
    });
    const plan = await planStoreWrite(fs, store({}), "/home/user/.claude.json", {
      kind: "mcp-server",
      name: "gone",
      value: null,
    });
    if (!plan.supported) throw new Error("expected supported");
    expect(Object.keys(JSON.parse(plan.changes[0]!.after!).mcpServers)).toEqual(["kept"]);
  });

  it("writes a Codex MCP server through the TOML codec", async () => {
    const fs = new MockFsProvider({
      "/home/user/.codex/config.toml": '# mine\nmodel = "gpt-5"\n',
    });
    const plan = await planStoreWrite(
      fs,
      store({ formatId: "toml-codex", path: ".codex/config.toml" }),
      "/home/user/.codex/config.toml",
      { kind: "mcp-server", name: "postgres", value: MCP },
    );
    if (!plan.supported) throw new Error("expected supported");
    expect(plan.changes[0]!.after).toContain("# mine");
    expect(plan.changes[0]!.after).toContain("[mcp_servers.postgres]");
  });

  it("writes an OpenCode MCP server in its native shape", async () => {
    const fs = new MockFsProvider({ "/home/user/opencode.json": JSON.stringify({ theme: "x" }) });
    const plan = await planStoreWrite(
      fs,
      store({ formatId: "json-opencode", path: "opencode.json" }),
      "/home/user/opencode.json",
      { kind: "mcp-server", name: "postgres", value: MCP },
    );
    if (!plan.supported) throw new Error("expected supported");
    const after = JSON.parse(plan.changes[0]!.after!);
    expect(after.theme).toBe("x");
    // OpenCode's own shape, not the portable one.
    expect(after.mcp.postgres).toMatchObject({ type: "local", command: ["pg-mcp", "--local"] });
  });

  it("writes a skill as SKILL.md under the skills directory", async () => {
    const fs = new MockFsProvider();
    const plan = await planStoreWrite(
      fs,
      store({ kind: "skill", formatId: "skills-dir", path: ".claude/skills" }),
      "/home/user/.claude/skills",
      {
        kind: "skill",
        name: "review",
        value: { name: "review", content: "---\nname: review\n---\n\n# Review\n" },
      },
    );
    if (!plan.supported) throw new Error("expected supported");
    expect(plan.changes[0]!.path).toBe("/home/user/.claude/skills/review/SKILL.md");
    expect(plan.changes[0]!.after).toContain("# Review");
  });

  it("writes instructions as a marker block, preserving the user's own prose", async () => {
    const fs = new MockFsProvider({
      "/home/user/.claude/CLAUDE.md": "# My own notes\n\nKeep me.\n",
    });
    const plan = await planStoreWrite(
      fs,
      store({ kind: "instructions", formatId: "markdown-instructions", path: ".claude/CLAUDE.md" }),
      "/home/user/.claude/CLAUDE.md",
      { kind: "instructions", name: "house-style", value: { content: "Use tabs." } },
    );
    if (!plan.supported) throw new Error("expected supported");
    const after = plan.changes[0]!.after!;
    expect(after).toContain("# My own notes");
    expect(after).toContain("Keep me.");
    expect(after).toContain("BEGIN harness:sync:house-style");
    expect(after).toContain("Use tabs.");
  });

  it("replaces an existing instruction block rather than appending a second", async () => {
    const fs = new MockFsProvider({
      "/home/user/.claude/CLAUDE.md":
        "# Notes\n\n<!-- BEGIN harness:sync:house-style -->\nUse spaces.\n<!-- END harness:sync:house-style -->\n",
    });
    const plan = await planStoreWrite(
      fs,
      store({ kind: "instructions", formatId: "markdown-instructions", path: ".claude/CLAUDE.md" }),
      "/home/user/.claude/CLAUDE.md",
      { kind: "instructions", name: "house-style", value: { content: "Use tabs." } },
    );
    if (!plan.supported) throw new Error("expected supported");
    const after = plan.changes[0]!.after!;
    expect(after).toContain("Use tabs.");
    expect(after).not.toContain("Use spaces.");
    expect(after.match(/BEGIN harness:sync:house-style/g)).toHaveLength(1);
  });

  it("reports unsupported rather than throwing for a kind the format cannot hold", async () => {
    const fs = new MockFsProvider();
    const plan = await planStoreWrite(
      fs,
      store({ kind: "permissions", formatId: "json-generic", path: ".claude/settings.json" }),
      "/home/user/.claude/settings.json",
      { kind: "permissions", name: "x", value: {} },
    );
    expect(plan.supported).toBe(false);
    if (plan.supported) return;
    expect(plan.reason).toMatch(/permissions/);
  });

  it("reports unsupported for plugin cells (M3, not this milestone)", async () => {
    const fs = new MockFsProvider();
    const plan = await planStoreWrite(fs, store({ kind: "plugin" }), "/home/user/.claude.json", {
      kind: "plugin",
      name: "x",
      value: {},
    });
    expect(plan.supported).toBe(false);
  });

  it("refuses a name that would escape the skills directory", async () => {
    const fs = new MockFsProvider();
    const plan = await planStoreWrite(
      fs,
      store({ kind: "skill", formatId: "skills-dir", path: ".claude/skills" }),
      "/home/user/.claude/skills",
      { kind: "skill", name: "../../escape", value: { name: "x", content: "y" } },
    );
    expect(plan.supported).toBe(false);
  });
});
