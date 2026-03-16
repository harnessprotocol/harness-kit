# Contributing

## Quick start

```
git checkout -b feat/<plugin-name>
# implement plugin (see CLAUDE.md for full 5-step guide)
# open PR against main
```

CI runs on every PR. Squash merge only.

---

## Adding a plugin

The full step-by-step guide lives in [CLAUDE.md](CLAUDE.md) — directory layout, manifest format, marketplace registration, versioning, and the release checklist. This file covers what comes after: skill quality, PR format, and commit standards.

---

## Naming convention

Plugin and skill names follow these rules:

- **Lowercase kebab-case** — `merge-pr`, not `MergePR` or `merge_pr`
- **Verb-first for actions** — `merge-pr` (merges), `review` (reviews), `capture` (captures)
- **Noun for modes/tools** — `research`, `explain`, `notify`
- **Max 2 words** — `pr-sweep`, not `pull-request-sweep`
- **Prefer shorter names** — `capture` over `capture-session`, `stats` over `usage-stats`

The plugin directory name, skill directory name, SKILL.md `name:` field, and `plugin.json` `name` field must all match exactly.

---

## Writing SKILL.md

Skill quality is the primary review criterion. Get this right.

### Frontmatter (required)

```yaml
---
name: my-skill
description: Use when user invokes /my-skill with [argument types]. [One sentence of behavior.]
---
```

- `name` — the slash command (no spaces, lowercase, hyphenated)
- `description` — the trigger. Claude Code reads this to decide when to invoke the skill. Must start with "Use when" and name the invocation pattern explicitly.

**Do not** write a vague description like "Helps the user manage tasks." Write what signals it: `/my-skill` invocation, specific argument types, or natural language patterns.

### Required sections

| Section | Required when |
|---------|--------------|
| `## Overview` with core principles | Always |
| `## Workflow` with numbered steps | Always (even 1-step skills) |
| `## Common Mistakes` table | Any skill with 3+ steps or file writes |
| `## Scope Controls` | Any skill that touches files |
| `## Argument Types` table | Any parameterized skill |

### Workflow conventions

- Number all steps. Label them mandatory when order matters: `## Workflow (MANDATORY — follow in order)`
- Each step: one action, concrete command where applicable. Never vague ("process the file" → tell it exactly how).
- Use Bash blocks for exact commands Claude should run.
- If a step requires stopping to verify before continuing, say so explicitly: `**STOP HERE until file is written.**`

### Common Mistakes table format

```markdown
## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Did X wrong | Do Y instead |
```

Two columns, two sentences max per row. Prefer concrete over general.

### What not to add

- Don't repeat the README in the SKILL.md — the README is for humans, the SKILL.md is for the model.
- Don't describe the plugin philosophy or background. State the workflow.
- Don't add sections not listed above unless they carry real behavioral signal.

---

## PR format

### Branch naming

```
feat/<plugin-name>          # new plugin
feat/<plugin>/<feature>     # enhancement to existing plugin
fix/<plugin>/<issue>        # bug fix
docs/<name>                 # documentation only
chore/<name>                # maintenance, version bumps
```

### PR description

Use this structure (reference PR #1 and #3 for examples):

```markdown
## Summary

- What this adds or changes (bullets)

## What ships

| File | Purpose |
|------|---------|
| plugins/x/.claude-plugin/plugin.json | Plugin manifest |
| plugins/x/skills/x/SKILL.md | Skill definition |
| plugins/x/skills/x/README.md | Human-facing docs |

## CI

- JSON manifests valid ✓
- Version aligned between plugin.json and marketplace.json ✓

## Test plan

- [ ] Test case 1
- [ ] Test case 2
```

### Merge strategy

Squash merge only. One commit per PR lands on main.

---

## Commits

Conventional commits with imperative present tense:

| Prefix | Use for |
|--------|---------|
| `feat:` | New plugin, new capability |
| `feat(scope):` | Enhancement to specific plugin |
| `fix:` | Bug in an existing skill or script |
| `docs:` | Documentation only — no skill behavior changes |
| `chore:` | Version bumps, CI, tooling |
| `refactor:` | Internal restructuring, no behavior change |

Examples from this repo:
```
feat: capture-session plugin — on-demand session information capture
feat(orient): improve query behavior, caps, and output format
docs: add plugins vs. skills guide
chore: set initial version to v0.1.0
```

---

## CI

Two checks run on every PR:

| Check | What it validates |
|-------|------------------|
| JSON manifests valid | `marketplace.json` and all `plugin.json` files parse without error |
| Version alignment | `version` in `plugin.json` and `marketplace.json` must match exactly |

Both must pass before merge. If they fail: fix manifests, push, CI re-runs automatically.

---

## Pre-submit checklist

Before opening a PR:

- [ ] `plugins/<name>/.claude-plugin/plugin.json` exists and is valid JSON
- [ ] `marketplace.json` has a matching entry with the same `version`
- [ ] `SKILL.md` has YAML frontmatter with `name:` and `description:`
- [ ] `description:` starts with "Use when" and names the invocation trigger
- [ ] `README.md` exists in `plugins/<name>/skills/<name>/`
- [ ] Plugin section added to `README.md` at repo root
- [ ] PR includes a test plan with at least one test per argument type
- [ ] If plugin includes agents: `agents/<name>.md` has YAML frontmatter with `name:` and `description:`
