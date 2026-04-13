import { describe, expect, it } from "vitest";
import { compileMcpServers } from "../src/compile/mcp-servers.js";
import type { HarnessConfig } from "../src/types.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

function makeConfig(servers: HarnessConfig["mcp-servers"] = {}): HarnessConfig {
  return {
    version: "1",
    metadata: { name: "test", description: "test" },
    "mcp-servers": servers,
  };
}

describe("compileMcpServers", () => {
  it("creates MCP JSON files for each target", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig({
      postgres: {
        transport: "stdio",
        command: "uvx",
        args: ["mcp-server-postgres"],
      },
    });

    const { files } = await compileMcpServers(config, ["claude-code", "cursor"], fs);
    expect(files).toHaveLength(2);

    const cc = files.find((f) => f.platform === "claude-code");
    expect(cc!.path).toBe(".mcp.json");
    const parsed = JSON.parse(cc!.content);
    expect(parsed.mcpServers.postgres.type).toBe("stdio");
    expect(parsed.mcpServers.postgres.command).toBe("uvx");
  });

  it("translates transport to type", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig({
      api: {
        transport: "sse",
        url: "https://example.com/mcp",
      },
    });

    const { files } = await compileMcpServers(config, ["claude-code"], fs);
    const parsed = JSON.parse(files[0].content);
    expect(parsed.mcpServers.api.type).toBe("sse");
    expect(parsed.mcpServers.api.url).toBe("https://example.com/mcp");
  });

  it("merges with existing MCP config", async () => {
    const existing = JSON.stringify({
      mcpServers: {
        existing: { type: "stdio", command: "existing-cmd" },
      },
    });

    const fs = new MockFsProvider({
      "/project/.mcp.json": existing,
    });

    const config = makeConfig({
      newserver: { transport: "stdio", command: "new-cmd" },
    });

    const { files } = await compileMcpServers(config, ["claude-code"], fs);
    const parsed = JSON.parse(files[0].content);
    expect(parsed.mcpServers.existing.command).toBe("existing-cmd");
    expect(parsed.mcpServers.newserver.command).toBe("new-cmd");
  });

  it("warns on name collision and keeps existing", async () => {
    const existing = JSON.stringify({
      mcpServers: {
        postgres: { type: "stdio", command: "old-postgres" },
      },
    });

    const fs = new MockFsProvider({
      "/project/.mcp.json": existing,
    });

    const config = makeConfig({
      postgres: { transport: "stdio", command: "new-postgres" },
    });

    const { files, warnings } = await compileMcpServers(config, ["claude-code"], fs);
    const parsed = JSON.parse(files[0].content);
    // Existing config preserved
    expect(parsed.mcpServers.postgres.command).toBe("old-postgres");
    // Warning emitted
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("postgres");
    expect(warnings[0]).toContain("Existing config kept");
  });

  it("returns empty files when no mcp-servers", async () => {
    const fs = new MockFsProvider();
    const config: HarnessConfig = {
      version: "1",
      metadata: { name: "test", description: "test" },
    };

    const { files } = await compileMcpServers(config, ["claude-code"], fs);
    expect(files).toHaveLength(0);
  });
});
