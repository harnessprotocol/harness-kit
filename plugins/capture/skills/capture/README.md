# Capture Plugin

A Claude Code plugin for capturing session information into a staging file mid-conversation. Pairs with the automated `session-end.sh` hook for hands-off capture at session end.

## What It Does

When you invoke `/capture`, the skill:

1. Parses your argument to determine what to capture
2. Resolves the staging file (`scripts/session-staging.md` → `~/.claude/session-staging.md`)
3. Appends a timestamped entry with a `<!-- source: manual -->` marker
4. Confirms exactly what was staged

## Usage

### Auto-extract (no argument)

```
/capture
```

Scans the conversation and extracts 3-8 most important facts — decisions, technical details, status changes, new entities.

### Stage specific facts

```
/capture SQLite chosen over Postgres for local-first storage
/capture harness-kit domain purchased at harnesskit.ai, 3-year registration
```

Stages the facts you provide, formatted as clean bullets.

### Filter to decisions only

```
/capture decisions
```

Extracts only explicit decisions made this session — architectural choices, plans confirmed, approaches selected.

### Filter to technical facts only

```
/capture technical
```

Extracts only technical facts — implementation details, file paths, APIs, schemas, commands.

## Components

| Component | Purpose |
|-----------|---------|
| `/capture` skill | Manual, on-demand staging from within a conversation |
| `session-end.sh` | Automated Stop hook that runs a reflection prompt at session end |

## Setup

### Wire the Stop hook

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/scripts/session-end.sh"
      }]
    }]
  }
}
```

After `plugin install capture@harness-kit`, `${CLAUDE_PLUGIN_ROOT}` resolves to the installed plugin directory.

The hook reads the session transcript, runs a reflection prompt via `claude -p`, and writes a staging file to `~/.claude/capture/staging/<session-id>.md`. See `scripts/session-reflection-prompt.md` for the prompt — replace it with your own to customize what gets extracted.

See `scripts/session-end.sh` for configurable environment variables (`HARNESS_CAPTURE_DIR`, `HARNESS_CAPTURE_CWD_FILTER`, etc.).

## Staging File Format

Both the skill and the hook write to the same file in this format:

```markdown
# Session Staging

Facts staged here are consumed by the daily reflection and written to the knowledge graph.

## 2026-03-08 14:32
<!-- source: manual -->
- SQLite chosen over Postgres for local-first storage
- harness-kit domain purchased at harnesskit.ai

## 2026-03-08 23:59
<!-- source: hook -->
- Implemented capture plugin with 4 argument types
- Updated marketplace.json and install.sh
```

## Pipeline

```
Manual /capture  ──┐
                  ├──▶  session-staging.md  ──▶  daily reflection  ──▶  knowledge graph
Auto Stop hook ──┘
```

The Stop hook deduplicates against manual entries: if `<!-- source: manual -->` entries exist for today, it includes them in the summary prompt with "do NOT repeat these facts."

## Design Notes

### Why manual staging?

The Stop hook auto-summarizes at session end — useful, but it misses nuance. You might know mid-session that a particular decision is worth capturing precisely. `/capture decisions` or `/capture specific text` lets you control what gets remembered while the context is fresh.

### Why the same pipeline?

Both sources feed the same staging file, which the daily reflection processes uniformly. You get the benefits of automation (nothing falls through) plus the precision of manual capture (important things get captured right).

### Why append-only?

The staging file is a write-ahead log — entries accumulate until the reflection runs. Modifying existing entries would corrupt the audit trail and break deduplication logic.
