import { describe, expect, it } from "vitest";
import { planCellAction } from "../src/write/plan-cell-action.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const OPTS = { projectRoot: null, homeRoot: "/home/user", platform: "darwin" as const };

/** claude-code has an MCP server; codex and cursor do not. */
function machine(extra: Record<string, string> = {}): MockFsProvider {
  return new MockFsProvider({
    "/home/user/.claude/settings.json": "{}",
    "/home/user/.claude.json": JSON.stringify({
      mcpServers: {
        postgres: { command: "pg-mcp", args: ["--local"] },
        github: { command: "gh-mcp" },
      },
    }),
    "/home/user/.codex/config.toml": '# hand written\nmodel = "gpt-5"\n',
    "/home/user/.cursor/mcp.json": JSON.stringify({ mcpServers: {} }),
    ...extra,
  });
}

describe("single-resource cell actions (AC-15, AC-21)", () => {
  it("copies one resource and touches only the target surface", async () => {
    const fs = machine();
    const plan = await planCellAction(
      fs,
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "cursor", scope: "user" },
      OPTS,
    );
    expect(plan.supported).toBe(true);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.path).toBe("/home/user/.cursor/mcp.json");
    // The source is never rewritten.
    expect(plan.changes.some((change) => change.path.includes(".claude.json"))).toBe(false);
  });

  it("preserves the target's sibling resources", async () => {
    const fs = machine({
      "/home/user/.cursor/mcp.json": JSON.stringify({
        mcpServers: { existing: { command: "keep-me" } },
      }),
    });
    const plan = await planCellAction(
      fs,
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "cursor", scope: "user" },
      OPTS,
    );
    const after = JSON.parse(plan.changes[0]!.after!);
    expect(Object.keys(after.mcpServers).sort()).toEqual(["existing", "postgres"]);
    expect(after.mcpServers.existing.command).toBe("keep-me");
  });

  it("carries the literal value, not the sanitized canonical form (AC-21)", async () => {
    const fs = machine({
      "/home/user/.claude.json": JSON.stringify({
        mcpServers: { postgres: { command: "pg-mcp", env: { API_TOKEN: "sk-live-abc123" } } },
      }),
    });
    const plan = await planCellAction(
      fs,
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "cursor", scope: "user" },
      OPTS,
    );
    // The inventory's canonicalForm is sanitized; a same-machine copy is not,
    // or the target would receive a placeholder instead of a working config.
    expect(plan.changes[0]!.after).toContain("sk-live-abc123");
    expect(plan.carriesSecret).toBe(true);
  });

  it("does not flag a secret badge when there is no secret", async () => {
    const plan = await planCellAction(
      machine(),
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "cursor", scope: "user" },
      OPTS,
    );
    expect(plan.carriesSecret).toBe(false);
  });

  it("writes Codex through its TOML codec, preserving the user's file", async () => {
    const plan = await planCellAction(
      machine(),
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "codex", scope: "user" },
      OPTS,
    );
    expect(plan.changes[0]!.path).toBe("/home/user/.codex/config.toml");
    expect(plan.changes[0]!.after).toContain("# hand written");
    expect(plan.changes[0]!.after).toContain("[mcp_servers.postgres]");
  });

  it("produces an empty change set when the target already matches", async () => {
    const fs = machine({
      "/home/user/.cursor/mcp.json": `${JSON.stringify(
        // Native shape, as the writer emits it — `type`, not `transport`.
        { mcpServers: { postgres: { type: "stdio", command: "pg-mcp", args: ["--local"] } } },
        null,
        2,
      )}\n`,
    });
    const plan = await planCellAction(
      fs,
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "cursor", scope: "user" },
      OPTS,
    );
    expect(plan.supported).toBe(true);
    expect(plan.changes).toEqual([]);
    expect(plan.noop).toBe(true);
  });

  it("reports unsupported when the source does not have the resource", async () => {
    const plan = await planCellAction(
      machine(),
      { kind: "mcp-server", name: "absent", from: "claude-code", to: "cursor", scope: "user" },
      OPTS,
    );
    expect(plan.supported).toBe(false);
    expect(plan.reason).toMatch(/absent/);
  });

  it("reports unsupported when the target has no store for the kind", async () => {
    // pi has no MCP concept at all.
    const plan = await planCellAction(
      machine(),
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "pi", scope: "user" },
      OPTS,
    );
    expect(plan.supported).toBe(false);
  });

  it("names the source and target files it worked from", async () => {
    const plan = await planCellAction(
      machine(),
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "cursor", scope: "user" },
      OPTS,
    );
    expect(plan.source?.file).toBe("/home/user/.claude.json");
    expect(plan.target?.file).toBe("/home/user/.cursor/mcp.json");
  });

  it("matches the resource name case-insensitively, like the identity key", async () => {
    const plan = await planCellAction(
      machine(),
      { kind: "mcp-server", name: "PostGres", from: "claude-code", to: "cursor", scope: "user" },
      OPTS,
    );
    expect(plan.supported).toBe(true);
  });
});
