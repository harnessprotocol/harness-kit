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

Harness Protocol v2 represents plugins, skills, MCP servers, instructions, environment declarations, permissions, architectural constraints, policy, inheritance, and target-native extensions. `harness capture` discovers native peer state, `harness reconcile` performs a three-way comparison, and `harness apply` writes an approved plan transactionally.

The compile lifecycle covers **8 compile targets** — Claude Code, Cursor, GitHub Copilot (VS Code), Codex, OpenCode, Windsurf, Gemini CLI, and JetBrains Junie — while the observation layer reads **11 surfaces**: the Copilot product splits into VS Code and CLI surfaces, Claude Code and Claude Desktop are distinct surfaces, pi is observed natively, and the ChatGPT desktop app, Codex CLI, and Codex IDE extension count as one `codex` surface because they share `~/.codex/config.toml`. A data-driven capability matrix classifies every resource, scope, and operation as native, translated, source-only, unsupported, or not-applicable (where a harness has no concept of a resource kind, like pi and MCP). Source-only and unsupported cells produce durable loss reports; Harness Kit does not invent native support.

Repository-local skills can be promoted into personal or organization catalogs either by pinning an in-place repository path to an immutable revision and digest or by publishing a validated content-addressed capsule. Flat directory aliases are deployment details: duplicate content is grouped by fingerprint, while different resources that need the same alias require an explicit winner.

## Native-only behavior

Agents, hooks, commands, models, and unmatched native settings that do not have a shared protocol shape are preserved in a target-namespaced vendor block. They can round-trip back to their originating harness. Applying that block elsewhere reports a portability loss instead of silently dropping or translating it.

## Current status

The local capture, preview, reconciliation, apply, drift, and rollback engine is implemented across all eight targets. Organization publication, policy, rollout, audit, and redacted-inventory workflows are a release preview until the service contract suite passes against both managed and documented self-hosted deployments.

Use `harness capture` and `harness reconcile` to inspect the exact plan before writing. `/harness-compile` remains available for the existing plugin workflow.

## See Also

- [Using with Other Tools](/docs/cross-harness/setup-guide) — Step-by-step for all 8 targets
- [Configuration Primitives](/docs/cross-harness/concept-mapping) — How concepts map across Claude Code, Copilot, and Cursor
- [IDE Support Matrix](/docs/cross-harness/ide-support) — Feature support by editor
