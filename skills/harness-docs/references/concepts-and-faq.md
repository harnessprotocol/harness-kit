# Concepts and FAQ

<!-- Source: website/content/docs/concepts/plugins-vs-skills.md, concepts/comparison.md, faq.md -->

## Core Concepts

### What is harness-kit?

harness-kit is a harness-agnostic framework for AI coding tools. Plugins, skills, MCP servers, hooks, and conventions live in one portable config. It works with Claude Code today and is designed to travel across tools (Copilot, Cursor, Windsurf, whatever comes next).

Plugins are the entry point: installable slash commands that bundle complete workflows and follow you across every project. Export your full setup as a `harness.yaml`, share it with a teammate, and they're up and running.

### What is a harness?

Every AI coding tool has its own setup folder — Claude Code's `~/.claude`, Cursor's `.cursor`, Copilot's config. A **harness** is that setup: the configuration that tells your AI how to work in a given session. **Harness Kit** is the app that operates all of them, collapsing the per-tool harnesses into one `harness.yaml`.

### Skill vs. Plugin

A **skill** is a `SKILL.md` file — the workflow Claude reads when you type a slash command.  
A **plugin** is the package that wraps it: a directory with the skill, optional scripts, and a version number.  
You install the plugin; Claude reads the skill.

```
Marketplace
 └── Plugin (distribution unit)
      ├── .claude-plugin/plugin.json    ← metadata, version
      ├── skills/
      │    └── my-skill/
      │         ├── SKILL.md            ← the prompt (runtime unit)
      │         └── README.md           ← docs
      ├── agents/                       ← optional specialist workers
      ├── scripts/                      ← optional automation
      └── hooks/                        ← optional triggers
```

### How is SKILL.md different from a regular prompt?

A prompt tells Claude what to do. A SKILL.md specifies how: step ordering, input parsing, output format, error handling, and known failure modes. That structure makes the same command produce consistent output every time.

### Progressive Disclosure (three loading levels)

```
Level 1: YAML frontmatter          ← always loaded (~100 tokens per skill)
          name, description          → Claude reads to decide when to activate
                ↓
Level 2: SKILL.md body             ← loaded when skill is selected
          workflow, steps, rules     → actual instructions Claude follows
                ↓
Level 3: references/ files         ← loaded on demand
          tag taxonomies, lookup     → detail pulled in only when needed
```

This is why description quality matters: Claude reads Level 1 for every installed skill, every turn.

### How many skills can I install?

**20–30 skills** is the practical sweet spot. Claude loads all skill descriptions into roughly 2% of the context window (~16K chars). Beyond ~30 skills, some descriptions may be silently excluded. Run `/context` to check current context usage.

## harness.yaml

A portable snapshot of your complete AI assistant setup. Captures:
- Plugins (sources and versions)
- MCP server configurations  
- Environment variable declarations
- Instructions injected into CLAUDE.md or AGENT.md
- Permissions

Export: `/harness-export` — writes `harness.yaml`  
Restore: `/harness-import harness.yaml` — interactive picker, teammates choose what they want

## How harness-kit Compares

### vs. MCP Servers

MCP servers give your AI new tools — database access, web search, external APIs.  
harness-kit is about what to do with those tools: structured workflows with defined steps and outputs.  
They work at different levels and compose well: a `harness.yaml` can declare MCP servers.

### vs. A2A / Claude Agent SDK

| Layer | What it solves | Example |
|-------|---------------|---------|
| Configuration | How is this agent set up? | harness-kit |
| Tool communication | How does the agent call tools? | MCP |
| Runtime communication | How do agents talk to each other? | A2A |
| Developer SDK | How do I build an agent? | Claude Agent SDK |

### vs. Just Writing Prompts

Good prompts tend to disappear — scattered across projects, left behind on new machines. Plugins give them a stable home with a version number.

## Harness Protocol

The [Harness Protocol](https://harnessprotocol.io) is an open specification for portable AI coding harness configuration. It defines a vendor-neutral `harness.yaml` format validated by JSON Schema. harness-kit is the reference implementation. Any tool that correctly validates and applies `harness.yaml` per the spec is a conformant implementation.

## FAQ

**Is this safe? What does installing a plugin actually do?**  
Plugins are plain markdown files. No binaries, no background processes, no network calls on install. Some plugins include shell scripts (like `research`'s index rebuild) that only run when you invoke the skill.

**Do I need to pay for anything?**  
No. harness-kit is free and open source (Apache 2.0). You only need Claude Code.

**Can I use this across multiple projects?**  
Yes. Plugins install to your harness globally, not per-project. Project-specific config goes in `CLAUDE.md`.

**Can I modify the built-in plugins?**  
The installed files are plain text — edit them directly. For something lasting, fork the repo and point your marketplace at your fork.

**Do any plugins need API keys?**  
Two plugins have optional environment variable dependencies:
- **research** — `GH_TOKEN` enables fetching from GitHub repos. Without it, research works for all other source types.
- **review** — `GH_TOKEN` enables reviewing PRs by number. Without it, review works for local branches and paths.

**What is the `harness.yaml.example`?**  
See https://github.com/harnessprotocol/harness-kit/blob/main/harness.yaml.example for the full format reference.

**I already have prompts in my CLAUDE.md. Should I move them?**  
Project-specific workflows belong in `CLAUDE.md`. If you find yourself copying the same prompt into every new project, that's a sign it would work better as a plugin.

**How is the open standard defined?**  
The Agent Skills specification is published at [agentskills.io](https://agentskills.io). Skills built to this spec are portable across Claude Code, Copilot, and any other compliant platform.
