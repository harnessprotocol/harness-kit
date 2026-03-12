---
sidebar_position: 3
title: Contributing
---

# Contributing

## Quick Start

```
git checkout -b feat/<plugin-name>
# implement plugin (see Creating Plugins guide)
# open PR against main
```

CI runs on every PR. Squash merge only.

## Writing SKILL.md

Skill quality is the primary review criterion. See the [Creating Plugins](/docs/guides/creating-plugins) guide for the full SKILL.md specification, including required frontmatter, sections, and workflow conventions.

## PR Format

### Branch Naming

```
feat/<plugin-name>          # new plugin
feat/<plugin>/<feature>     # enhancement to existing plugin
fix/<plugin>/<issue>        # bug fix
docs/<name>                 # documentation only
chore/<name>                # maintenance, version bumps
```

### PR Description

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

- JSON manifests valid
- Version aligned between plugin.json and marketplace.json

## Test plan

- [ ] Test case 1
- [ ] Test case 2
```

### Merge Strategy

Squash merge only. One commit per PR lands on main.

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

## CI

Two checks run on every PR:

| Check | What it validates |
|-------|------------------|
| JSON manifests valid | `marketplace.json` and all `plugin.json` files parse without error |
| Version alignment | `version` in `plugin.json` and `marketplace.json` must match exactly |

Both must pass before merge.

## Pre-Submit Checklist

- [ ] `plugins/<name>/.claude-plugin/plugin.json` exists and is valid JSON
- [ ] `marketplace.json` has a matching entry with the same `version`
- [ ] `SKILL.md` has YAML frontmatter with `name:` and `description:`
- [ ] `description:` starts with "Use when" and names the invocation trigger
- [ ] `README.md` exists in `plugins/<name>/skills/<name>/`
- [ ] Plugin section added to root `README.md`
- [ ] PR includes a test plan with at least one test per argument type
