---
sidebar_position: 1
title: Installation
---

# Installation

The primary distribution channel is [Claude Code](https://claude.ai/claude-code)'s plugin marketplace. For other tools, see [Using with other tools](#using-with-other-tools) below.

## Plugin Marketplace (Claude Code)

Add the marketplace once, then install plugins by name:

```
/plugin marketplace add harnessprotocol/harness-kit
/plugin install research@harness-kit
```

Repeat for any plugin you want:

```
/plugin install explain@harness-kit
/plugin install data-lineage@harness-kit
/plugin install orient@harness-kit
/plugin install capture-session@harness-kit
/plugin install review@harness-kit
/plugin install docgen@harness-kit
```

## Fallback: Install Script

If your Claude Code build doesn't support the plugin marketplace yet:

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/install.sh | bash
```

This downloads skill files to `~/.claude/skills/` over HTTPS. It installs **only the skill files** — bundled scripts (like the research index rebuilder) require the full marketplace install.

## Verify

After installing, invoke any skill to confirm it loaded:

```
/research
/explain src/main.ts
```

If the skill responds with its workflow, you're set.

## Using with other tools

SKILL.md files are plain markdown — copy them into any tool's instruction system. VS Code Copilot reads `CLAUDE.md` natively via the `chat.useClaudeMdFile` setting, so the [conventions guide](/docs/guides/conventions) works without modification.

For per-tool setup instructions (Copilot, Cursor, Windsurf, MCP wiring), see [Using with Other Tools](/docs/cross-harness/setup-guide).

## Requirements per Plugin

| Plugin | Requirements |
|--------|-------------|
| research | `gh` CLI (GitHub sources only), Python 3.10+ (index rebuild) |
| explain | None |
| data-lineage | None |
| orient | None (optional: [MCP Memory Server](https://github.com/anthropics/claude-code-memory)) |
| capture-session | None |
| review | `gh` CLI (PR review only) |
| docgen | None |

Some plugins require environment variables for optional features. See the [Secrets Management guide](/docs/guides/secrets-management) for how to configure them.
