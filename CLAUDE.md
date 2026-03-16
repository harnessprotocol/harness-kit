# harness-kit

Claude Code configuration — skills, agents, and settings worth sharing, distributed as a plugin marketplace.

## Repo structure

```
harness-kit/
├── .claude-plugin/
│   └── marketplace.json          ← marketplace catalog
├── .github/
│   └── workflows/
│       └── validate.yml          ← CI: manifest parsing + version alignment
├── plugins/                      ← one directory per plugin
│   ├── research/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json       ← plugin manifest
│   │   ├── scripts/
│   │   │   └── rebuild-research-index.py
│   │   └── skills/
│   │       └── research/
│   │           ├── SKILL.md      ← skill definition (what Claude reads)
│   │           └── README.md     ← usage docs (what humans read)
│   ├── explain/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   └── skills/
│   │       └── explain/
│   │           ├── SKILL.md
│   │           └── README.md
│   ├── lineage/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   └── skills/
│   │       └── lineage/
│   │           ├── SKILL.md
│   │           └── README.md
│   ├── orient/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   └── skills/
│   │       └── orient/
│   │           ├── SKILL.md
│   │           └── README.md
│   └── iterm-notify/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── scripts/
│       │   └── notify.sh         ← hook script (wire manually in settings.json)
│       └── skills/
│           └── iterm-notify/
│               ├── SKILL.md
│               └── README.md
├── harness.yaml                  ← dogfooding config (plugins used to develop this repo)
├── install.sh                    ← script fallback for users without plugin marketplace
├── CLAUDE.md                     ← this file
└── README.md
```

## Adding a new plugin

### 1. Create the plugin directory

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json
├── agents/               ← optional, for specialist subagents
├── scripts/              ← optional, for bundled utilities
└── skills/
    └── <skill-name>/
        ├── SKILL.md
        └── README.md
```

Plugins can contain more than skills — agents, hooks, MCP servers, LSP servers, scripts. Everything inside the plugin directory ships together. Reference bundled files via `${CLAUDE_PLUGIN_ROOT}` in SKILL.md.

See the [plugins docs](https://code.claude.com/docs/en/plugins) for what's possible.

### 2. Write the plugin manifest

`plugins/<plugin-name>/.claude-plugin/plugin.json`:

```json
{
  "name": "<plugin-name>",
  "description": "One sentence describing what this plugin does.",
  "version": "0.1.0"
}
```

### 3. Register it in the marketplace

Add an entry to `.claude-plugin/marketplace.json` under `plugins`:

```json
{
  "name": "<plugin-name>",
  "source": "./<plugin-name>",
  "description": "One sentence describing what this plugin does.",
  "version": "0.1.0",
  "author": { "name": "your-github-handle" },
  "license": "Apache-2.0"
}
```

Note: `source` is relative to `pluginRoot` (`./plugins`), so `"./research"` resolves to `./plugins/research`.

### 4. Add a section to README.md

Under `## Skills` (or a new `## Agents`, `## Hooks` section as appropriate), add a one-liner and a link to the plugin's README.

### 5. Test it

```bash
# From within Claude Code:
/plugin marketplace add ./   # add local marketplace
/plugin install <plugin-name>@harness-kit
```

## Installing

Users add the marketplace once and install plugins by name:

```
/plugin marketplace add harnessprotocol/harness-kit
/plugin install research@harness-kit
```

## Versioning

Semver. Versions in `plugin.json` and `marketplace.json` must always match.

- **Patch** (0.1.0 → 0.1.1): Bug fixes, typo corrections, documentation clarifications. No change to what the skill does or how it behaves.
- **Minor** (0.1.0 → 0.2.0): New features, new plugins added, new capabilities within existing plugins. Existing behavior unchanged — users who ignore the update are unaffected.
- **Major** (0.x → 1.0): Breaking changes — renamed commands, removed features, changed output structure, anything that would break a user's existing workflow. 1.0.0 specifically means: stable, tested by real users, and committed to not breaking.

## Release checklist

1. Bump `version` in `plugins/<name>/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (must match)
2. Commit: `chore: bump research plugin to vX.Y.Z`
3. Create a GitHub release: `gh release create vX.Y.Z --generate-notes`

`--generate-notes` auto-generates notes from commits since the last tag.
