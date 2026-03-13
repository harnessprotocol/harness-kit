<div align="center">

# harness-kit

A configuration framework for AI coding tools.

[![Release](https://img.shields.io/github/v/release/harnessprotocol/harness-kit?style=flat-square)](https://github.com/harnessprotocol/harness-kit/releases)
[![Validate](https://img.shields.io/github/actions/workflow/status/harnessprotocol/harness-kit/validate.yml?style=flat-square&label=validate)](https://github.com/harnessprotocol/harness-kit/actions/workflows/validate.yml)
[![License](https://img.shields.io/github/license/harnessprotocol/harness-kit?style=flat-square)](LICENSE)

Requires [Claude Code](https://claude.ai/claude-code)

</div>

Building a good AI setup takes real work. harness-kit makes it portable. Package your plugins, skills, MCP servers, hooks, and conventions into a config you can apply to any harness on any machine — and share with your team in one file. Works with Claude Code, Cursor, and GitHub Copilot. Designed to travel.

## Install

```
/plugin marketplace add harnessprotocol/harness-kit
```

<details>
<summary>Fallback: install with script (skills only)</summary>

If your Claude Code build doesn't support the plugin marketplace:

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/install.sh | bash
```

Downloads skill files to `~/.claude/skills/` over HTTPS. This installs only the skill files; the full plugin (e.g. index rebuild script) comes from the marketplace install.
</details>

## Quick Start

Install `explain` — no dependencies, works in any codebase:

```
/plugin install explain@harness-kit
```

Then try it:

```
/explain src/auth/middleware.ts       # explain a specific file
/explain the payment processing flow  # search the codebase for a concept
/explain src/services/                # map a directory
```

Produces a structured explanation: summary, key components, how it connects, patterns, gotchas, and where to start if you need to change it.

## Plugins

### Built-in

| Plugin | What it does | Try it |
|--------|-------------|--------|
| [`explain`](plugins/explain/skills/explain/README.md) | Layered explanations of files, functions, directories, or concepts | `/explain src/auth/` |
| [`review`](plugins/review/skills/review/README.md) | Code review for a branch, PR, or path — structured output with severity labels | `/review` |
| [`docgen`](plugins/docgen/skills/docgen/README.md) | Generate or update README, API docs, architecture overview, or changelog | `/docgen readme` |
| [`research`](plugins/research/skills/research/README.md) | Process any source into a structured, compounding knowledge base | `/research https://...` |
| [`data-lineage`](plugins/data-lineage/skills/data-lineage/README.md) | Trace column-level data lineage through SQL, Kafka, Spark, and JDBC codebases | `/data-lineage orders.amount` |
| [`orient`](plugins/orient/skills/orient/README.md) ¹ | Topic-focused session orientation across graph, knowledge, journal, and research | `/orient auth` |
| [`capture-session`](plugins/capture-session/skills/capture-session/README.md) ¹ | Capture session information into a staging file for later reflection | `/capture-session` |
| [`harness-share`](plugins/harness-share/skills/harness-export/README.md) | Export your plugin setup to `harness.yaml`, compile to native configs for Claude Code, Cursor, and Copilot, and keep them in sync | `/harness-export` · `/harness-import` · `/harness-validate` · `/harness-compile` · `/harness-sync` |

¹ Personal-workflow plugins designed for projects using the [knowledge graph + journal pattern](docs/claude-md-conventions.md).

### Community

Plugins from the broader ecosystem that complement the kit. These are developed and maintained by their respective authors.

| Plugin | Author | What it does | Install |
|--------|--------|-------------|---------|
| [`superpowers`](https://github.com/obra/superpowers) | [Jesse Vincent](https://github.com/obra) | Structured dev workflows — TDD, systematic debugging, brainstorming-before-coding, subagent delegation, and git worktree isolation | See below |

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@obra
```

## Sharing Your Setup

Capture your installed plugins into a `harness.yaml` file, commit it to your dotfiles, and restore it on any machine — or share it with a teammate.

```
/harness-export               # write harness.yaml from your current setup
/harness-import harness.yaml  # interactive wizard to pick what to install
/harness-validate             # validate harness.yaml against the Harness Protocol v1 schema
/harness-compile              # compile harness.yaml to native config files for Claude Code, Cursor, and Copilot
/harness-sync                 # keep Claude Code, Cursor, and Copilot configuration in sync
```

The import wizard shows each plugin with its description and lets you pick a subset — your config is a starting point, not a mandate.

`harness.yaml` follows the [Harness Protocol v1](https://harnessprotocol.io) open spec — a vendor-neutral format for portable AI coding harnesses that can declare plugins, MCP servers, environment variables, and instructions in one shareable file.

**Shell fallback (no Claude Code required):**

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness-restore.sh | bash -s -- harness.yaml
```

See [`harness.yaml.example`](harness.yaml.example) for the config format.

## Using with Other Tools

harness-kit natively supports Claude Code, Cursor, and GitHub Copilot. Use `/harness-compile` to generate native config files for each tool from a single `harness.yaml`, and `/harness-sync` to keep them aligned as your setup evolves.

SKILL.md files are plain markdown — they work in any tool's instruction system. VS Code Copilot reads `CLAUDE.md` natively via the `chat.useClaudeMdFile` setting, so the conventions guide works without modification. For per-tool setup (Copilot, Cursor, Windsurf, MCP), see the [Cross-Harness setup guide](https://harnesskit.ai/docs/cross-harness/setup-guide).

## Conventions Guide

A standalone guide to organizing Claude Code configuration with separation of concerns. Worth reading even if you don't use any plugins.

| File | Scope | Purpose |
|------|-------|---------|
| `CLAUDE.md` | Global + Project + Package | Operational: build, test, architecture |
| `AGENT.md` | Global + Project | Behavioral: tone, autonomy, workflow |
| `SOUL.md` | Global only | Identity: values, relationship, memory |

Read the full guide: **[Claude Conventions](docs/claude-md-conventions.md)**

Plugins can also include agent definitions — isolated specialist workers with their own context and scoped tools. See [Understanding Agents](https://harnessprotocol.io/docs/concepts/agents) for how agents, AGENT.md, and subagent definitions relate.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for plugin guidelines, skill conventions, and PR process.

## Docs

- **[FAQ](FAQ.md)** — What is this, why do I need it, how does it work
- **[Plugins vs. Skills](docs/plugins-vs-skills.md)** — Why everything ships as a plugin, even when it's just a prompt
- **[Claude Conventions](docs/claude-md-conventions.md)** — Organizing Claude Code config with separation of concerns
- **[Understanding Agents](https://harnessprotocol.io/docs/concepts/agents)** — Disambiguating AGENT.md, custom subagents, and "AI agent" generally

## License

Apache 2.0
