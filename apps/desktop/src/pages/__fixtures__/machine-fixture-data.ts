import type { MachineInventory } from "@harness-kit/core";

/**
 * Static MachineInventory for the dev-only Machine screenshot fixture —
 * exercises every cell state (present u/p, absent, not-applicable, unknown),
 * an undetected column, skipped diagnostics, one cross-surface diff, and the
 * two marketplace states (registered, and not readable at all).
 */
/**
 * Surfaces whose descriptors declare no marketplace store: an empty list
 * here means "HarnessKit cannot read this surface's marketplaces", which the
 * grid must not render as "registers none".
 */
const UNREADABLE_MARKETPLACES = (
  surfaces: Array<Omit<MachineInventory["surfaces"][number], "marketplaces" | "marketplacesReadable">>,
): MachineInventory["surfaces"] =>
  surfaces.map((surface) => ({ ...surface, marketplaces: [], marketplacesReadable: false }));

export const MACHINE_FIXTURE_INVENTORY: MachineInventory = {
  surfaces: [
    {
      id: "claude-code",
      detected: true,
      resourceCount: 7,
      marketplaces: [
        {
          id: "harness-kit",
          sourceType: "github",
          source: "harnessprotocol/harness-kit",
          scope: "user",
          provenance: {
            file: "~/.claude/plugins/known_marketplaces.json",
            formatId: "json-claude-marketplaces",
          },
        },
      ],
      marketplacesReadable: true,
      skipped: [],
    },
    ...UNREADABLE_MARKETPLACES([
      { id: "claude-desktop", detected: true, resourceCount: 1, skipped: [] },
      { id: "copilot-vscode", detected: true, resourceCount: 0, skipped: [] },
      { id: "copilot-cli", detected: false, resourceCount: 0, skipped: [] },
    ]),
    {
      id: "codex",
      detected: true,
      resourceCount: 3,
      marketplaces: [
        {
          id: "harness-kit",
          sourceType: "git",
          source: "https://github.com/harnessprotocol/harness-kit.git",
          scope: "user",
          provenance: { file: "~/.codex/config.toml", formatId: "toml-codex-marketplaces" },
        },
        {
          id: "bundled",
          sourceType: "local",
          source: "~/.codex/.tmp/bundled-marketplaces/bundled",
          scope: "user",
          provenance: { file: "~/.codex/config.toml", formatId: "toml-codex-marketplaces" },
        },
      ],
      marketplacesReadable: true,
      skipped: [{ file: "~/.codex/config.toml", reason: "unparseable TOML at line 12" }],
    },
    ...UNREADABLE_MARKETPLACES([
      { id: "cursor", detected: true, resourceCount: 3, skipped: [] },
      { id: "pi", detected: false, resourceCount: 0, skipped: [] },
      { id: "opencode", detected: false, resourceCount: 0, skipped: [] },
      { id: "windsurf", detected: false, resourceCount: 0, skipped: [] },
      { id: "gemini", detected: true, resourceCount: 1, skipped: [] },
      { id: "junie", detected: false, resourceCount: 0, skipped: [] },
    ]),
  ],
  rows: [
    {
      // A plugin present on two surfaces with the same canonical form: same
      // marketplace, same name, both enabled. Not-applicable on the surfaces
      // whose harnesses have no plugin concept at all.
      key: "plugin:board@harness-kit",
      kind: "plugin",
      name: "board@harness-kit",
      cells: {
        "claude-code": {
          status: "present",
          effectiveDigest: "sha256:b0a4d17e55",
          entries: [
            {
              scope: "user",
              digest: "sha256:b0a4d17e55",
              provenance: {
                file: "~/.claude/plugins/installed_plugins.json",
                formatId: "json-claude-plugins",
              },
            },
          ],
        },
        "claude-desktop": { status: "not-applicable", entries: [] },
        "copilot-vscode": { status: "absent", entries: [] },
        "copilot-cli": { status: "absent", entries: [] },
        codex: {
          status: "present",
          effectiveDigest: "sha256:b0a4d17e55",
          entries: [
            {
              scope: "user",
              digest: "sha256:b0a4d17e55",
              provenance: { file: "~/.codex/config.toml", formatId: "toml-codex-plugins" },
            },
          ],
        },
        cursor: { status: "absent", entries: [] },
        pi: { status: "not-applicable", entries: [] },
        opencode: { status: "absent", entries: [] },
        windsurf: { status: "absent", entries: [] },
        gemini: { status: "absent", entries: [] },
        junie: { status: "absent", entries: [] },
      },
    },
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
