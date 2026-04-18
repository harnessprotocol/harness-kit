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

Any AI coding tool that reads prompt templates can use them:

- **Cursor:** Copy SKILL.md content into `.cursor/rules/`
- **Copilot:** Add to workspace instructions in `.github/copilot-instructions.md`
- **Windsurf:** Include in `.windsurfrules` or project rules
- **Any tool with custom instructions:** Paste the markdown

The workflows themselves — research indexing, layered explanations, data lineage tracing — work regardless of which LLM reads them. The steps are model-agnostic.

## What's not portable yet

Some parts of the plugin system are tied to Claude Code's infrastructure:

| Capability | Status | Why |
|------------|--------|-----|
| SKILL.md prompts | Portable now | Plain markdown, works anywhere |
| Distribution (marketplace install) | Claude Code + Copilot CLI | Both use compatible plugin formats; Copilot CLI reads `.claude-plugin/` natively |
| Stop hooks | Claude Code only | Hook system is Claude Code-specific |
| MCP server references (orient, capture) | Partially portable | MCP is an open protocol, but wiring varies by tool |
| Bundled scripts | Portable | Shell scripts, but auto-execution depends on the harness |

## The vision

A compatibility layer that translates plugin definitions between harness formats. Same plugin directory structure, different distribution adapters. You'd write a plugin once and a build step would generate the right config files for each target harness.

This isn't built yet. The current priority is getting the plugin workflows right — the prompts, the step sequences, the scope controls. Those are the hard part and they're already portable. Distribution adapters are a packaging problem, solvable once the content stabilizes.

## Current status

Prompts are portable. Infrastructure is next.

If you're using a non-Claude Code tool today, you can still use harness-kit's workflows. See [Installation — Using with other tools](/docs/getting-started/installation) for specifics.

## See Also

- [Using with Other Tools](/docs/cross-harness/setup-guide) — Step-by-step for Copilot, Cursor, and Windsurf
- [Configuration Primitives](/docs/cross-harness/concept-mapping) — How concepts map across Claude Code, Copilot, and Cursor
- [IDE Support Matrix](/docs/cross-harness/ide-support) — Feature support by editor
