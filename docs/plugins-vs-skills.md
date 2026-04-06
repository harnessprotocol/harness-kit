# Plugins vs. Skills

## At a glance

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

## Why everything here is a plugin

Some plugins in this repo are "just" a skill — `explain`, `lineage`, and `orient` each contain a single `SKILL.md` with no scripts or hooks. We package them as plugins anyway:

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

## Which should I use?

```
Want to share or distribute it?
 ├── Yes → Plugin
 └── No
      └── Expect it to need scripts or hooks?
           ├── Yes → Plugin
           └── No → Bare skill in ~/.claude/skills/
```

Starting with a bare skill for prototyping and promoting to a plugin once it stabilizes is a fine workflow. The plugin wrapper earns its keep at distribution time.

## Community Plugins

The plugin model isn't exclusive to this repo. Any marketplace-listed plugin can be installed the same way — add the marketplace, install by name. Some plugins developed outside harness-kit are worth knowing about:

| Plugin | Author | What it does |
|--------|--------|-------------|
| [`superpowers`](https://github.com/obra/superpowers) | [Jesse Vincent](https://github.com/obra) | Structured dev workflows — TDD, systematic debugging, brainstorming-before-coding, subagent delegation, and git worktree isolation |

**Installing a community plugin:**

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@obra
```

The same install pattern applies to any third-party marketplace. Community plugins are developed and maintained by their respective authors — check each repo for compatibility notes and update cadence.
