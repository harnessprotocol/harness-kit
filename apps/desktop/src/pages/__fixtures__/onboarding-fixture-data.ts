import type { ImportProjectResult } from "@harness-kit/core";

/**
 * Static fixture data for the onboarding screenshot harness (see
 * OnboardingFixture.tsx). Shaped exactly like a real importMachine() result
 * so OnboardingPage's data-derivation logic (onboarding-data.ts) runs
 * unmodified against it — this file has no Tauri/core dependency at runtime.
 * Models a realistic "you have sprawl" machine: Claude Code, Cursor, and
 * GitHub Copilot all configured, with an overlapping instruction and two
 * genuine conflicts (an MCP server pointed at two commands, and a
 * tool allowed by one adapter and denied by another).
 */
export const ONBOARDING_FIXTURE_RESULT: ImportProjectResult = {
  harnessYaml: `version: "1"
metadata:
  name: imported
  description: Synthesized from existing tool configurations by harness-kit import.
mcp-servers:
  github:
    transport: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-github"
  postgres:
    transport: stdio
    command: mcp-server-postgres
    args:
      - "--connection-string"
      - "$DATABASE_URL"
instructions:
  operational: |-
    <!-- source: claude-code:.claude/CLAUDE.md -->
    Run tests before committing. Use conventional commits.

    <!-- source: cursor:.cursor/rules/repo.mdc -->
    Always run the test suite before you commit any change.
permissions:
  tools:
    allow:
      - Read
      - Grep
      - Glob
      - Bash
    deny:
      - "rm -rf"
x-harness-import:
  conflicts:
    - field: mcp-servers.github
      alternates:
        - adapter: claude-code
          value: {transport: stdio, command: npx, args: ["-y", "@modelcontextprotocol/server-github"]}
          source: "claude-code:.claude/mcp.json"
        - adapter: cursor
          value: {transport: stdio, command: github-mcp-server, args: []}
          source: "cursor:.cursor/mcp.json"
    - field: permissions.tools
      alternates:
        - adapter: claude-code
          value: {allow: ["Read", "Grep", "Glob", "Bash"], deny: ["rm -rf"]}
          source: "claude-code:.claude/settings.json"
        - adapter: copilot
          value: {allow: ["rm -rf"]}
          source: "copilot:.github/copilot-instructions.md"
`,
  harnessConfig: {
    version: "1",
    metadata: { name: "imported", description: "Synthesized from existing tool configurations by harness-kit import." },
    "mcp-servers": {
      github: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
      postgres: { transport: "stdio", command: "mcp-server-postgres", args: ["--connection-string", "$DATABASE_URL"] },
    },
    instructions: {
      operational:
        "<!-- source: claude-code:.claude/CLAUDE.md -->\nRun tests before committing. Use conventional commits.\n\n<!-- source: cursor:.cursor/rules/repo.mdc -->\nAlways run the test suite before you commit any change.",
    },
    permissions: {
      tools: { allow: ["Read", "Grep", "Glob", "Bash"], deny: ["rm -rf"] },
    },
  },
  findings: {
    adapters: [
      {
        adapter: "claude-code",
        detected: true,
        found: [
          { domain: "instructions", file: ".claude/CLAUDE.md", detail: "operational instruction block (612 chars)" },
          { domain: "mcp", file: ".claude/mcp.json", detail: "mcp server 'github' (stdio)" },
          { domain: "mcp", file: ".claude/mcp.json", detail: "mcp server 'postgres' (stdio)" },
          { domain: "permissions", file: ".claude/settings.json", detail: "tool/path/network permissions" },
        ],
        skipped: [],
        warnings: [],
      },
      {
        adapter: "cursor",
        detected: true,
        found: [
          { domain: "instructions", file: ".cursor/rules/repo.mdc", detail: "operational instruction block (540 chars)" },
          { domain: "mcp", file: ".cursor/mcp.json", detail: "mcp server 'github' (stdio)" },
        ],
        skipped: [],
        warnings: [],
      },
      {
        adapter: "copilot",
        detected: true,
        found: [
          { domain: "permissions", file: ".github/copilot-instructions.md", detail: "tool/path/network permissions" },
        ],
        skipped: [{ file: ".github/copilot-instructions.md", reason: "free-form prose outside recognized permission blocks" }],
        warnings: [],
      },
      { adapter: "opencode", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "pi", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "agents-md", detected: false, found: [], skipped: [], warnings: [] },
    ],
  },
  provenance: {
    entries: [
      { field: "instructions.operational", source: { adapter: "claude-code", file: ".claude/CLAUDE.md" } },
      { field: "mcp-servers.github", source: { adapter: "claude-code", file: ".claude/mcp.json" } },
      { field: "mcp-servers.postgres", source: { adapter: "claude-code", file: ".claude/mcp.json" } },
      { field: "permissions", source: { adapter: "claude-code", file: ".claude/settings.json" } },
    ],
    conflicts: [
      {
        field: "mcp-servers.github",
        alternates: [
          {
            adapter: "claude-code",
            value: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
            source: { adapter: "claude-code", file: ".claude/mcp.json" },
          },
          {
            adapter: "cursor",
            value: { transport: "stdio", command: "github-mcp-server", args: [] },
            source: { adapter: "cursor", file: ".cursor/mcp.json" },
          },
        ],
      },
      {
        field: "permissions.tools",
        alternates: [
          {
            adapter: "claude-code",
            value: { allow: ["Read", "Grep", "Glob", "Bash"], deny: ["rm -rf"] },
            source: { adapter: "claude-code", file: ".claude/settings.json" },
          },
          {
            adapter: "copilot",
            value: { allow: ["rm -rf"] },
            source: { adapter: "copilot", file: ".github/copilot-instructions.md" },
          },
        ],
      },
    ],
  },
};

/** Zero/one-harness edge case — a fresh machine with only Claude Code configured, no conflicts. */
export const ONBOARDING_FIXTURE_LOW_COUNT: ImportProjectResult = {
  harnessYaml: `version: "1"
metadata:
  name: imported
  description: Synthesized from existing tool configurations by harness-kit import.
instructions:
  operational: |-
    Run tests before committing.
`,
  harnessConfig: {
    version: "1",
    metadata: { name: "imported", description: "Synthesized from existing tool configurations by harness-kit import." },
    instructions: { operational: "Run tests before committing." },
  },
  findings: {
    adapters: [
      {
        adapter: "claude-code",
        detected: true,
        found: [{ domain: "instructions", file: ".claude/CLAUDE.md", detail: "operational instruction block (28 chars)" }],
        skipped: [],
        warnings: [],
      },
      { adapter: "cursor", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "copilot", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "opencode", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "pi", detected: false, found: [], skipped: [], warnings: [] },
      { adapter: "agents-md", detected: false, found: [], skipped: [], warnings: [] },
    ],
  },
  provenance: {
    entries: [{ field: "instructions.operational", source: { adapter: "claude-code", file: ".claude/CLAUDE.md" } }],
    conflicts: [],
  },
};
