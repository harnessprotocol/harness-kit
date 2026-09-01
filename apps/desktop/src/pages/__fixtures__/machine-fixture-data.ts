import type { MachineInventory } from "@harness-kit/core";

/**
 * Static MachineInventory for the dev-only Machine screenshot fixture —
 * exercises every cell state (present u/p, absent, not-applicable, unknown),
 * an undetected column, skipped diagnostics, and one cross-surface diff.
 */
export const MACHINE_FIXTURE_INVENTORY: MachineInventory = {
  surfaces: [
    { id: "claude-code", detected: true, resourceCount: 6, skipped: [] },
    { id: "claude-desktop", detected: true, resourceCount: 1, skipped: [] },
    { id: "copilot-vscode", detected: true, resourceCount: 0, skipped: [] },
    { id: "copilot-cli", detected: false, resourceCount: 0, skipped: [] },
    {
      id: "codex",
      detected: true,
      resourceCount: 2,
      skipped: [{ file: "~/.codex/config.toml", reason: "unparseable TOML at line 12" }],
    },
    { id: "cursor", detected: true, resourceCount: 3, skipped: [] },
    { id: "pi", detected: false, resourceCount: 0, skipped: [] },
    { id: "opencode", detected: false, resourceCount: 0, skipped: [] },
    { id: "windsurf", detected: false, resourceCount: 0, skipped: [] },
    { id: "gemini", detected: true, resourceCount: 1, skipped: [] },
    { id: "junie", detected: false, resourceCount: 0, skipped: [] },
  ],
  rows: [
    {
      key: "instructions:claude.md",
      kind: "instructions",
      name: "CLAUDE.md",
      cells: {
        "claude-code": {
          status: "present",
          effectiveDigest: "sha256:9f2c11ab34",
          entries: [
            {
              scope: "user",
              digest: "sha256:9f2c11ab34",
              provenance: { file: "~/.claude/CLAUDE.md", formatId: "markdown-instructions" },
            },
          ],
        },
        "claude-desktop": { status: "not-applicable", entries: [] },
        "copilot-vscode": { status: "absent", entries: [] },
        "copilot-cli": { status: "absent", entries: [] },
        codex: { status: "absent", entries: [] },
        cursor: { status: "absent", entries: [] },
        pi: { status: "absent", entries: [] },
        opencode: { status: "absent", entries: [] },
        windsurf: { status: "absent", entries: [] },
        gemini: { status: "absent", entries: [] },
        junie: { status: "absent", entries: [] },
      },
    },
    {
      key: "mcp-server:github",
      kind: "mcp-server",
      name: "github",
      cells: {
        "claude-code": {
          status: "present",
          effectiveDigest: "sha256:aa11bb22cc",
          entries: [
            {
              scope: "user",
              digest: "sha256:aa11bb22cc",
              provenance: { file: "~/.claude.json", formatId: "json-mcpservers" },
            },
          ],
        },
        "claude-desktop": {
          status: "present",
          effectiveDigest: "sha256:aa11bb22cc",
          entries: [
            {
              scope: "user",
              digest: "sha256:aa11bb22cc",
              provenance: {
                file: "~/Library/Application Support/Claude/claude_desktop_config.json",
                formatId: "json-mcpservers",
              },
            },
          ],
        },
        "copilot-vscode": { status: "unknown", entries: [] },
        "copilot-cli": { status: "absent", entries: [] },
        codex: {
          status: "present",
          effectiveDigest: "sha256:dd33ee44ff",
          entries: [
            {
              scope: "user",
              digest: "sha256:dd33ee44ff",
              provenance: { file: "~/.codex/config.toml", formatId: "toml-codex" },
            },
          ],
        },
        cursor: {
          status: "present",
          effectiveDigest: "sha256:aa11bb22cc",
          entries: [
            {
              scope: "project",
              digest: "sha256:aa11bb22cc",
              provenance: { file: ".cursor/mcp.json", formatId: "json-mcpservers" },
            },
          ],
        },
        pi: { status: "not-applicable", entries: [] },
        opencode: { status: "absent", entries: [] },
        windsurf: { status: "absent", entries: [] },
        gemini: { status: "absent", entries: [] },
        junie: { status: "absent", entries: [] },
      },
    },
    {
      key: "skill:code-review",
      kind: "skill",
      name: "code-review",
      cells: {
        "claude-code": {
          status: "present",
          effectiveDigest: "sha256:0011223344",
          entries: [
            {
              scope: "user",
              digest: "sha256:0011223344",
              provenance: { file: "~/.claude/skills/code-review/SKILL.md", formatId: "skills-dir" },
            },
          ],
        },
        "claude-desktop": { status: "absent", entries: [] },
        "copilot-vscode": { status: "absent", entries: [] },
        "copilot-cli": { status: "absent", entries: [] },
        codex: { status: "absent", entries: [] },
        cursor: {
          status: "present",
          effectiveDigest: "sha256:0011223344",
          entries: [
            {
              scope: "user",
              digest: "sha256:0011223344",
              provenance: { file: "~/.cursor/skills/code-review/SKILL.md", formatId: "skills-dir" },
            },
          ],
        },
        pi: { status: "absent", entries: [] },
        opencode: { status: "absent", entries: [] },
        windsurf: { status: "absent", entries: [] },
        gemini: { status: "absent", entries: [] },
        junie: { status: "absent", entries: [] },
      },
    },
  ],
  gaps: [
    { row: "mcp-server:github", presentOn: ["claude-code", "claude-desktop", "codex", "cursor"], missingOn: ["gemini"] },
    { row: "skill:code-review", presentOn: ["claude-code", "cursor"], missingOn: ["codex", "gemini"] },
  ],
  diffs: [
    {
      row: "mcp-server:github",
      surfaces: ["claude-code", "codex"],
      delta: [
        { path: "env.GITHUB_TOKEN", kind: "changed", left: "«secret»", right: "«secret-2»" },
        { path: "args[1]", kind: "added", right: "--readonly" },
      ],
    },
  ],
};
