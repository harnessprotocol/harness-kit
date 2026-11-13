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

**CLI** (`harness validate`, `compile`, `install`, `sync`, ...):
```bash
brew tap harnessprotocol/tap && brew install harness-kit
# or: npm install -g @harnessprotocol/cli  # requires Node.js 24+
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

## ✅ Use in CI

Fail a pull request when compiled config files no longer match `harness.yaml`:

```yaml
name: Harness
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: harnessprotocol/harness-kit@v0.13.1
        with:
          target: claude-code,cursor,agents-md
```

The step exits 1 on drift and writes a table of the drifted files to the job summary. Run `harness compile` locally and commit the result to fix it.

| Input | Default | Meaning |
|-------|---------|---------|
| `command` | `check` | `check` compares compiled files with `harness.yaml`. `status` reports drift across detected tools. |
| `harness-file` | `harness.yaml` | Path to the profile (`check`). |
| `target` | all | Comma-separated targets (`check`). |
| `baseline` | none | Team baseline `harness.yaml` in the checkout (`status`). |
| `cli-version` | the release version | npm version or dist-tag of the `harness-kit` npm package, for example `latest`. |

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

A Tauri desktop app that shows what each AI coding tool on your machine has configured, and lets you copy a missing piece from one tool to another. It reads local files. No external service is needed.

- **Machine** is the home screen. A grid lists every MCP server, skill, instruction file and plugin across the tools it finds, with one column per tool. Click a cell to open a drawer that shows where the resource lives, how copies differ, and a copy action from one tool to another. Tools that are not installed are hidden until you choose "Show all".
- **Drift** is a view inside Machine. It compares your `harness.yaml` with the files compiled from it, shows a diff for each item, and previews a fix before writing anything.
- **Profile** edits `harness.yaml` and compiles it into a project. With no project chosen, Profile and Compile use your personal `~/.claude/harness.yaml`. With a project chosen in the title bar, they use that project's committed `harness.yaml` as the team baseline.
- **Claude Code** holds the editors for that tool: Instructions, MCP servers, Plugins, Hooks, Permissions, and Usage (sessions, tool calls and tokens read from `~/.claude`).
- **Marketplace** browses the plugin catalog.
- **Settings** holds preferences, secrets and the activity log.
- **Comparator** runs the same prompt across tools side by side. It is off until you turn it on in Settings under Labs.

How it handles your files:

- Copies, Compile and Drift fixes show a preview before they write. Backups and rollback points for files in your home folder go to `~/.harness/backups/`, and for a project to that project's `.harness/backups/`.
- The app has no shell access. Folder choices, plugin imports and exports use native dialogs.
- Security presets merge into your permissions and list any deny rule they would remove before writing.
- Dialogs trap focus and return it on close, menus work from the keyboard, and text colors meet WCAG AA contrast.

To build or run it, see [CONTRIBUTING.md](CONTRIBUTING.md) (`pnpm dev:desktop`). Design rules are in [`apps/desktop/DESIGN.md`](apps/desktop/DESIGN.md). The desktop app is a separate product from the plugin marketplace.

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
