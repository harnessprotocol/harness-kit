# Cross-Harness Usage

<!-- Source: website/content/docs/cross-harness/setup-guide.mdx, concept-mapping.mdx, ide-support.md -->

harness-kit plugins are plain markdown — any tool that reads prompt files or instruction markdown can use the workflows.

The skill format follows the [Agent Skills specification](https://agentskills.io) — an open standard for cross-platform skill portability.

## Automated: `/harness-compile`

The `harness-share` plugin's `/harness-compile` skill generates native config for **8 targets** from a single `harness.yaml`: `claude-code`, `cursor`, `copilot`, `codex`, `opencode`, `windsurf`, `gemini`, `junie`. It writes instruction files, MCP server configs, and skill copies for whichever targets you confirm — the manual copy-paste steps below are the fallback for tools it doesn't cover or for one-off setups. The last five targets (Codex, OpenCode, Windsurf, Gemini CLI, Junie) all read operational instructions from a single shared `AGENTS.md` file, written once regardless of how many of those five are active.

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

## Codex, OpenCode, Windsurf, Gemini CLI, and Junie

These five tools share a single instruction file: `AGENTS.md` at the repo root. Copy a plugin's `SKILL.md` in (or let `/harness-compile` do it once for all five):

```bash
cat plugins/research/skills/research/SKILL.md >> AGENTS.md
```

Presence indicators, if you need to detect which of the five is in use: Codex (`.codex/`), OpenCode (`opencode.json` or `.opencode/`), Windsurf (`.windsurf/`), Gemini CLI (`.gemini/`), Junie (`.junie/`). A bare `AGENTS.md` with none of these is ambiguous — ask rather than assume.

**MCP servers:** Codex supports MCP via the `--mcp` flag (`codex --mcp .mcp.json`); OpenCode via `opencode.json`; Gemini CLI via `.gemini/settings.json`; Junie via `.junie/mcp/mcp.json`. Codex and Windsurf configure MCP servers globally (`~/.codex/config.toml`, `~/.codeium/windsurf/mcp_config.json`) rather than per-project — `/harness-compile` skips the project-level write for these two and warns instead of guessing.

**Skills:** each of the five gets its own skill directory rather than sharing one — Codex/`​.agents/skills/`, OpenCode/`.opencode/skills/`, Windsurf/`.windsurf/skills/`, Gemini CLI/`.gemini/skills/`, Junie/`.junie/skills/`.

## MCP Servers

MCP has broad cross-platform support. The wiring location varies by tool:

| Tool | MCP config file |
|------|----------------|
| Claude Code | `.mcp.json` |
| Copilot (VS Code) | `.vscode/mcp.json` |
| Cursor | `.cursor/mcp.json` |
| OpenCode | `opencode.json` |
| Gemini CLI | `.gemini/settings.json` |
| Junie | `.junie/mcp/mcp.json` |
| Codex | Global only (`~/.codex/config.toml`) |
| Windsurf | Global only (`~/.codeium/windsurf/mcp_config.json`) |

Plugins that depend on MCP (like `orient` and `capture`) work in any of these tools as long as the server is wired up.

## Feature Comparison

| Feature | Claude Code | Copilot | Cursor | Codex / OpenCode / Windsurf / Gemini CLI / Junie |
|---------|-------------|---------|--------|-------|
| Marketplace install/update | One command | Copilot CLI | Manual | Manual (or via `/harness-compile`) |
| Hooks | Auto-triggered | Not supported | Not supported | Not supported |
| Auto-execution scripts | Bundled | Manual | Manual | Manual |
| SKILL.md workflows | Full support | Full support | Full support | Full support |
| MCP server support | Full support | Full support | Full support | Full support (Codex/Windsurf: global config only) |

## Configuration Primitives Across Tools

Every AI coding tool uses the same configuration primitives with different names:

| Primitive | Claude Code | Copilot (VS Code) | Cursor | Codex / OpenCode / Windsurf / Gemini CLI / Junie |
|-----------|-------------|-------------------|--------|-------|
| Instructions | `CLAUDE.md`, `.claude/rules/*.md` | `.github/copilot-instructions.md` | `.cursor/rules/*.mdc` | `AGENTS.md` (shared across all five) |
| Prompt Templates | `SKILL.md` in `.claude/skills/` | `.github/prompts/*.prompt.md` | Rule files with glob scope | Not yet supported |
| Agent Definitions | `.claude/agents/*.md` | `.github/agents/*.agent.md` | Not yet supported | Not yet supported |
| Skills | `.claude/skills/` | `.github/skills/` | `.cursor/skills/` | Own directory per tool (see above) |
| Tool Servers | `.mcp.json` | `.vscode/mcp.json` | `.cursor/mcp.json` | Varies — see MCP Servers table above |

## Three-Tier Scoping

Claude Code, Copilot, and Cursor use the same three-tier model. The AGENTS.md family (Codex/OpenCode/Windsurf/Gemini CLI/Junie) is project-tier only — none of the five currently distinguish personal vs. organization scope the way Claude Code, Copilot, and Cursor do.

| Tier | Claude Code | Copilot | Cursor |
|------|-------------|---------|--------|
| Personal | `~/.claude/CLAUDE.md` | VS Code user settings | `~/.cursor/rules/` |
| Project | `CLAUDE.md` / `.claude/` | `.github/` | `.cursor/` |
| Organization | Enterprise policy | GitHub Copilot policies | Cursor Business |

harness-kit targets the project tier across all 8 supported tools.
