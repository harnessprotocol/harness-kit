import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "../src/write/agent-prompt.js";
import type { CellActionPlan, CellActionRequest } from "../src/write/plan-cell-action.js";

const REQUEST: CellActionRequest = {
  kind: "mcp-server",
  name: "postgres",
  from: "claude-code",
  to: "cursor",
  scope: "user",
};

function plan(value: unknown): CellActionPlan {
  return {
    supported: true,
    changes: [],
    noop: false,
    carriesSecret: true,
    value,
    loss: null,
    requiresConfirmation: false,
    target: { file: "/home/user/.cursor/mcp.json", formatId: "json-mcpservers" },
  };
}

// Deliberately NOT shaped like a known credential (no sk-/ghp_/AKIA/JWT
// prefix): only its position identifies it, which is what the key-name and
// flag-position rules exist to catch.
const SECRET = "Zx7Z9qN2mR4tW8vB1kY6hJ3fL5dS0aQe";

describe("agent prompt secret leaks (adversarial)", () => {
  const shapes: Array<[string, unknown]> = [
    ["positional arg after a sensitive flag", { transport: "stdio", command: "pg", args: ["--token", SECRET] }],
    ["inline flag arg", { transport: "stdio", command: "pg", args: [`--api-key=${SECRET}`] }],
    ["header value", { transport: "http", url: "https://x/mcp", headers: { Cookie: `session=${SECRET}` } }],
    ["url query string", { transport: "http", url: `https://api/mcp?access_token=${SECRET}` }],
    ["nested JSON in an env value", { transport: "stdio", command: "pg", env: { CONFIG: `{"token":"${SECRET}"}` } }],
  ];
  for (const [label, value] of shapes) {
    it(`does not leak: ${label}`, () => {
      expect(buildAgentPrompt(plan(value), REQUEST)).not.toContain(SECRET);
    });
  }

  it("always warns about secret handling when the value carries one", () => {
    const prompt = buildAgentPrompt(plan({ transport: "stdio", command: "pg", args: ["--token", SECRET] }), REQUEST);
    expect(prompt).toMatch(/secret|credential/i);
  });
});
