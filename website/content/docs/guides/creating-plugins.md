---
sidebar_position: 1
title: Creating Plugins
---

# Creating Plugins

A step-by-step guide to creating a new harness-kit plugin.

## 1. Create the Plugin Directory

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

Plugins can contain more than skills — agents, hooks, MCP servers, LSP servers, scripts. Everything inside the plugin directory ships together. Reference bundled files via `${CLAUDE_SKILL_DIR}` in SKILL.md.

## 2. Write the Plugin Manifest

Create `plugins/<plugin-name>/.claude-plugin/plugin.json`:

```json
{
  "name": "<plugin-name>",
  "description": "One sentence describing what this plugin does.",
  "version": "0.1.0"
}
```

## 2a. Declare Environment Requirements

If your plugin depends on environment variables (API keys, tokens, service credentials), declare them in `plugin.json` under `requires.env`:

```json
{
  "name": "<plugin-name>",
  "description": "One sentence describing what this plugin does.",
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

Each entry needs a `name` (the env var) and `description` (one sentence: what it's for). Set `required: true` only if the plugin can't function at all without it — prefer `required: false` with graceful degradation in SKILL.md for optional integrations.

See [Secrets & Configuration](/docs/concepts/secrets-management) for the full field reference and security guidelines.

## 3. Register in the Marketplace

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

`source` is relative to `pluginRoot` (`./plugins`), so `"./research"` resolves to `./plugins/research`.

## 4. Write the SKILL.md

The SKILL.md is what Claude Code reads at runtime. Quality here is the primary review criterion.

### Frontmatter (required)

```yaml
---
name: my-skill
description: Use when user invokes /my-skill with [argument types]. [Behavior.] Do NOT use for [anti-patterns].
dependencies: python>=3.10, pandas>=1.5.0
disable-model-invocation: true
user-invocable: true
---
```

Full frontmatter field reference:

| Field | Required | Constraint | Purpose |
|-------|----------|------------|---------|
| `name` | yes | 64 chars max, lowercase, hyphenated | Slash command name |
| `description` | yes | 1,024 chars max, no `<` or `>` | Activation trigger — Claude reads this to decide when to load the skill |
| `dependencies` | no | Comma-separated package specs | Runtime dependencies (e.g., `python>=3.10`) |
| `disable-model-invocation` | no | boolean | `true` = only user can invoke, not auto-triggered by Claude |
| `user-invocable` | no | boolean | `false` = Claude-only background knowledge, not a slash command |
| `context` | no | `fork` | Runs skill in isolated subagent with no conversation history |
| `agent` | no | `Explore`, `Plan` | Specialized subagent execution environment |

**Description best practices:**

The description is Claude's routing signal — it's loaded for every installed skill on every turn. Write it like a trigger rule, not a summary.

- Start with "Use when" and name the invocation pattern explicitly
- Include specific phrases a user would type: "review my code", "explain this function"
- Include negative triggers to prevent false activation: "Do NOT use for quick factual questions — use /explain instead"
- Format: `[What it does] + [When to use it] + [Key triggers] + [Anti-patterns]`
- No XML angle brackets (`<` or `>`); max 1,024 characters

Good:
```
Use when user invokes /research with a URL, GitHub repo, YouTube video, or local file. Processes sources into indexed research. Do NOT use for quick factual questions — use /explain instead.
```

Too vague:
```
Use this skill to do research.
```

**Spec reference:** This frontmatter format follows the [Agent Skills open standard](https://agentskills.io). See also: [How to Create Custom Skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills).

### Size guidelines

- Keep SKILL.md under **500 lines / 5,000 words**
- Move reference tables, tag taxonomies, and lookup data to a `references/` subdirectory
- Reference bundled files via `${CLAUDE_SKILL_DIR}/references/filename.md`
- Put critical instructions at the top — Claude may deprioritize buried content

```
skills/
└── my-skill/
    ├── SKILL.md
    └── references/
        ├── tag-taxonomy.md
        └── quick-reference.md
```

### Required sections

| Section | Required when |
|---------|--------------|
| `## Overview` with core principles | Always |
| `## Workflow` with numbered steps | Always (even 1-step skills) |
| `## Common Mistakes` table | Any skill with 3+ steps or file writes |
| `## Scope Controls` | Any skill that touches files |
| `## Argument Types` table | Any parameterized skill |

### Optional sections

Common optional sections (not in the required table) that carry real behavioral signal:

| Section | When to include |
|---------|----------------|
| `## When to Use` | Skills with multiple trigger patterns or disambiguation needs |
| `## Invocation Examples` | Parameterized skills with varied input types |
| `## Adaptive Behavior` | Skills that change workflow based on input analysis |
| `## Red Flags` / `## Anti-patterns` | Complex skills with common misuse patterns |

### Argument substitution

