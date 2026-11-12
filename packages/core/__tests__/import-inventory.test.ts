import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { importFromInventory } from "../src/import/import-inventory.js";
import { buildMachineInventory } from "../src/observe/machine-inventory.js";
import { validateHarness } from "../src/schema/validate.js";
import type { ObserveOptions } from "../src/observe/observe-surface.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const HOME = "/home/user";
const OPTS: ObserveOptions = { projectRoot: null, homeRoot: HOME, platform: "darwin" };

const CLAUDE_JSON = JSON.stringify({
  mcpServers: {
    github: {
      command: "npx",
      args: ["-y", "gh-mcp"],
      env: { GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789", PORT: "5432" },
    },
    remote: { type: "http", url: "https://example.com/mcp" },
  },
});
const SETTINGS = JSON.stringify({
  permissions: { allow: ["Bash(git status)"], deny: ["Read(.env)"], additionalDirectories: ["/work"] },
});
// The retired location: Claude Code no longer reads it, so the grid does not show it.
const RETIRED_MCP = JSON.stringify({ mcpServers: { retired: { command: "old" } } });

function fs(): MockFsProvider {
  return new MockFsProvider(
    {
      [`${HOME}/.claude.json`]: CLAUDE_JSON,
      [`${HOME}/.claude/settings.json`]: SETTINGS,
      [`${HOME}/.claude/mcp.json`]: RETIRED_MCP,
    },
    HOME,
    HOME,
  );
}

describe("importFromInventory (AC-56)", () => {
  it("builds harness.yaml from the servers the grid shows", async () => {
    const result = await importFromInventory(fs(), OPTS);
    const gridServers = (await buildMachineInventory(fs(), OPTS)).rows
      .filter((r) => r.kind === "mcp-server")
      .map((r) => r.name)
      .sort();
    expect(Object.keys(result.harnessConfig["mcp-servers"] ?? {}).sort()).toEqual(gridServers);
    expect(gridServers).toEqual(["github", "remote"]);
  });

  it("never reads the retired ~/.claude/mcp.json", async () => {
    const result = await importFromInventory(fs(), OPTS);
    expect(result.harnessYaml).not.toContain("retired");
  });

  it("returns the same inventory the grid builds", async () => {
    const result = await importFromInventory(fs(), OPTS);
    expect(result.inventory).toEqual(await buildMachineInventory(fs(), OPTS));
  });

  it("writes stdio and network servers, with secrets replaced by the inventory's placeholder", async () => {
    const { harnessConfig, harnessYaml } = await importFromInventory(fs(), OPTS);
    const servers = harnessConfig["mcp-servers"]!;
    expect(servers.github).toMatchObject({ transport: "stdio", command: "npx", args: ["-y", "gh-mcp"] });
    expect((servers.github as { env: Record<string, string> }).env).toEqual({
      GITHUB_TOKEN: "<secret>",
      PORT: "5432",
    });
    expect(servers.remote).toMatchObject({ transport: "http", url: "https://example.com/mcp" });
    expect(harnessYaml).not.toContain("ghp_");
  });

  it("carries Claude Code permissions", async () => {
    const { harnessConfig } = await importFromInventory(fs(), OPTS);
    expect(harnessConfig.permissions).toEqual({
      tools: { allow: ["Bash(git status)"], deny: ["Read(.env)"] },
      paths: { writable: ["/work"] },
    });
  });

  it("emits a schema-valid document that round-trips as YAML", async () => {
    const { harnessConfig, harnessYaml } = await importFromInventory(fs(), OPTS, undefined, {
      name: "mine",
      description: "from the machine",
    });
    expect(validateHarness(harnessConfig).valid).toBe(true);
    expect(parseYaml(harnessYaml)).toEqual(JSON.parse(JSON.stringify(harnessConfig)));
    expect(harnessConfig.metadata?.name).toBe("mine");
  });

  it("skips a disabled server rather than writing it as enabled", async () => {
    const disabled = new MockFsProvider(
      {
        [`${HOME}/.config/opencode/opencode.json`]: JSON.stringify({
          mcp: { off: { type: "local", command: ["x"], enabled: false } },
        }),
      },
      HOME,
      HOME,
    );
    const { harnessConfig } = await importFromInventory(disabled, OPTS);
    expect(harnessConfig["mcp-servers"]).toBeUndefined();
  });

  it("an empty machine yields a valid document with no sections", async () => {
    const { harnessConfig } = await importFromInventory(new MockFsProvider({}, HOME, HOME), OPTS);
    expect(harnessConfig["mcp-servers"]).toBeUndefined();
    expect(harnessConfig.permissions).toBeUndefined();
    expect(validateHarness(harnessConfig).valid).toBe(true);
  });
});
