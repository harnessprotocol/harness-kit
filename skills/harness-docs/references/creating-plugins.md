# Creating Plugins

<!-- Source: website/content/docs/guides/creating-plugins.md -->

## Directory Structure

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json
├── agents/               # optional, for specialist subagents
├── scripts/              # optional, for bundled utilities
└── skills/
    └── <skill-name>/
        ├── SKILL.md
        └── README.md
```

Reference bundled files in SKILL.md via `${CLAUDE_SKILL_DIR}`.

## Plugin Manifest (`plugin.json`)

```json
{
  "name": "<plugin-name>",
  "description": "One sentence describing what this plugin does.",
  "version": "0.1.0"
}
```

### Declaring Environment Variables

```json
{
  "name": "<plugin-name>",
  "description": "...",
  "version": "0.1.0",
  "requires": {
    "env": [
      {
        "name": "MY_API_KEY",
        "description": "API key for My Service — used to authenticate requests",
        "required": false,
        "sensitive": true,
        "when": "When the plugin calls My Service"
      }
    ]
  }
}
```

Set `required: true` only if the plugin can't function at all without it. Prefer `required: false` with graceful degradation.

## Register in Marketplace

Add to `.claude-plugin/marketplace.json` under `plugins`:

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

`source` is relative to `pluginRoot` (`./plugins`).

## SKILL.md

The SKILL.md is what Claude Code reads at runtime.

### Frontmatter

```yaml
---
name: my-skill
description: Use when user invokes /my-skill with [argument types]. [Behavior.] Do NOT use for [anti-patterns].
dependencies: python>=3.10, pandas>=1.5.0
disable-model-invocation: true
user-invocable: true
---
```

### Frontmatter Field Reference

| Field | Required | Constraint | Purpose |
|-------|----------|------------|---------|
| `name` | yes | 64 chars max, lowercase, hyphenated | Slash command name |
| `description` | yes | 1,024 chars max, no `<` or `>` | Activation trigger — Claude reads this to decide when to load the skill |
| `dependencies` | no | Comma-separated package specs | Runtime dependencies |
| `disable-model-invocation` | no | boolean | `true` = only user can invoke, not auto-triggered |
| `user-invocable` | no | boolean | `false` = Claude-only background knowledge, not a slash command |
| `context` | no | `fork` | Runs skill in isolated subagent with no conversation history |
| `agent` | no | `Explore`, `Plan` | Specialized subagent execution environment |

### Description Best Practices

The description is Claude's routing signal — loaded for every installed skill on every turn.

- Start with "Use when" and name the invocation pattern explicitly
- Include specific phrases a user would type
- Include negative triggers: "Do NOT use for X — use /other-skill instead"
- Format: `[What it does] + [When to use it] + [Key triggers] + [Anti-patterns]`
- No XML angle brackets; max 1,024 characters

Good: `Use when user invokes /research with a URL, GitHub repo, YouTube video, or local file. Processes sources into indexed research. Do NOT use for quick factual questions — use /explain instead.`

### Size Guidelines

- Keep SKILL.md under **500 lines / 5,000 words**
- Move reference tables, tag taxonomies, and lookup data to `references/` subdirectory
- Reference bundled files: `${CLAUDE_SKILL_DIR}/references/filename.md`
- Put critical instructions at the top

```
skills/
└── my-skill/
    ├── SKILL.md
    └── references/
        ├── tag-taxonomy.md
        └── quick-reference.md
```

### Required Sections

| Section | Required when |
|---------|--------------|
| `## Overview` with core principles | Always |
| `## Workflow` with numbered steps | Always (even 1-step skills) |
| `## Common Mistakes` table | Any skill with 3+ steps or file writes |
| `## Scope Controls` | Any skill that touches files |
| `## Argument Types` table | Any parameterized skill |

### Argument Substitution

`$ARGUMENTS` — full argument string from slash command invocation. Positional: `$0`, `$1`, etc.

```markdown
## Workflow
The user invoked: /my-skill $ARGUMENTS
```

### Dynamic Context Injection

Use `` `!command` `` to run a shell command and inject its output at skill load time:

```markdown
Current git diff:
`!git diff main...HEAD`
```

### Workflow Conventions

- Number all steps. Label mandatory order: `## Workflow (MANDATORY — follow in order)`
- Each step: one action, concrete command where applicable
- Use Bash blocks for exact commands Claude should run
- If a step requires stopping to verify: `**STOP HERE until file is written.**`

## Versioning

Versions in `plugin.json` and `marketplace.json` must always match.

- **Patch** (0.1.0 → 0.1.1): Bug fixes, typos, docs. No behavior change.
- **Minor** (0.1.0 → 0.2.0): New features. Existing behavior unchanged.
- **Major** (0.x → 1.0): Breaking changes — renamed commands, removed features, changed output structure.

## Release Checklist

1. Bump `version` in both `plugin.json` and `marketplace.json` (must match)
2. Commit: `chore: bump <plugin> to vX.Y.Z`
3. Create release: `gh release create vX.Y.Z --generate-notes`

## CI Validation

Two checks run on every PR:
- JSON manifests valid: `marketplace.json` and all `plugin.json` files parse without error
- Version alignment: `version` in `plugin.json` and `marketplace.json` must match exactly

## Agent Definitions (Optional)

If your plugin needs a specialist worker, add agent definitions under `agents/`:

```
plugins/<plugin-name>/
├── agents/
│   └── <agent-name>.md    # YAML frontmatter + system prompt
```

Minimal agent definition:

```yaml
---
name: code-explorer
description: Read-only codebase explorer
tools: [Read, Glob, Grep, Bash]
model: haiku
permissionMode: plan
---

You are a read-only codebase explorer. Search, read, and map code structure. Never modify files.
```

Invoke from a skill:
```markdown
## Step 3: Explore the Codebase
Use the Agent tool with agent `code-explorer` to map the directory structure.
```

## Hook Scripts (Optional)

Place hooks under `scripts/`. Hooks are NOT auto-configured on install — users must wire them manually in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/scripts/my-hook.sh"
      }]
    }]
  }
}
```

Hook best practices:
- Read hook input from stdin (JSON with `session_id`, `transcript_path`, `cwd`)
- Exit 0 quickly — hooks block Claude Code's lifecycle
- Use anti-recursion guards if your hook spawns `claude -p`
