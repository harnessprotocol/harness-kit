<div align="center">

# harness-kit

Portable configuration for AI coding tools.

[![Release](https://img.shields.io/github/v/release/harnessprotocol/harness-kit?style=flat-square)](https://github.com/harnessprotocol/harness-kit/releases)
[![Validate](https://img.shields.io/github/actions/workflow/status/harnessprotocol/harness-kit/validate.yml?style=flat-square&label=validate)](https://github.com/harnessprotocol/harness-kit/actions/workflows/validate.yml)
[![Build](https://img.shields.io/github/actions/workflow/status/harnessprotocol/harness-kit/build.yml?style=flat-square&label=build)](https://github.com/harnessprotocol/harness-kit/actions/workflows/build.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Plugins](https://img.shields.io/badge/plugins-17-8A2BE2?style=flat-square)](.claude-plugin/marketplace.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

Works with [Claude Code](https://claude.ai/claude-code) · [Cursor](https://cursor.com) · [GitHub Copilot](https://github.com/features/copilot) · [Codex](https://openai.com/codex) · [OpenCode](https://opencode.ai) · [Windsurf](https://windsurf.com) · [Gemini CLI](https://github.com/google-gemini/gemini-cli) · [Junie](https://www.jetbrains.com/junie/)

</div>

## 🧰 What is harness-kit?

Your AI coding setup — plugins, skills, MCP servers, hooks, conventions — packaged into a single config you can apply to any tool on any machine. Build it once, share it with your team in one file.

## 📦 Install

**Skills & Plugins** (Claude Code):
```
/plugin marketplace add harnessprotocol/harness-kit
```

**CLI** (`harness validate`, `compile`, `sync`, ...):
```bash
brew tap harnessprotocol/tap && brew install harness-kit
# or: npm install -g @harness-kit/cli  # requires Node.js 22+
```

**Desktop App**:
```bash
brew tap harnessprotocol/tap  # skip if you already ran this above
brew install --cask harness-kit
```
Or download the `.dmg` directly from the [latest release](https://github.com/harnessprotocol/harness-kit/releases/latest) and drag **Harness Kit.app** to `/Applications`. Note: the app is not notarized — right-click and select **Open** on first launch.

<details>
<summary>Nightly builds (latest main, rebuilt daily — may be unstable)</summary>

```bash
brew tap harnessprotocol/tap  # skip if already added
brew install harnessprotocol/tap/harness-kit-nightly          # CLI nightly → installs as harness-kit-nightly
brew install --cask harnessprotocol/tap/'harness-kit@nightly' # desktop nightly
```

Nightly builds track the tip of `main` and are rebuilt every day at midnight UTC. Use them to get the latest features before a stable release — at the cost of stability guarantees.
</details>

<details>
<summary>Fallback: install skills with script (no Node required)</summary>

If your Claude Code build doesn't support the plugin marketplace:

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
/explain src/auth/middleware.ts       # explain a specific file
/explain the payment processing flow  # search the codebase for a concept
/explain src/services/                # map a directory
```

Produces a layered explanation: summary, key components, how it connects, patterns, gotchas, and where to start if you need to change it.

## 🔌 Plugins

A few highlights to get started:

| Plugin | What it does | Try it |
|--------|-------------|--------|
| [`explain`](plugins/explain/skills/explain/README.md) | Layered code explanations for files, functions, directories, or concepts | `/explain src/auth/` |
| [`research`](plugins/research/skills/research/README.md) | Process any source into a structured, compounding knowledge base | `/research https://...` |
| [`review`](plugins/review/skills/review/README.md) | Code review with severity labels and cross-file analysis | `/review` |
| [`lineage`](plugins/lineage/skills/lineage/README.md) | Column-level data lineage through SQL, Kafka, Spark, and JDBC | `/lineage orders.amount` |
| [`rubber-ducky`](plugins/rubber-ducky/skills/rubber-ducky/README.md) | Cross-model second opinion on your plans and code before you commit | `/rubber-ducky` |

> 📋 **[Browse all 17 plugins →](.claude-plugin/marketplace.json)** or run `/plugin marketplace browse harness-kit`

### 🌍 Community

| Plugin | Author | What it does |
|--------|--------|-------------|
| [`superpowers`](https://github.com/obra/superpowers) | [Jesse Vincent](https://github.com/obra) | TDD, systematic debugging, brainstorming-before-coding, subagent delegation, git worktree isolation |

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@obra
```

## 🔄 Port Your Whole Harness

Capture the native configuration you already use, reconcile it with personal, project, session, and organization policy, then apply it to any supported harness. Preview is the default; conflicts and unsupported capabilities block writes until you make an explicit choice.

```bash
harness-kit capture --scope project
harness-kit capture --scope project --yes --force
harness-kit reconcile harness.yaml --target all --json
harness-kit apply harness.yaml --target codex --yes
harness-kit rollback --yes
```

Repository-local skills can be promoted without moving them first: either pin their existing `owner/repo/path` source or package their declared files into a content-addressed capsule.

```bash
harness-kit skills discover
harness-kit skills promote ./skills/review --mode reference --yes
harness-kit skills promote ./skills/review --mode capsule --scope personal --yes
```

The organization workflow is currently a release preview pending managed and self-hosted contract certification. Enrolled devices use the same engine for staged updates: optional updates stay in preview, while a policy-mandated update applies without a second consent prompt, verifies convergence, reports health, and restores the prior transaction on failure.

```bash
harness-kit auth login
harness-kit org rollout-sync <organization-id> --target all
```

The existing plugin-oriented workflows remain available:

| Command | What it does |
|---------|-------------|
| `/harness-export` | Write `harness.yaml` from your current setup |
| `/harness-import harness.yaml` | Interactive wizard — pick what to install |
| `/harness-compile` | Compile to native configs for all eight supported targets |
| `/harness-sync` | Keep supported tool configs aligned |
| `/harness-validate` | Validate a Harness Protocol profile |

<details>
<summary>Shell fallback (no Claude Code required)</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness-restore.sh | bash -s -- harness.yaml
```

See [`harness.yaml.example`](harness.yaml.example) for the config format. New captures use Harness Protocol v2; v1 profiles continue to parse, compile, and reconcile.
</details>

## 🔒 Security & Privacy

- **Local by default** — Harness Kit does not upload local source material. An enrolled organization may receive a client-redacted inventory of assignments, digests, target state, and drift; raw files, prompts, skill bodies, secret values, and environment contents are excluded on-device.
- **Local state stays local** — reconciliation bases, ownership fingerprints, device assignments, backups, and rollback manifests live under a self-ignoring `.harness/` directory.
- **Secrets stay out of config** — plugins declare environment variables they need (`requires.env` in `plugin.json`) with `required`, `optional`, and `sensitive` flags. Values live in your shell profile, direnv, or a secrets manager — never in checked-in files. Harness Kit does not persist, transmit, or log detected secret values.
- **Plain text, fully inspectable** — plugins are markdown and JSON. No binaries, no background processes, no network calls on install. Scripts and hooks only run when you explicitly invoke a skill.
- **Granular permissions** — tool-level allow/deny/ask, path-level write restrictions, and network host allowlists. All configurable per-project.
- **Audit logging** — permission changes, secret access, and preset applications are logged with timestamps.
- **Prompt injection detection** — the research plugin treats all external content as untrusted, scanning for injection attempts before processing.

See the [Secrets Management guide](website/content/docs/guides/secrets-management.md) for setup with 1Password, direnv, Google Secret Manager, and CI environments.

## 🖥️ Desktop App

A Tauri desktop control plane for your AI coding harnesses — config console with reverse-import and drift-repair. No external services required for any core path.

- **Sync engine** — compiles `harness.yaml` to platform configs
- **Plugin explorer** — browse and manage installed plugins
- **Marketplace** — embedded plugin browser for discovering and installing from the marketplace
- **Observatory** — live session dashboard with stats and transcripts, reading local `~/.claude` data
- **Comparator** — structured evaluation workbench: configure harnesses, run side-by-side comparisons, review file diffs, and judge results across a 4-phase workflow, local-only
- **Harness editor** — inline editing with custom profiles
- **Parity** — cross-platform feature parity tracking across AI coding tools
- **Fleet and Drift** — layered capture/apply previews, capability losses, reconciliation conflicts, governed rollout status, and local rollback history
- **Security** — permissions editor, secrets management, and audit logging

See [`apps/desktop/`](apps/desktop/) for build instructions. The desktop app is a separate product from the plugin marketplace.

## 🌐 Cross-Platform

- **Claude Code** — native plugin marketplace support
- **Cursor** — SKILL.md files work as prompt instructions; `/harness-compile` generates native config
- **GitHub Copilot** — reads `CLAUDE.md` natively via `chat.useClaudeMdFile`

See the [Harness Protocol spec](https://harnessprotocol.ai) for the full cross-platform target mapping.

## 📚 Docs

- **[FAQ](docs/FAQ.md)** — What is this, why do I need it, how does it work
- **[Plugins vs. Skills](docs/plugins-vs-skills.md)** — Why everything ships as a plugin, even when it's just a prompt
- **[Claude Conventions](docs/claude-md-conventions.md)** — Organizing `CLAUDE.md`, `AGENT.md`, and `SOUL.md` with separation of concerns
- **[Understanding Agents](https://harnessprotocol.ai/docs/concepts/agents)** — AGENT.md, custom subagents, and "AI agent" disambiguation

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for plugin guidelines, skill conventions, and PR process.

## 📬 Contact

- **General** — [contact@harnesskit.ai](mailto:contact@harnesskit.ai)
- **Security** — [security@harnesskit.ai](mailto:security@harnesskit.ai) (see [SECURITY.md](SECURITY.md))

## 📄 License

[Apache 2.0](LICENSE)
