---
sidebar_position: 6
title: capture-session
---

# capture-session

Capture session information into a staging file for later reflection and knowledge graph processing.

## Requirements

None.

## Components

| Component | Purpose |
|-----------|---------|
| `/capture-session` skill | Manual, on-demand staging from within a conversation |
| `session-capture.sh` | Automated Stop hook that summarizes sessions at exit |

## What It Does

When you invoke `/capture-session`:

1. Parses your argument to determine what to capture
2. Resolves the staging file (`scripts/session-staging.md` or `~/.claude/session-staging.md`)
3. Appends a timestamped entry with a `<!-- source: manual -->` marker
4. Confirms exactly what was staged

## Usage

### Auto-extract (no argument)

```
/capture-session
```

Scans the conversation and extracts 3-8 most important facts — decisions, technical details, status changes, new entities.

### Stage specific facts

```
/capture-session SQLite chosen over Postgres for local-first storage
/capture-session harness-kit domain purchased at harnesskit.ai, 3-year registration
```

### Filter to decisions only

```
/capture-session decisions
```

Extracts only explicit decisions — architectural choices, plans confirmed, approaches selected.

### Filter to technical facts only

```
/capture-session technical
```

Extracts only implementation details, file paths, APIs, schemas, commands.

## Setting Up the Stop Hook

The Stop hook automatically summarizes sessions at exit. Add to `~/.claude/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/plugins/capture-session/scripts/session-capture.sh"
          }
        ]
      }
    ]
  }
}
```

After `plugin install capture-session@harness-kit`, the script is at `~/.claude/plugins/capture-session/scripts/session-capture.sh`. For a local clone, use the absolute path to `plugins/capture-session/scripts/session-capture.sh`.

The hook reads the Stop event payload, finds the session transcript, summarizes it, and appends to the staging file. It deduplicates against `<!-- source: manual -->` entries from the same day.

## Pipeline

```
Manual /capture-session  ──┐
                  ├──▶  session-staging.md  ──▶  daily reflection  ──▶  knowledge graph
Auto Stop hook ──┘
```

## Staging File Format

```markdown
# Session Staging

Facts staged here are consumed by the daily reflection.

## 2026-03-08 14:32
<!-- source: manual -->
- SQLite chosen over Postgres for local-first storage
- harness-kit domain purchased at harnesskit.ai

## 2026-03-08 23:59
<!-- source: hook -->
- Implemented capture-session plugin with 4 argument types
- Updated marketplace.json and install.sh
```

## Design Notes

### Why manual staging?

The Stop hook auto-summarizes at session end — useful, but it misses nuance. `/capture-session decisions` lets you control what gets remembered while context is fresh.

### Why the same pipeline?

Both sources feed the same staging file, processed uniformly by the daily reflection. Automation catches everything; manual capture adds precision.

### Why append-only?

The staging file is a write-ahead log. Modifying existing entries would corrupt the audit trail and break deduplication logic.
