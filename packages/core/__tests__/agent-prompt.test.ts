import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "../src/write/agent-prompt.js";
import { planCellAction } from "../src/write/plan-cell-action.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const OPTS = { projectRoot: null, homeRoot: "/home/user", platform: "darwin" as const };

function machine(server: Record<string, unknown>): MockFsProvider {
  return new MockFsProvider({
    "/home/user/.claude.json": JSON.stringify({ mcpServers: { postgres: server } }),
    "/home/user/.cursor/mcp.json": JSON.stringify({ mcpServers: {} }),
  });
}

async function planFor(fs: MockFsProvider) {
  return planCellAction(
    fs,
    { kind: "mcp-server", name: "postgres", from: "claude-code", to: "cursor", scope: "user" },
    OPTS,
  );
}

describe("agent prompt generation (AC-11, AC-35, AC-22)", () => {
  it("names the target surface and its own config location", async () => {
    const plan = await planFor(machine({ type: "stdio", command: "pg-mcp" }));
    const prompt = buildAgentPrompt(plan, {
      kind: "mcp-server",
      name: "postgres",
      from: "claude-code",
      to: "cursor",
      scope: "user",
    });
    expect(prompt).toContain("Cursor");
    expect(prompt).toContain(".cursor/mcp.json");
    expect(prompt).toContain("postgres");
  });

  it("sanitizes secrets by default", async () => {
    const plan = await planFor(
      machine({ type: "stdio", command: "pg-mcp", env: { API_TOKEN: "sk-live-abc123" } }),
    );
    const request = {
      kind: "mcp-server" as const,
      name: "postgres",
      from: "claude-code" as const,
      to: "cursor" as const,
      scope: "user" as const,
    };
    const prompt = buildAgentPrompt(plan, request);
    expect(prompt).not.toContain("sk-live-abc123");
    expect(prompt).toContain("API_TOKEN");
    // The env var name survives so the agent knows what to source.
    expect(prompt).toMatch(/environment|env var/i);
  });

  it("includes literal values only when explicitly asked", async () => {
    const plan = await planFor(
      machine({ type: "stdio", command: "pg-mcp", env: { API_TOKEN: "sk-live-abc123" } }),
    );
    const request = {
      kind: "mcp-server" as const,
      name: "postgres",
      from: "claude-code" as const,
      to: "cursor" as const,
      scope: "user" as const,
    };
    expect(buildAgentPrompt(plan, request, { revealSecrets: true })).toContain("sk-live-abc123");
  });

  it("warns in the prompt itself when secrets were revealed", async () => {
    const plan = await planFor(
      machine({ type: "stdio", command: "pg-mcp", env: { API_TOKEN: "sk-live-abc123" } }),
    );
    const prompt = buildAgentPrompt(
      plan,
      {
        kind: "mcp-server",
        name: "postgres",
        from: "claude-code",
        to: "cursor",
        scope: "user",
      },
      { revealSecrets: true },
    );
    expect(prompt).toMatch(/contains (a )?real (secret|credential)/i);
  });

  it("still produces a prompt for a cell with no direct-write path (AC-13)", async () => {
    const fs = machine({ type: "stdio", command: "pg-mcp" });
    const plan = await planCellAction(
      fs,
      { kind: "mcp-server", name: "postgres", from: "claude-code", to: "pi", scope: "user" },
      OPTS,
    );
    expect(plan.supported).toBe(false);
    const prompt = buildAgentPrompt(plan, {
      kind: "mcp-server",
      name: "postgres",
      from: "claude-code",
      to: "pi",
      scope: "user",
    });
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("postgres");
  });

  it("describes the resource content the agent must reproduce", async () => {
    const plan = await planFor(
      machine({ type: "stdio", command: "pg-mcp", args: ["--local", "--port", "5432"] }),
    );
    const prompt = buildAgentPrompt(plan, {
      kind: "mcp-server",
      name: "postgres",
      from: "claude-code",
      to: "cursor",
      scope: "user",
    });
    expect(prompt).toContain("pg-mcp");
    expect(prompt).toContain("5432");
  });
});
