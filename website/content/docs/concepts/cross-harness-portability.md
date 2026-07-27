---
sidebar_position: 2
title: Cross-Harness Portability
---

# Cross-Harness Portability

## The problem

AI coding tool configuration is non-portable. You build up prompt templates, workflows, MCP server references, and hooks in one tool, then start from scratch when you try another. Your investment in a well-tuned setup is locked to whichever harness you started with.

This matters most for teams. If half your org uses Claude Code and half uses Cursor, shared workflows either get maintained twice or abandoned.

## The enterprise evaluation use case

Teams evaluating AI coding harnesses — Claude Code, Copilot, Cursor, Windsurf — need identical setups to do fair comparisons. Without portable configuration, you're comparing *tool + setup quality* rather than *tool capabilities alone*.

Say you've spent weeks tuning a research workflow in Claude Code: source processing steps, output format, knowledge base structure. To evaluate Cursor, you'd need to recreate all of that in Cursor's rules system. Any differences in the evaluation could be the tool or could be gaps in your port. You can't tell.

Portable configuration eliminates this variable. Same workflow definition, different execution engine, clean comparison.

## What's portable today

**SKILL.md files are plain markdown.** They're not API calls, not SDK integrations, not compiled code. A SKILL.md is a prompt template with numbered steps, scope controls, output format specs, and common mistake guards.

The `harness-share` plugin's `/harness-compile` skill is the compatibility layer: it takes a single `harness.yaml` and generates native config for **8 targets** — Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini CLI, and JetBrains Junie. The last five all read a single shared `AGENTS.md` file, so compiling for any combination of them writes it once. Manual copy-paste still works too, for one-off setups or tools `/harness-compile` doesn't cover:

- **Cursor:** Copy SKILL.md content into `.cursor/rules/`
- **Copilot:** Add to workspace instructions in `.github/copilot-instructions.md`
- **Codex / OpenCode / Windsurf / Gemini CLI / Junie:** Append to `AGENTS.md`
- **Any tool with custom instructions:** Paste the markdown

The workflows themselves — research indexing, layered explanations, data lineage tracing — work regardless of which LLM reads them. The steps are model-agnostic.

## What's not portable yet

Some parts of the plugin system are still tied to Claude Code's infrastructure:

| Capability | Status | Why |
|------------|--------|-----|
| SKILL.md prompts | Portable now | Plain markdown, works anywhere |
| Compiled instructions, MCP configs, skill copies | Portable now via `/harness-compile` | Generates native config for all 8 targets from one `harness.yaml` |
| Distribution (marketplace install) | Claude Code + Copilot CLI native | Both read `.claude-plugin/` directly; other targets install via `/harness-compile` or manual copy |
| Stop hooks | Claude Code only | Hook system is Claude Code-specific |
| MCP server references (orient, capture, membrain) | Portable, wiring varies | MCP is an open protocol; Codex and Windsurf configure it globally rather than per-project |
| Agent definitions (`.claude/agents/*.md`) | Claude Code only | No equivalent primitive exists yet in the other 7 targets |
| Bundled scripts | Portable | Shell scripts, but auto-execution depends on the harness |

## Current status

Prompts, compiled instructions, and MCP wiring are portable across all 8 targets today via `/harness-compile`. Hooks and agent definitions remain Claude Code-specific — there's no equivalent primitive to compile them to yet.

If you're using a non-Claude Code tool today, run `/harness-compile` or see [Installation — Using with other tools](/docs/getting-started/installation) for manual specifics.

## See Also

- [Using with Other Tools](/docs/cross-harness/setup-guide) — Step-by-step for all 8 targets
- [Configuration Primitives](/docs/cross-harness/concept-mapping) — How concepts map across Claude Code, Copilot, and Cursor
- [IDE Support Matrix](/docs/cross-harness/ide-support) — Feature support by editor
