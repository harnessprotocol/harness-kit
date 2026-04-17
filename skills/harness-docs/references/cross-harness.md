# Cross-Harness Usage

<!-- Source: website/content/docs/cross-harness/setup-guide.mdx, concept-mapping.mdx, ide-support.md -->

harness-kit plugins are plain markdown — any tool that reads prompt files or instruction markdown can use the workflows.

The skill format follows the [Agent Skills specification](https://agentskills.io) — an open standard for cross-platform skill portability.

## GitHub Copilot

**Plugin install (Copilot CLI):**
```
copilot plugin install harnessprotocol/harness-kit
```

**Manual — repo-wide instructions:**  
Copy a plugin's `SKILL.md` to `.github/copilot-instructions.md`. Copilot picks it up automatically for all conversations in that repo.

**Path-scoped instructions:**  
Drop it in `.github/instructions/<name>.instructions.md` with an `applyTo` glob:

```markdown
---
applyTo: "src/**"
---

[SKILL.md content here]
```

**CLAUDE.md native support:**  
VS Code Copilot reads `CLAUDE.md` natively when `chat.useClaudeMdFile` is enabled in settings. A single `CLAUDE.md` can serve both Claude Code and Copilot simultaneously — no separate instruction files needed.

**Skills directories:**  
Some VS Code Copilot configurations recognize `.claude/skills/` alongside `.github/skills/`.

## Cursor

Copy a plugin's `SKILL.md` to `.cursor/rules/<name>.mdc`. Use Cursor's `globs:` frontmatter to restrict a skill to specific paths:

```markdown
---
globs: "src/**/*.ts"
---

[SKILL.md content here]
```

## Windsurf

Copy the `SKILL.md` content into `.windsurfrules`, or paste it through Windsurf's project rules UI. No frontmatter needed — Windsurf applies rules project-wide.

## MCP Servers

MCP has 100% cross-platform support. The wiring location varies by tool:

| Tool | MCP config file |
|------|----------------|
| Claude Code | `.mcp.json` |
| Copilot (VS Code) | `.vscode/mcp.json` |
| Cursor | `.cursor/mcp.json` |

Plugins that depend on MCP (like `orient` and `capture`) work in any of these tools as long as the server is wired up.

## Feature Comparison

| Feature | Claude Code | Copilot | Cursor | Windsurf |
|---------|-------------|---------|--------|----------|
| Marketplace install/update | One command | Copilot CLI | Manual | Manual |
| Hooks | Auto-triggered | Not supported | Not supported | Not supported |
| Auto-execution scripts | Bundled | Manual | Manual | Manual |
| SKILL.md workflows | Full support | Full support | Full support | Full support |
| MCP server support | Full support | Full support | Full support | Varies |

## Configuration Primitives Across Tools

Every AI coding tool uses the same five configuration primitives with different names:

| Primitive | Claude Code | Copilot (VS Code) | Cursor |
|-----------|-------------|-------------------|--------|
| Instructions | `CLAUDE.md`, `.claude/rules/*.md` | `.github/copilot-instructions.md` | `.cursor/rules/*.mdc` |
| Prompt Templates | `SKILL.md` in `.claude/skills/` | `.github/prompts/*.prompt.md` | Rule files with glob scope |
| Agent Definitions | `.claude/agents/*.md` | `.github/agents/*.agent.md` | Not yet supported |
| Skills | `.claude/skills/` | `.github/skills/` | Not yet supported |
| Tool Servers | `.mcp.json` | `.vscode/mcp.json` | `.cursor/mcp.json` |

## Three-Tier Scoping

All three tools use the same three-tier model:

| Tier | Claude Code | Copilot | Cursor |
|------|-------------|---------|--------|
| Personal | `~/.claude/CLAUDE.md` | VS Code user settings | `~/.cursor/rules/` |
| Project | `CLAUDE.md` / `.claude/` | `.github/` | `.cursor/` |
| Organization | Enterprise policy | GitHub Copilot policies | Cursor Business |

harness-kit targets the project tier.
