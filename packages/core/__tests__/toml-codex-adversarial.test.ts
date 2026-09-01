import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { readCodexMcp, writeCodexMcp } from "../src/codecs/toml-codex.js";

/** Cases an adversarial review found in the "byte-preserving" writer. */
describe("codex writer — adversarial", () => {
  it("keeps the comment block belonging to the NEXT table", () => {
    const content = `[mcp_servers.foo]
command = "old"

# personal notes about bar: needs the VPN up
[mcp_servers.bar]
command = "bar"
`;
    const next = writeCodexMcp(content, {
      upsert: { name: "foo", value: { transport: "stdio", command: "new" } },
    });
    expect(next).toContain("# personal notes about bar: needs the VPN up");
  });

  it("keeps the next table's comment when removing", () => {
    const content = `[mcp_servers.foo]
command = "old"

# keep me
[other]
x = 1
`;
    expect(writeCodexMcp(content, { remove: "foo" })).toContain("# keep me");
  });

  it("removes a non-adjacent sub-table of the target", () => {
    const content = `[mcp_servers.foo]
command = "foo"

[mcp_servers.bar]
command = "bar"

[mcp_servers.foo.env]
TOKEN = "abc"
`;
    const next = writeCodexMcp(content, { remove: "foo" });
    expect(next).not.toContain("mcp_servers.foo");
    expect(readCodexMcp(next).entries.map((e) => e.name)).toEqual(["bar"]);
  });

  it("produces valid TOML when upserting over a non-adjacent sub-table", () => {
    const content = `[mcp_servers.foo]
command = "foo"

[mcp_servers.bar]
command = "bar"

[mcp_servers.foo.env]
TOKEN = "abc"
`;
    const next = writeCodexMcp(content, {
      upsert: { name: "foo", value: { transport: "stdio", command: "new", env: { A: "b" } } },
    });
    expect(() => parseToml(next)).not.toThrow();
    const read = readCodexMcp(next);
    expect(read.entries.find((e) => e.name === "foo")?.value).toEqual({
      transport: "stdio",
      command: "new",
      env: { A: "b" },
    });
  });

  it("does not treat a table header inside a multi-line string as a header", () => {
    const content = `[profile]
notes = """
[mcp_servers.foo]
this line is prose inside a string
"""

[mcp_servers.foo]
command = "real"
`;
    const next = writeCodexMcp(content, {
      upsert: { name: "foo", value: { transport: "stdio", command: "updated" } },
    });
    expect(() => parseToml(next)).not.toThrow();
    expect(next).toContain("this line is prose inside a string");
  });
});
