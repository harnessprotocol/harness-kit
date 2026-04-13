<div align="center">

# harness-kit

Plugins, skills, MCP servers, and hooks for AI coding tools — packaged once, shared anywhere.

[![Release](https://img.shields.io/github/v/release/harnessprotocol/harness-kit?style=flat-square)](https://github.com/harnessprotocol/harness-kit/releases)
[![Validate](https://img.shields.io/github/actions/workflow/status/harnessprotocol/harness-kit/validate.yml?style=flat-square&label=validate)](https://github.com/harnessprotocol/harness-kit/actions/workflows/validate.yml)
[![Build](https://img.shields.io/github/actions/workflow/status/harnessprotocol/harness-kit/build.yml?style=flat-square&label=build)](https://github.com/harnessprotocol/harness-kit/actions/workflows/build.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Plugins](https://img.shields.io/badge/plugins-16-8A2BE2?style=flat-square)](.claude-plugin/marketplace.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

Works with **[Claude Code](https://claude.ai/claude-code)** · **[Cursor](https://cursor.com)** · **[GitHub Copilot](https://github.com/features/copilot)**

</div>

## 🧰 What is harness-kit?

Your AI coding setup — plugins, skills, MCP servers, hooks, conventions — packaged into a single config you can apply to any tool on any machine. Build it once, share it with your team in one file.

## 📦 Install

```
/plugin marketplace add harnessprotocol/harness-kit
```

<details>
<summary>Fallback: install with script (skills only)</summary>

If you're on an older Claude Code version without plugin marketplace support:

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/install.sh | bash
```

Downloads skill files to `~/.claude/skills/` over HTTPS. The full plugin experience (scripts, hooks, agents) requires the marketplace install.
</details>

## ⚡ Quick Start

Install `explain` — no dependencies, works in any codebase:

```
/plugin install explain@harness-kit
```

Then try it:

```
/explain src/               # map the whole codebase
/explain the auth flow      # search by concept
/explain README.md          # explain a specific file
```

Produces a layered explanation: summary, key components, how it connects, patterns, gotchas, and where to start if you need to change it.

## 🔌 Plugins

A few highlights to get started. The full set spans code quality, data engineering, devops, design, productivity, and research:

| Plugin | What it does | Try it |
|--------|-------------|--------|
| [`explain`](plugins/explain/skills/explain/README.md) | Layered code explanations for files, functions, directories, or concepts | `/explain src/auth/` |
| [`research`](plugins/research/skills/research/README.md) | Process any source into a structured, compounding knowledge base | `/research https://...` |
| [`review`](plugins/review/skills/review/README.md) | Code review with severity labels and cross-file analysis | `/review` |
| [`lineage`](plugins/lineage/skills/lineage/README.md) | Column-level data lineage through SQL, Kafka, Spark, and JDBC | `/lineage orders.amount` |

> 📋 **[Browse all 16 plugins →](.claude-plugin/marketplace.json)** or run `/plugin marketplace browse harness-kit`

### 🌍 Community

| Plugin | Author | What it does |
|--------|--------|-------------|
| [`superpowers`](https://github.com/obra/superpowers) | [Jesse Vincent](https://github.com/obra) | TDD, systematic debugging, brainstorming-before-coding, subagent delegation, git worktree isolation |

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@obra
```

> Built a plugin? [Submit a PR](CONTRIBUTING.md) to list it here.

## 🔄 Share Your Setup

Share your exact AI coding setup with teammates or restore it on a new machine — export to `harness.yaml` and commit it to your dotfiles.

| Command | What it does |
|---------|-------------|
| `/harness-export` | Write `harness.yaml` from your current setup |
| `/harness-import harness.yaml` | Interactive wizard — pick what to install |
| `/harness-compile` | Compile to native configs for Claude Code, Cursor, and Copilot |
| `/harness-sync` | Keep all three tools' configs aligned |
| `/harness-validate` | Validate against the [Harness Protocol v1](https://harnessprotocol.io) schema |

<details>
<summary>Shell fallback (no Claude Code required)</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness-restore.sh | bash -s -- harness.yaml
```

See [`harness.yaml.example`](harness.yaml.example) for the config format. `harness.yaml` follows the [Harness Protocol v1](https://harnessprotocol.io) open spec — a vendor-neutral format for portable AI coding harnesses.
</details>

## 🔒 Security & Privacy

- **No telemetry, no data collection** — harness-kit never phones home. Optional stats are local-only.
- **Secrets stay out of config** — plugins declare environment variables they need (`requires.env` in `plugin.json`) with `required`, `optional`, and `sensitive` flags. Values live in your shell profile, direnv, or a secrets manager — never in checked-in files. The framework validates existence but never reads or logs values.
- **Plain text, fully inspectable** — plugins are markdown and JSON. No binaries, no background processes, no network calls on install. Scripts and hooks only run when you explicitly invoke a skill.
- **Granular permissions** — tool-level allow/deny/ask, path-level write restrictions, and network host allowlists. All configurable per-project.
- **Audit logging** — permission changes, secret access, and preset applications are logged with timestamps.
- **Prompt injection detection** — the research plugin treats all external content as untrusted, scanning for injection attempts before processing.

See the [Secrets Management guide](website/content/docs/guides/secrets-management.md) for setup with 1Password, direnv, Google Secret Manager, and CI environments.

## 🖥️ Desktop App

A Tauri desktop companion that brings the harness concept to a native UI.

- **Sync engine** — compiles `harness.yaml` to platform configs
- **Plugin explorer** — browse and manage installed plugins
- **Board** — kanban project board with real-time Claude ↔ web sync and per-card agent execution via LangGraph
- **Observatory** — live session dashboard with stats and transcripts

See [`apps/desktop/`](apps/desktop/) for the full feature list and build instructions. The desktop app is a separate product from the plugin marketplace.

## 🌐 Cross-Platform

- **Claude Code** — native plugin marketplace support
- **Cursor** — SKILL.md files work as prompt instructions; `/harness-compile` generates native config
- **GitHub Copilot** — reads `CLAUDE.md` via `chat.useClaudeMdFile` (requires enabling this setting in VS Code)

See the [Harness Protocol spec](https://harnessprotocol.io) for the full cross-platform target mapping.

## 📚 Docs

- **[FAQ](docs/FAQ.md)** — What is this, why do I need it, how does it work
- **[Plugins vs. Skills](docs/plugins-vs-skills.md)** — Why everything ships as a plugin, even when it's just a prompt
- **[Claude Conventions](docs/claude-md-conventions.md)** — Organizing `CLAUDE.md`, `AGENT.md`, and `SOUL.md` with separation of concerns
- **[Understanding Agents ↗](https://harnessprotocol.io/docs/concepts/agents)** — AGENT.md, custom subagents, and "AI agent" disambiguation
- **[Changelog](CHANGELOG.md)** — What's changed across releases

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for plugin guidelines, skill conventions, and PR process.

## 📄 License

[Apache 2.0](LICENSE)
