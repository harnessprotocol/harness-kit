import { describe, expect, it } from "vitest";
import { readCodexMcp, writeCodexMcp } from "../src/codecs/toml-codex.js";

/**
 * Task 8 / AC-14. The governing constraint (design open question 2):
 * HarnessKit surgically owns only the `[mcp_servers.*]` tables it manages —
 * user comments and unrelated tables survive byte-for-byte.
 */
describe("codex TOML writer (AC-14)", () => {
  const withUserContent = `# My Codex config — hand written, do not clobber.
model = "gpt-5"

# Keep this comment attached to the table below.
[history]
persistence = "save-all"   # trailing comment

[mcp_servers.github]
command = "gh-mcp"
args = ["--stdio"]

[tools]
web_search = true
`;

  it("adds a server without touching anything else", () => {
    const next = writeCodexMcp(withUserContent, {
      upsert: { name: "postgres", value: { transport: "stdio", command: "pg-mcp" } },
    });
    // Everything the user wrote survives verbatim.
    expect(next).toContain("# My Codex config — hand written, do not clobber.");
    expect(next).toContain('persistence = "save-all"   # trailing comment');
    expect(next).toContain("# Keep this comment attached to the table below.");
    expect(next).toContain("[tools]\nweb_search = true");
    // And the new server reads back.
    const read = readCodexMcp(next);
    expect(read.skipped).toEqual([]);
    expect(read.entries.map((entry) => entry.name).sort()).toEqual(["github", "postgres"]);
  });

  it("replaces only the target table when updating", () => {
    const next = writeCodexMcp(withUserContent, {
      upsert: {
        name: "github",
        value: { transport: "stdio", command: "gh-mcp", args: ["--http"] },
      },
    });
    expect(next).toContain("[tools]");
    expect(next).toContain('model = "gpt-5"');
    const read = readCodexMcp(next);
    const github = read.entries.find((entry) => entry.name === "github");
    expect(github?.value).toMatchObject({ command: "gh-mcp", args: ["--http"] });
    // The unrelated table is untouched and still parses.
    expect(read.entries).toHaveLength(1);
  });

  it("removes only the target table", () => {
    const next = writeCodexMcp(withUserContent, { remove: "github" });
    expect(readCodexMcp(next).entries).toEqual([]);
    expect(next).toContain("[history]");
    expect(next).toContain("[tools]");
    expect(next).toContain('model = "gpt-5"');
  });

  it("round-trips every value shape it can write", () => {
    for (const value of [
      { transport: "stdio" as const, command: "srv" },
      { transport: "stdio" as const, command: "srv", args: ["-y", "pkg@1.2.3"] },
      { transport: "stdio" as const, command: "srv", env: { TOKEN: "abc", PORT: "8080" } },
      { transport: "http" as const, url: "https://example.com/mcp" },
      { transport: "http" as const, url: "https://example.com/mcp", bearerTokenEnvVar: "MCP_TOKEN" },
    ]) {
      const next = writeCodexMcp("", { upsert: { name: "srv", value } });
      const read = readCodexMcp(next);
      expect(read.skipped, JSON.stringify(value)).toEqual([]);
      expect(read.entries[0]?.value, JSON.stringify(value)).toEqual(value);
    }
  });

  it("keeps sub-tables of the target inside the replaced region", () => {
    const content = `[mcp_servers.srv]
command = "old"

[mcp_servers.srv.env]
STALE = "yes"

[other]
keep = true
`;
    const next = writeCodexMcp(content, {
      upsert: { name: "srv", value: { transport: "stdio", command: "new" } },
    });
    expect(next).not.toContain("STALE");
    expect(next).toContain("[other]");
    const read = readCodexMcp(next);
    expect(read.entries[0]?.value).toEqual({ transport: "stdio", command: "new" });
  });

  it("handles names needing quoting", () => {
    const next = writeCodexMcp("", {
      upsert: { name: "my server.v2", value: { transport: "stdio", command: "srv" } },
    });
    const read = readCodexMcp(next);
    expect(read.skipped).toEqual([]);
    expect(read.entries[0]?.name).toBe("my server.v2");
  });

  it("escapes strings rather than emitting broken TOML", () => {
    const next = writeCodexMcp("", {
      upsert: {
        name: "srv",
        value: { transport: "stdio", command: 'say "hi"', args: ["a\\b", "line\nbreak"] },
      },
    });
    const read = readCodexMcp(next);
    expect(read.skipped).toEqual([]);
    expect(read.entries[0]?.value).toEqual({
      transport: "stdio",
      command: 'say "hi"',
      args: ["a\\b", "line\nbreak"],
    });
  });

  it("finds a quoted table header when removing", () => {
    const content = `[mcp_servers."my server"]
command = "srv"

[keep]
x = 1
`;
    const next = writeCodexMcp(content, { remove: "my server" });
    expect(readCodexMcp(next).entries).toEqual([]);
    expect(next).toContain("[keep]");
  });

  it("refuses to edit an inline mcp_servers table rather than corrupting it", () => {
    // `mcp_servers = { srv = {...} }` is legal TOML this line-based editor
    // cannot safely splice — failing loudly beats writing garbage.
    const content = 'mcp_servers = { srv = { command = "x" } }\n';
    expect(() =>
      writeCodexMcp(content, {
        upsert: { name: "srv", value: { transport: "stdio", command: "y" } },
      }),
    ).toThrow(/inline/i);
  });

  it("refuses to write into a file it cannot parse", () => {
    expect(() =>
      writeCodexMcp("this is [not toml", {
        upsert: { name: "srv", value: { transport: "stdio", command: "y" } },
      }),
    ).toThrow(/TOML/i);
  });

  it("leaves every byte outside the managed region untouched", () => {
    // The property the managed-region approach exists to guarantee: diff the
    // before/after with the managed table excised from both, and nothing else
    // may have moved — whitespace, comments, or ordering.
    const excise = (text: string): string =>
      text
        .split("\n")
        .filter((line) => !/^(command|args|env|url|bearer_token_env_var)\s*=/.test(line))
        .filter((line) => !line.startsWith("[mcp_servers."))
        .join("\n");

    for (const edit of [
      { upsert: { name: "added", value: { transport: "stdio" as const, command: "x" } } },
      { upsert: { name: "github", value: { transport: "http" as const, url: "https://x" } } },
      { remove: "github" },
    ]) {
      const next = writeCodexMcp(withUserContent, edit);
      // Collapse runs of blank lines and ignore EOF whitespace: appending a
      // table legitimately adds one separator, which is not a content change.
      const normalize = (text: string): string =>
        text.replace(/\n{2,}/g, "\n\n").trimEnd();
      expect(normalize(excise(next)), JSON.stringify(edit)).toBe(
        normalize(excise(withUserContent)),
      );
    }
  });

  it("removing an absent server is a no-op, not an error", () => {
    expect(writeCodexMcp(withUserContent, { remove: "nope" })).toBe(withUserContent);
  });
});
