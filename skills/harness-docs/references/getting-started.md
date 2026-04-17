# Getting Started with Harness Kit

<!-- Source: website/content/docs/getting-started/installation.mdx, quick-start.mdx, architecture.mdx -->

## Installation

harness-kit ships three installable artifacts:

| Artifact | What it does | How to install |
|----------|-------------|----------------|
| **Skills & Plugins** | Adds slash commands to Claude Code | Plugin marketplace or install script |
| **CLI** (`harness-kit`) | Compiles and validates `harness.yaml` from the terminal | Homebrew, npm, or direct download |
| **Desktop App** | Visual interface for managing your AI tool configurations | Homebrew Cask or DMG |

Most users start with skills. The CLI and desktop app are for teams managing shared `harness.yaml` configs.

### Install via Plugin Marketplace (recommended)

Add the marketplace once, then install any plugin by name:

```
/plugin marketplace add harnessprotocol/harness-kit
/plugin install research@harness-kit
```

Install additional plugins:

```
/plugin install explain@harness-kit
/plugin install lineage@harness-kit
/plugin install orient@harness-kit
/plugin install capture@harness-kit
/plugin install review@harness-kit
/plugin install docgen@harness-kit
```

### Install via Script (fallback)

If your Claude Code build doesn't support the plugin marketplace yet:

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/install.sh | bash
```

This downloads skill files to `~/.claude/skills/`. It installs only skill files — bundled scripts require the full marketplace install.

### Verify Installation

```
/research
/explain src/main.ts
```

If the skill responds with its workflow, installation succeeded.

### Install CLI

```bash
# Homebrew
brew tap harnessprotocol/tap
brew install harness-kit

# npm
npm install -g @harness-kit/cli

# Verify
harness-kit --version
harness-kit validate
```

## Requirements per Plugin

| Plugin | Requirements |
|--------|-------------|
| research | `gh` CLI (GitHub sources only), Python 3.10+ (index rebuild) |
| explain | None |
| lineage | None |
| orient | None (optional: MCP Memory Server) |
| capture | None |
| review | `gh` CLI (PR review only) |
| docgen | None |
| open-pr | `gh` CLI |
| merge-pr | `gh` CLI |
| pr-sweep | `gh` CLI, review plugin |
| harness-share | None |
| stats | Python 3.10+ |
| board | Node.js (board server) |
| iterm-notify | macOS, iTerm2, terminal-notifier, jq |
| membrain | Go 1.25+, membrain MCP server |
| frontend-design | None |

## Architecture

### Plugin Lifecycle

1. **Source** — Register harness-kit as a plugin source in your AI tool.
2. **Install** — Install a plugin by name. Your harness downloads the plugin directory locally.
3. **Discovery** — At session start, your harness scans installed plugins and registers any skills it finds.
4. **Invocation** — You type a command (e.g. `/research`). Your harness loads the matching `SKILL.md` into context as the workflow definition.
5. **Execution** — The AI follows the steps in SKILL.md, using available tools (file I/O, web fetch, shell commands, MCP servers).

### Plugin Anatomy

```
plugins/<name>/
├── .claude-plugin/
│   └── plugin.json         # name, version, description
├── skills/
│   └── <name>/
│       ├── SKILL.md        # the workflow (what Claude reads)
│       └── README.md       # human documentation
└── scripts/                # optional: automation scripts
    hooks/                  # optional: event hooks
    agents/                 # optional: agent configurations
```

### What Makes a Skill Different from a Prompt

A SKILL.md specifies: mandatory step ordering, input parsing rules, tool usage patterns, output structure, error handling, and common mistakes. This structure makes skills repeatable across sessions.

### Sharing Your Setup

1. **Export** — `/harness-export` captures your installed plugins and sources into `harness.yaml`.
2. **Share** — Commit to a repo, drop in Slack, include in onboarding docs.
3. **Import** — `/harness-import harness.yaml` presents an interactive list. Teammates pick what they want.

## Using with Other Tools

SKILL.md files are plain markdown — copy them into any tool's instruction system:

- **GitHub Copilot** — Copy to `.github/copilot-instructions.md` or install via `copilot plugin install harnessprotocol/harness-kit`
- **Cursor** — Copy to `.cursor/rules/<name>.mdc`
- **Windsurf** — Paste into `.windsurfrules`
- **VS Code Copilot** — Reads `CLAUDE.md` natively via `chat.useClaudeMdFile` setting

See `cross-harness.md` in this references directory for full details.
