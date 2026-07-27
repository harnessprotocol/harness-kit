---
sidebar_position: 3
title: IDE Support Matrix
---

# IDE Support Matrix

Quick reference for feature support by editor — useful when deciding where to invest harness configuration.

## GitHub Copilot Features by Editor

| Feature | VS Code | Visual Studio | JetBrains | Eclipse | Xcode | GitHub.com | CLI |
|---|---|---|---|---|---|---|---|
| Code completions | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| Chat (inline/sidebar) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| copilot-instructions.md | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Path-scoped instructions (.github/instructions/) | ✅ | 🔄 | 🔄 | ❌ | ❌ | ❌ | ❌ |
| Prompt files (.github/prompts/) | ✅ | ❌ | 🔄 | ❌ | ❌ | ❌ | ❌ |
| Agent mode (.github/agents/) | ✅ | ❌ | 🔄 | ❌ | ❌ | ❌ | ❌ |
| MCP servers | ✅ | ❌ | 🔄 | ❌ | ❌ | ❌ | ❌ |
| CLAUDE.md native support (chat.useClaudeMdFile) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Native plugin install | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

> 🔄 = Preview or actively rolling out. Check release notes for current status.

## harness-kit Plugin Portability

`/harness-compile` automates the "copy SKILL.md" column for all 8 targets — the table below describes what's portable, not that you have to do it by hand. The last five targets share a single `AGENTS.md` file, so their portability story is identical across all of them.

| Plugin | Claude Code | Copilot CLI | VS Code (Copilot) | Cursor | Codex / OpenCode / Windsurf / Gemini CLI / Junie |
|---|---|---|---|---|---|
| explain | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| review | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| rubber-ducky | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| docgen | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| research | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| lineage | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| orient | ✅ native | ✅ native | 🔄 MCP required | 🔄 MCP required | 🔄 MCP required |
| capture | ✅ native | ✅ native | 🔄 MCP required | 🔄 MCP required | 🔄 MCP required |
| membrain | ✅ native | ✅ native | 🔄 MCP required | 🔄 MCP required | 🔄 MCP required |
| open-pr | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| merge-pr | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| pr-sweep | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| dependabot-sweep | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| harness-share | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| stats | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| iterm-notify | ✅ native | ❌ hooks only | ❌ hooks only | ❌ hooks only | ❌ hooks only |
| frontend-design | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |

> MCP-required plugins work in tools that support MCP servers. Codex supports MCP via `--mcp` flag or a global `~/.codex/config.toml`; OpenCode via `opencode.json`; Gemini CLI via `.gemini/settings.json`; Junie via `.junie/mcp/mcp.json`; Windsurf via a global `~/.codeium/windsurf/mcp_config.json`.

## MCP as Universal Fallback

MCP has the broadest cross-tool support of any harness-kit feature. The `orient`, `capture`, and `membrain` plugins depend on MCP — any tool supporting MCP can run these plugins. MCP is the forward-compatible path for bringing harness-kit capabilities to new editors as support expands.

## Last Updated

Last updated: 2026-07-27
