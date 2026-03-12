---
sidebar_position: 2
title: Claude Conventions
---

# Claude Conventions

A convention for organizing Claude Code configuration across three companion files with distinct responsibilities.

## Problem

A single `CLAUDE.md` conflates three concerns that change at different rates and serve different purposes:

1. **Operational** — how to build, test, and navigate this codebase (changes per-project)
2. **Behavioral** — tone, autonomy, workflow preferences (changes rarely, applies globally)
3. **Identity** — values, relationship context, memory bootstrap (stable, global only)

This leads to scope leakage (project concerns in global config), duplication across repos, and transient content that rots.

## Solution

Split into three files. Claude Code auto-loads `CLAUDE.md`; companion files are loaded via explicit read instructions in the global `CLAUDE.md`.

### File Purposes

| File | Scope | Purpose | Changes |
|------|-------|---------|---------|
| `CLAUDE.md` | Global + Project + Package | Operational: build, test, architecture, gotchas | Per-project, frequently |
| `AGENT.md` | Global + Project | Behavioral: tone, autonomy, workflow, scope constraints | Rarely |
| `SOUL.md` | Global only | Identity: values, relationship, memory bootstrap | Almost never |

### File Locations

```
~/.claude/
├── CLAUDE.md    ← auto-loaded by Claude Code (global)
├── AGENT.md     ← read via instruction in CLAUDE.md
└── SOUL.md      ← read via instruction in CLAUDE.md

my-project/
├── CLAUDE.md    ← auto-loaded by Claude Code (project)
└── AGENT.md     ← optional project override

my-project/pkg/
└── CLAUDE.md    ← auto-loaded by Claude Code (package)
```

### Full Hierarchy

Claude Code loads configuration at multiple levels, in precedence order:

| Level | Location | Loaded | Shared |
|-------|----------|--------|--------|
| Enterprise | `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS) | Auto | Org-wide policy |
| User | `~/.claude/CLAUDE.md` | Auto | Personal, all projects |
| Project | `<repo>/CLAUDE.md` | Auto | Team, version-controlled |
| Package | `<repo>/pkg/CLAUDE.md` | Auto | Scoped to subdirectory |
| Local | `<repo>/.claude.local.md` | Auto | Personal, gitignored |

Higher levels take precedence. All are optional.

### Cascade Rules

- **CLAUDE.md**: Project inherits global. Package inherits project + global.
- **AGENT.md**: Project overrides global on any conflicting instruction.
- **SOUL.md**: Global only. One identity across all projects.

### Auto-Discovery Constraint

Claude Code only auto-discovers files named `CLAUDE.md` (and `.claude.md`, `.claude.local.md`). It does **not** auto-load `AGENT.md` or `SOUL.md`. The global `~/.claude/CLAUDE.md` must include an explicit instruction:

```markdown
## Companion Files

Read these files at session start:
- `~/.claude/SOUL.md` — identity, values, relationship context
- `~/.claude/AGENT.md` — behavioral preferences and workflow conventions
```

## What Goes Where

### CLAUDE.md (Operational)

**Global** (`~/.claude/CLAUDE.md`):
- Companion file read instructions
- Security rules (PII protection, credential handling)
- Commit conventions (format, co-authorship)

**Project** (`<repo>/CLAUDE.md`) — required sections:
1. **Commands** — build, test, run, dev. Copy-paste ready.
2. **Architecture** — entry points, package layout, key files.
3. **Gotchas** — non-obvious patterns, common mistakes.

Everything else is optional. No transient content — use Issues, TODO.md, or `.claude.local.md`.

### AGENT.md (Behavioral)

**Global** (`~/.claude/AGENT.md`):
- Tone preferences (direct, concise, no emojis)
- Autonomy rules (when to ask vs. proceed)
- Workflow conventions (commit practices, git hygiene)
- Scope constraints (don't over-engineer, don't force-push main)

**Project** (optional, `<repo>/AGENT.md`):
- Project-specific overrides (e.g., different autonomy level for a high-risk repo)
- Overrides global on conflict

### SOUL.md (Identity)

**Global only** (`~/.claude/SOUL.md`):
- Identity core
- Values (inherited and emergent)
- Relationship context
- Memory bootstrap instructions

Not every user needs a SOUL.md. It's relevant when Claude is used as a long-running collaborator with continuity across sessions.

## Transient Content

Never put transient content in CLAUDE.md:
- Current sprint/task state
- "Next steps" or TODO lists
- Session-specific context

Use instead: **Issues** for tracked work, **TODO.md** for project-level task lists, **`.claude.local.md`** for session-local context (gitignored).

## Examples

### Minimal Project CLAUDE.md

```markdown
# my-tool

## Commands

- `go build ./cmd/my-tool` — build
- `go test ./...` — test all
- `go test ./pkg/parser -run TestParse` — test one

## Architecture

Entry point: `cmd/my-tool/main.go`
Core logic: `pkg/parser/` (tokenizer → AST → codegen)
Config: `config.yaml` loaded by `pkg/config/`

## Gotchas

- Parser assumes UTF-8. Non-UTF-8 input panics (tracked in #42).
- `config.yaml` is loaded once at startup — changes require restart.
- Test fixtures in `testdata/` are committed; `go generate` rebuilds them.
```

### Minimal Global AGENT.md

```markdown
# Agent Behavior

## Tone
- Direct and concise.
- No emojis unless requested.

## Autonomy
- Non-destructive actions: proceed without asking.
- Destructive actions: always confirm first.

## Workflow
- Don't commit or push unless asked.
- Read existing code before modifying it.
```

## Complementary Features

### Modular Rules Directory

For projects where CLAUDE.md gets long, `.claude/rules/` lets you split instructions into separate auto-loaded files:

```
.claude/rules/
├── api-conventions.md
├── testing-rules.md
└── security-policy.md
```

Every `*.md` in this directory loads automatically. Supports nested directories.

### Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Asks before making changes |
| `acceptEdits` | Auto-accepts file edits, still asks for shell commands |
| `plan` | Read-only analysis — no writes at all |
| `bypassPermissions` | Skips all checks (use with caution) |

**Tip:** Start read-only, grant write access last. Use `plan` mode to explore before editing.

### Automation with Print Mode

`claude -p` runs non-interactively — useful for CI, scripts, and batch operations:

```bash
claude -p "your query"                              # one-shot
cat logs.txt | claude -p "summarize errors"          # pipe input
claude -p --output-format json "query"               # structured output
```

### Agent Best Practices

When defining custom agents in `.claude/agents/`:

- Treat agents as teammates with job descriptions — clear description, scoped tools, specific purpose.
- Limit write access — read-only agents for analysis/review.
- Scope by path — restrict editable paths to prevent unintended changes.
- Use `isolation: worktree` for parallel agents.

### MCP Server Hygiene

- Don't add too many servers at once — each adds to context.
- Only add trusted servers, especially those with network access.
- Clean up unused servers with `claude mcp remove <name>`.
- Scope appropriately — project scope (`.mcp.json`) vs. user scope (`-s user`).
