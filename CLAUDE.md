# claude-setup

Claude Code configuration — skills, agents, and settings worth sharing, distributed as a plugin marketplace.

## Repo structure

```
claude-setup/
├── .claude-plugin/
│   └── marketplace.json          ← marketplace catalog
├── plugins/
│   └── research/                 ← one directory per plugin
│       ├── .claude-plugin/
│       │   └── plugin.json       ← plugin manifest
│       ├── scripts/
│       │   └── rebuild-research-index.py
│       └── skills/
│           └── research/
│               ├── SKILL.md      ← skill definition (what Claude reads)
│               └── README.md     ← usage docs (what humans read)
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
  "version": "1.0.0"
}
```

### 3. Register it in the marketplace

Add an entry to `.claude-plugin/marketplace.json` under `plugins`:

```json
{
  "name": "<plugin-name>",
  "source": "./<plugin-name>",
  "description": "One sentence describing what this plugin does.",
  "version": "1.0.0",
  "author": { "name": "siracusa5" },
  "license": "MIT"
}
```

Note: `source` is relative to `pluginRoot` (`./plugins`), so `"./research"` resolves to `./plugins/research`.

### 4. Add a section to README.md

Under `## Skills` (or a new `## Agents`, `## Hooks` section as appropriate), add a one-liner and a link to the plugin's README.

### 5. Test it

```bash
# From within Claude Code:
/plugin marketplace add ./   # add local marketplace
/plugin install <plugin-name>@claude-setup
```

## Installing

Users add the marketplace once and install plugins by name:

```
/plugin marketplace add siracusa5/claude-setup
/plugin install research@claude-setup
```

## Versioning

Bump `version` in both `plugin.json` and the `marketplace.json` entry when making breaking changes to a plugin. Claude Code uses version to detect updates.

## Release checklist

When changing any plugin's skill files:

1. Bump `version` in `plugins/<name>/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
2. Commit together — version in both manifests must match
