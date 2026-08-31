import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readCodexMcp } from "../src/codecs/toml-codex.js";
import { readOpenCodeMcpConfig } from "../src/codecs/json-opencode.js";
import { readStore } from "../src/observe/read-store.js";
import { getSurface } from "../src/surfaces/registry.js";
import { loadFixtureProject } from "./helpers/load-fixture-tree.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "..", "fixtures", "observe");
const HOME = "/home/user";

function fixture(...segments: string[]): string {
  return readFileSync(resolve(FIXTURES_DIR, ...segments), "utf-8");
}

describe("toml-codex codec: readCodexMcp", () => {
  it("parses [mcp_servers.NAME] tables: stdio + url entries, malformed entry skipped with reason", () => {
    const result = readCodexMcp(fixture("codex", ".codex", "config.toml"));

    expect(result.entries.map((e) => e.name).sort()).toEqual(["docs", "linear"]);

    // env_vars is accepted as a spelling of env.
    const docs = result.entries.find((e) => e.name === "docs")!;
    expect(docs.value).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "docs-mcp-server"],
      env: { DOCS_API_KEY: "sk-FAKE-codex-docs" },
    });

    // bearer_token_env_var is carried as a note on the value.
    const linear = result.entries.find((e) => e.name === "linear")!;
    expect(linear.value).toEqual({
      transport: "http",
      url: "https://mcp.linear.app/mcp",
      bearerTokenEnvVar: "LINEAR_TOKEN",
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("'broken'");
    expect(result.skipped[0].reason).toMatch(/command|url/);
  });

  it("accepts env as well as env_vars", () => {
    const result = readCodexMcp(
      `[mcp_servers.docs]\ncommand = "npx"\nenv = { DOCS_KEY = "sk-FAKE-env" }\n`,
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].value).toEqual({
      transport: "stdio",
      command: "npx",
      env: { DOCS_KEY: "sk-FAKE-env" },
    });
  });

  it("skips non-table junk under mcp_servers with a reason, keeping valid siblings", () => {
    const result = readCodexMcp(
      `[mcp_servers]\njunk = "just a string"\n\n[mcp_servers.ok]\ncommand = "npx"\n`,
    );
    expect(result.entries.map((e) => e.name)).toEqual(["ok"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("'junk'");
  });

  it("degrades a whole-file TOML parse failure to a single skipped with the parse error, empty entries — never throws", () => {
    const result = readCodexMcp(fixture("codex", ".codex", "broken.toml"));
    expect(result.entries).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/TOML/);
  });

  it("a config.toml with no mcp_servers table is not-configured: empty, no skipped", () => {
    const result = readCodexMcp(`model = "gpt-5-codex"\n`);
    expect(result.entries).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe("toml-codex via readStore", () => {
  it("dispatches the codex store to the codec and stamps provenance", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "codex"), HOME, HOME);
    const configStore = getSurface("codex").stores.find(
      (s) => s.kind === "mcp-server" && s.scope === "user",
    )!;
    const path = `${HOME}/.codex/config.toml`;

    const result = await readStore(fs, configStore, path);

    expect(result.entries).toHaveLength(2);
    for (const entry of result.entries) {
      expect(entry.kind).toBe("mcp-server");
      expect(entry.provenance).toEqual({ file: path, formatId: "toml-codex" });
    }
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].file).toBe(path);
  });
});

describe("json-opencode codec: readOpenCodeMcpConfig", () => {
  it("maps local and remote entries to MCP values; unknown types are skipped with reason", () => {
    const result = readOpenCodeMcpConfig(fixture("opencode", "opencode.json"));

    expect(result.entries.map((e) => e.name).sort()).toEqual(["context7", "linear", "scratch"]);

    const context7 = result.entries.find((e) => e.name === "context7")!;
    expect(context7.value).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      env: { CONTEXT7_API_KEY: "sk-FAKE-context7" },
    });

    const linear = result.entries.find((e) => e.name === "linear")!;
    expect(linear.value).toEqual({ transport: "http", url: "https://mcp.linear.app/sse" });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("'mystery'");
  });

  it("pinned: a disabled server (enabled: false) is included, flagged enabled: false on the value — observation reports what is on disk", () => {
    const result = readOpenCodeMcpConfig(fixture("opencode", "opencode.json"));

    const scratch = result.entries.find((e) => e.name === "scratch")!;
    expect(scratch.value).toEqual({
      transport: "stdio",
      command: "deno",
      args: ["run", "server.ts"],
      enabled: false,
    });

    // Enabled servers carry no flag — absence means active.
    const context7 = result.entries.find((e) => e.name === "context7")!;
    expect("enabled" in (context7.value as Record<string, unknown>)).toBe(false);
  });

  it("degrades malformed JSON to a single skipped, empty entries", () => {
    const result = readOpenCodeMcpConfig("{ nope");
    expect(result.entries).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/JSON/);
  });

  it("a config with no mcp key is not-configured: empty, no skipped", () => {
    const result = readOpenCodeMcpConfig(JSON.stringify({ theme: "dark" }));
    expect(result.entries).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe("json-opencode via readStore", () => {
  it("dispatches the opencode store to the codec and stamps provenance", async () => {
    const fs = loadFixtureProject(resolve(FIXTURES_DIR, "opencode"), HOME, HOME);
    const configStore = getSurface("opencode").stores.find(
      (s) => s.kind === "mcp-server" && s.scope === "project",
    )!;
    const path = `${HOME}/opencode.json`;

    const result = await readStore(fs, configStore, path);

    expect(result.entries).toHaveLength(3);
    for (const entry of result.entries) {
      expect(entry.kind).toBe("mcp-server");
      expect(entry.provenance).toEqual({ file: path, formatId: "json-opencode" });
    }
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].file).toBe(path);
  });
});
