---
sidebar_position: 1
title: FAQ
---

# Frequently Asked Questions

## What is harness-kit?

Every AI setup starts from scratch. New machine, new project, new teammate — and you're rebuilding configuration you already built somewhere else.

harness-kit is a harness-agnostic framework for AI coding tools. Your plugins, skills, MCP servers, hooks, and conventions all live in one portable config. It works with Claude Code today and is designed to travel across tools: Copilot, Cursor, Windsurf, whatever comes next.

Plugins are the entry point: installable slash commands that bundle complete workflows and follow you across every project. Export your full setup as a `harness.yaml`, share it with a teammate, and they're up and running. No rebuilding from scratch.

## What is an "AI harness"?

Your harness is the configuration that tells Claude how to work in a given session — files like `CLAUDE.md` and `AGENT.md`, plus any installed plugins. harness-kit helps you build and share that setup so it's not stuck on one machine.

## Why do I need this? Can't I just write prompts myself?

You can. The issue is that good prompts tend to disappear — scattered across projects, left behind when you move to a new machine. Plugins give them a stable home with a version number.

## What is a "skill"? What is a "plugin"?

A skill is a `SKILL.md` file — the workflow Claude reads when you type a slash command. A plugin is the package that wraps it: a directory with the skill, optional scripts, and a version. You install the plugin; Claude reads the skill.

See [Plugins vs. Skills](/docs/concepts/plugins-vs-skills) for the full breakdown.

## How is a SKILL.md different from a regular prompt?

A prompt tells Claude what to do. A SKILL.md specifies how: step ordering, input parsing, output format, error handling. That structure is what makes the same command produce consistent output every time.

## Does this only work with Claude Code?

The install system targets Claude Code's plugin marketplace. But SKILL.md files follow the [Agent Skills open standard](https://agentskills.io), a cross-platform spec for skill portability. VS Code Copilot reads `CLAUDE.md` natively via `chat.useClaudeMdFile`. See the [Cross-Harness setup guide](/docs/cross-harness/setup-guide) for Cursor, Windsurf, and others.

## How many skills can I install?

Claude loads all skill descriptions into roughly 2% of the context window (~16K chars as a fallback budget). **20–30 skills** is the practical sweet spot. Beyond that, some skill descriptions may be silently excluded from Claude's context, causing the skill to not activate. Run `/context` in Claude Code to check your current context usage.

## What are the size limits for a SKILL.md?

Keep SKILL.md under **500 lines / 5,000 words**. Move reference tables, tag taxonomies, and lookup data to a `references/` subdirectory and load them via `${CLAUDE_SKILL_DIR}`. The `description` frontmatter field has a hard cap of 1,024 characters; no XML angle brackets (`<` or `>`). See [Creating Plugins](/docs/guides/creating-plugins) for the full field reference.

## Is this safe? What does installing a plugin actually do?

Plugins are plain markdown files. There are no binaries, no background processes, no network calls on install. Some plugins include shell scripts (like `research`'s index rebuild) that only run when you invoke the skill. You can read every file before installing.

## Do I need to pay for anything beyond my existing Claude subscription?

No. harness-kit is free and open source (Apache 2.0). All you need is Claude Code.

## How do I share my setup with teammates?

Run `/harness-export` to write a `harness.yaml` with your installed plugins. Commit it to your dotfiles or send it to a teammate. They run `/harness-import harness.yaml` and pick what they want from an interactive list. Your setup is a starting point, not something they have to replicate exactly.

## Can I use this across multiple projects?

Yes. Plugins install to your harness globally, not per-project. `research` and `explain` work in any codebase without extra configuration. Project-specific stuff goes in `CLAUDE.md`.

## Can I build my own plugins?

Yes. A minimal plugin is about 10 lines of boilerplate plus a `SKILL.md`. See the [Creating Plugins guide](/docs/guides/creating-plugins). You can also start with a bare skill file in `~/.claude/skills/` and promote it to a plugin when you're ready to share it.

## Can I modify the built-in plugins?

The installed files are plain text — edit them directly. For something more lasting, fork the repo and point your marketplace at your fork. If you improve something, a PR is welcome; see [Contributing](/docs/guides/contributing).

## How is harness-kit different from MCP servers?

MCP servers give your AI new tools — database access, web search, external APIs. harness-kit is about what to do with those tools: structured workflows with defined steps and outputs. They work at different levels and don't overlap.

## What is the harness.yaml file?

A list of your installed plugins with their sources and versions. Export it with `/harness-export`, commit it, and restore it anywhere with `/harness-import` or `harness-restore.sh`. See [`harness.yaml.example`](https://github.com/siracusa5/harness-kit/blob/main/harness.yaml.example) for the format.

## I already have prompts in my CLAUDE.md. Should I move them?

Not necessarily. Project-specific workflows belong in `CLAUDE.md`. If you find yourself copying the same prompt into every new project, that's probably a sign it would work better as a plugin.

## How is harness-kit different from A2A, the Claude Agent SDK, or MCP?

They operate at different layers and don't overlap.

| Layer | What it solves | Example |
|-------|---------------|---------|
| Configuration | How is this agent set up? | harness-kit |
| Tool communication | How does the agent call tools? | MCP |
| Runtime communication | How do agents talk to each other? | A2A |
| Developer SDK | How do I build an agent? | Claude Agent SDK |

MCP gives your agent tools. A2A lets agents delegate tasks to each other at runtime. The Claude Agent SDK is for building agent-powered applications. harness-kit describes the complete environment, plugins, MCP servers, instructions, permissions, so you can reproduce it on another machine or share it with a teammate. They compose well: a `harness.yaml` can declare MCP servers, the agent runs on the Claude SDK, and could speak A2A to other agents.

See [Where harness-kit fits](/docs/concepts/comparison) for the full breakdown.

## What is the Harness Protocol?

The [Harness Protocol](https://github.com/siracusa5/harness-protocol) is an open specification for portable AI coding harness configuration. It defines a vendor-neutral `harness.yaml` format validated by JSON Schema. harness-kit is the reference implementation, the same way Claude Desktop implements MCP. Any tool that correctly validates and applies `harness.yaml` per the spec is a conformant implementation; harness-kit is not required.

The spec is Apache 2.0. See [Harness Protocol](/docs/concepts/harness-protocol) for how it relates to harness-kit.

## Do any plugins need API keys or tokens?

Two plugins have optional environment variable dependencies:

- **research** — `GH_TOKEN` enables fetching from GitHub repositories via the `gh` CLI. Without it, research works for all other source types (URLs, local files, YouTube, etc.).
- **review** — `GH_TOKEN` enables reviewing pull requests by number (`/review 123`). Without it, review works for local branches and paths.

For setup instructions — shell profile, direnv, 1Password CLI, CI — see the [Secrets Management guide](/docs/guides/secrets-management).
