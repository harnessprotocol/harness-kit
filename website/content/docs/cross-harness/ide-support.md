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

| Plugin | Claude Code | Copilot CLI | VS Code (Copilot) | Cursor | Windsurf | Codex |
|---|---|---|---|---|---|---|
| explain | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| review | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| docgen | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| research | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| lineage | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| orient | ✅ native | ✅ native | 🔄 MCP required | 🔄 MCP required | ❌ no MCP | 🔄 MCP required |
| capture | ✅ native | ✅ native | 🔄 MCP required | 🔄 MCP required | ❌ no MCP | 🔄 MCP required |
| membrain | ✅ native | ✅ native | 🔄 MCP required | 🔄 MCP required | ❌ no MCP | 🔄 MCP required |
| open-pr | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| merge-pr | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| pr-sweep | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| harness-share | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| stats | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |
| board | ✅ native | 🔄 MCP required | 🔄 MCP required | 🔄 MCP required | ❌ no MCP | 🔄 MCP required |
| iterm-notify | ✅ native | ❌ hooks only | ❌ hooks only | ❌ hooks only | ❌ hooks only | ❌ hooks only |
| frontend-design | ✅ native | ✅ native | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md | ✅ copy SKILL.md |

> MCP-required plugins work in tools that support MCP servers. Codex supports MCP via `--mcp` flag.

## MCP as Universal Fallback

MCP has the broadest cross-tool support of any harness-kit feature. The `orient`, `capture`, and `membrain` plugins depend on MCP — any tool supporting MCP (via `.vscode/mcp.json`, `.cursor/mcp.json`, etc.) can run these plugins. MCP is the forward-compatible path for bringing harness-kit capabilities to new editors as support expands.

## Last Updated

Last updated: 2026-04-17
