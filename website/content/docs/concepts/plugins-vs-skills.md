---
sidebar_position: 1
title: Plugins vs. Skills
---

# Plugins vs. Skills

## At a Glance

```
Marketplace
 └── Plugin (distribution unit)
      ├── .claude-plugin/plugin.json    ← metadata, version
      ├── skills/
      │    └── my-skill/
      │         ├── SKILL.md            ← the prompt (runtime unit)
      │         └── README.md           ← docs
      ├── scripts/                      ← optional automation
      └── hooks/                        ← optional triggers
```

|  | Skill | Plugin |
|--|-------|--------|
| **What it is** | A prompt file | A package containing skills + extras |
| **Installed via** | Copy to `~/.claude/skills/` | `/plugin install name@marketplace` |
| **Versioned** | No | Yes (`plugin.json`) |
| **Can include scripts/hooks** | No | Yes |
| **Listed in marketplace** | No | Yes |

**One sentence:** the skill is what Claude Code runs; the plugin is how users install it.

## Progressive Disclosure Architecture

Skills use a three-level loading model to balance context efficiency with capability:

```
Level 1: YAML frontmatter          ← always loaded (~100 tokens per skill)
          name, description          → Claude reads these to decide when to activate
                ↓
Level 2: SKILL.md body             ← loaded when the skill is selected
          workflow, steps, rules     → the actual instructions Claude follows
                ↓
Level 3: references/ files         ← loaded on demand
          tag taxonomies, lookup     → detail pulled in only when needed
          tables, checklists
```

This is why description quality matters: Claude reads Level 1 for every installed skill, every turn. A well-crafted description routes correctly without burning context. A bloated SKILL.md is only a problem when the skill activates — but a bloated description wastes tokens on every message.

Practical consequence: keep SKILL.md under 500 lines. Move reference tables, tag taxonomies, and lookup data to `references/` files. Load them via `${CLAUDE_SKILL_DIR}/references/filename.md`.

## Open Standard

The Agent Skills specification that underlies this format is published as an open standard at [agentskills.io](https://agentskills.io). Skills built to this spec are portable across platforms — Claude Code, Copilot, and any other compliant host. See the [Cross-Harness setup guide](/docs/cross-harness/setup-guide) for how this works in practice.

## Why Everything Here is a Plugin

Some plugins in this repo are "just" a skill — `explain`, `data-lineage`, and `orient` each contain a single `SKILL.md` with no scripts or hooks. We package them as plugins anyway:

- **Room to grow** — Adding scripts or hooks later is a file addition, not a restructuring. `research` started as a bare skill and grew a prompt-injection scanner and an index rebuild script.
- **Uniform install** — One mental model: add the marketplace, install by name. Users don't need to know what's inside.
- **Versioning** — `plugin.json` gives each capability a version and description. Bare skill files have no standard place for this.
- **Discoverability** — Plugins are listed in the marketplace. Bare skills sit in `~/.claude/skills/` with no catalog.

## Trade-offs

| | Plugin | Bare skill |
|--|--------|------------|
| **Setup cost** | ~10 lines of boilerplate (dirs + `plugin.json`) | Just write a `SKILL.md` |
| **Iteration speed** | Create structure first, then iterate | Drop a file, start immediately |
| **User expectations** | "Plugin" implies more than a prompt | No expectations beyond the prompt |
| **Extensibility** | Add scripts/hooks anytime | Promote to plugin later if needed |

## Which Should I Use?

```
Want to share or distribute it?
 ├── Yes → Plugin
 └── No
      └── Expect it to need scripts or hooks?
           ├── Yes → Plugin
           └── No → Bare skill in ~/.claude/skills/
```

Starting with a bare skill for prototyping and promoting to a plugin once it stabilizes is a fine workflow. The plugin wrapper earns its keep at distribution time.