Use `$ARGUMENTS` to pass the full argument string from the slash command invocation into SKILL.md content. Positional arguments are `$0`, `$1`, etc.

```markdown
## Workflow

The user invoked: /my-skill $ARGUMENTS

### Step 1: Parse Input
Argument 1: $1
Argument 2: $2
```

Invoked as `/my-skill readme src/auth/` → `$ARGUMENTS` = `readme src/auth/`, `$1` = `readme`, `$2` = `src/auth/`.

### Dynamic context injection

Use `` `!command` `` syntax to run a shell command and inject its output into the skill before Claude reads it:

```markdown
Current git diff:
`!git diff main...HEAD`

Review the changes above.
```

The shell command runs at skill load time. Output is injected inline. Use this to pre-populate skills with live context — current branch, recent commits, environment info.

### Workflow conventions

- Number all steps. Label mandatory order: `## Workflow (MANDATORY — follow in order)`
- Each step: one action, concrete command where applicable.
- Use Bash blocks for exact commands Claude should run.
- If a step requires stopping to verify: `**STOP HERE until file is written.**`

### Common Mistakes table

```markdown
## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Did X wrong | Do Y instead |
```

Two columns, two sentences max per row.

### What NOT to add

- Don't repeat the README in the SKILL.md — README is for humans, SKILL.md is for the model.
- Don't describe philosophy or background. State the workflow.
- Don't add sections not listed above unless they carry real behavioral signal.

## 5. Write the README.md

The README is human-facing documentation. Cover:

- What the plugin does (prose overview)
- Requirements
- Usage examples (copy-paste ready)
- Output structure
- Design notes (rationale)

## 5a. Add Agent Definitions (Optional)

If your plugin needs a specialist worker — for delegated analysis, parallel processing, or scoped read-only exploration — add agent definitions under `agents/`:

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md
│       └── README.md
└── agents/
    └── <agent-name>.md    ← YAML frontmatter + system prompt
```

When to include an agent:
- **Delegated analysis** — work that benefits from a clean context window with no session history
- **Read-only exploration** — use `permissionMode: plan` to provably prevent file writes
- **Background processing** — long-running tasks that run while the main session continues
- **Parallel work** — use `isolation: worktree` for agents that work simultaneously

A minimal agent definition:

```yaml
---
name: code-explorer
description: Read-only codebase explorer — searches and maps code structure without modifying files
tools: [Read, Glob, Grep, Bash]
model: haiku
permissionMode: plan
---

You are a read-only codebase explorer. Search, read, and map code structure.
Never modify files. Report findings clearly.
```

To invoke your agent from a skill, instruct Claude to use the Agent tool with your agent name:

```markdown
## Step 3: Explore the Codebase

Use the Agent tool with agent `code-explorer` to map the directory structure.
```

See [Understanding Agents](/docs/concepts/agents) for the full frontmatter field reference.

## 5b. Add Hook Scripts (Optional)

If your plugin includes lifecycle hooks (scripts that fire on Claude Code events like `Stop` or `Notification`), place them under `scripts/`:

```
plugins/<plugin-name>/
├── scripts/
│   └── my-hook.sh
```

Hooks are NOT auto-configured on install. Users must manually wire them in `~/.claude/settings.json`:

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

Document the wiring in your plugin's README.

### Hook best practices

- Read hook input from stdin (JSON with `session_id`, `transcript_path`, `cwd`)
- Exit 0 quickly — hooks block Claude Code's lifecycle
- Use anti-recursion guards if your hook spawns `claude -p`
- Make all paths configurable via environment variables
- Never hardcode personal paths or PII

## 6. Add to Root README

Under the `## Plugins` table in the repo root `README.md`, add a row linking to your plugin's README.

## 7. Test It

```bash
# From within Claude Code:
/plugin marketplace add ./   # add local marketplace
/plugin install <plugin-name>@harness-kit
```

## Versioning

Versions in `plugin.json` and `marketplace.json` must always match.

- **Patch** (0.1.0 → 0.1.1): Bug fixes, typo corrections, documentation. No behavior change.
- **Minor** (0.1.0 → 0.2.0): New features, new capabilities. Existing behavior unchanged.
- **Major** (0.x → 1.0): Breaking changes — renamed commands, removed features, changed output structure.

## Release Checklist

1. Bump `version` in both `plugin.json` and `marketplace.json` (must match)
2. Commit: `chore: bump <plugin> to vX.Y.Z`
3. Create release: `gh release create vX.Y.Z --generate-notes`

## CI Validation

Two checks run on every PR:

| Check | What it validates |
|-------|------------------|
| JSON manifests valid | `marketplace.json` and all `plugin.json` files parse without error |
| Version alignment | `version` in `plugin.json` and `marketplace.json` must match exactly |

Both must pass before merge.
