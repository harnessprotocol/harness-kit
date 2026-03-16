---
sidebar_position: 1
title: Plugin Overview
---

# Plugins

harness-kit ships 10 plugins across 6 categories. Each packages a proven workflow as a portable prompt template, currently distributed through Claude Code's plugin marketplace.

## At a Glance

| Plugin | What it does | Dependencies |
|--------|-------------|-------------|
| [research](research-knowledge/research) | Process any source into a structured, compounding knowledge base | `gh` CLI (GitHub only), Python 3.10+ |
| [orient](research-knowledge/orient) | Topic-focused session orientation across graph, knowledge, and research | None (optional: MCP Memory Server) |
| [capture-session](research-knowledge/capture-session) | Capture session information into a staging file for later reflection | None |
| [review](code-quality/review) | Structured code review for branches, PRs, or paths with severity labels | `gh` CLI (PR review only) |
| [explain](code-quality/explain) | Layered explanations of files, functions, directories, or concepts | None |
| [data-lineage](data-engineering/data-lineage) | Column-level lineage tracing through SQL, Kafka, Spark, JDBC | None |
| [docgen](documentation/docgen) | Generate or update README, API docs, architecture overview, or changelog | None |
| [open-pr](devops/open-pr) | Pre-flight checks and PR creation: tests, PR, review, CI | `gh` CLI |
| [merge-pr](devops/merge-pr) | Merge a ready PR: verify CI, sync base, squash merge, clean up | `gh` CLI |
| [pull-request-sweep](devops/pull-request-sweep) | Cross-repo PR sweep: triage, review, merge, fix CI | `gh` CLI |
| [harness-share](productivity/harness-share) | Compile, export, import, and sync harness configs across AI tools | None |

Plugin dependencies are formally declared in `plugin.json` under `requires`. See [Secrets & Configuration](/docs/concepts/secrets-management) for the schema and [Secrets Management](/docs/guides/secrets-management) for setup instructions.

## Install any plugin

```bash
/plugin marketplace add harnessprotocol/harness-kit
/plugin install <plugin-name>@harness-kit
```

## How plugins work

Each plugin is a directory containing:

```
plugins/<name>/
├── .claude-plugin/
│   └── plugin.json          ← metadata + version
├── skills/
│   └── <name>/
│       ├── SKILL.md          ← what Claude reads (the workflow)
│       └── README.md         ← what humans read (usage docs)
└── scripts/                  ← optional automation
```

The **SKILL.md** is the runtime unit — it defines the workflow Claude Code executes when you invoke the slash command. The **plugin** is the distribution unit — it packages the skill with optional scripts, hooks, and agents.

SKILL.md files are plain markdown, not SDK code or API calls. While plugins currently distribute through Claude Code's marketplace, the prompt workflows are harness-agnostic — they work in any tool that reads prompt templates. See [Cross-Harness Portability](/docs/concepts/cross-harness-portability) for details.

See [Plugins vs. Skills](/docs/concepts/plugins-vs-skills) for the full rationale.

## Profiles

Profiles are pre-configured collections of plugins for specific roles. Each profile is a `harness.yaml` that bundles a curated set of plugins with optional knowledge seeds.

| Profile | Who it's for | Plugins included |
|---------|-------------|-----------------|
| [research-knowledge](/profiles/research-knowledge) | Research-focused roles | research, orient, capture-session, explain, docgen |
| [data-engineer](/profiles/data-engineer) | Data engineers with SQL pipelines | data-lineage, research, orient, capture-session, explain, docgen, review |
| [full-stack-engineer](/profiles/full-stack-engineer) | Full-stack feature shipping | review, open-pr, merge-pr, pull-request-sweep, explain, docgen, harness-share |

Install a profile's plugins individually, or use `/harness-import` with the profile's YAML to install them all at once.
