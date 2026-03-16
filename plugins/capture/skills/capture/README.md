# Capture Session Plugin

A Claude Code plugin for capturing session information into a staging file mid-conversation. Feeds the same pipeline as the automated Stop hook — manual control over what gets remembered.

## What It Does

When you invoke `/capture-session`, the skill:

1. Parses your argument to determine what to capture
2. Resolves the staging file (`scripts/session-staging.md` → `~/.claude/session-staging.md`)
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

Stages the facts you provide, formatted as clean bullets.

### Filter to decisions only

```
/capture-session decisions
```

Extracts only explicit decisions made this session — architectural choices, plans confirmed, approaches selected.

### Filter to technical facts only

```
/capture-session technical
```

Extracts only technical facts — implementation details, file paths, APIs, schemas, commands.

## Components

| Component | Purpose |
|-----------|---------|
| `/capture-session` skill | Manual, on-demand staging from within a conversation |
| `session-capture.sh` | Automated Stop hook that summarizes sessions at exit |

## Setup

### Wire the Stop hook

Add to `~/.claude/hooks.json`:

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

After `plugin install capture-session@harness-kit`, the script will be at `~/.claude/plugins/capture-session/scripts/session-capture.sh`. For a local clone, use the absolute path to `plugins/capture-session/scripts/session-capture.sh` within the repo.

The hook reads from stdin (the Stop event payload), finds the session transcript, summarizes it, and appends to the staging file. It checks for `<!-- source: manual -->` entries from today and skips facts already captured manually.

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
- Implemented capture-session plugin with 4 argument types
- Updated marketplace.json and install.sh
```

## Pipeline

```
Manual /capture-session  ──┐
                  ├──▶  session-staging.md  ──▶  daily reflection  ──▶  knowledge graph
Auto Stop hook ──┘
```

The Stop hook deduplicates against manual entries: if `<!-- source: manual -->` entries exist for today, it includes them in the summary prompt with "do NOT repeat these facts."

## Design Notes

### Why manual staging?

The Stop hook auto-summarizes at session end — useful, but it misses nuance. You might know mid-session that a particular decision is worth capturing precisely. `/capture-session decisions` or `/capture-session specific text` lets you control what gets remembered while the context is fresh.

### Why the same pipeline?

Both sources feed the same staging file, which the daily reflection processes uniformly. You get the benefits of automation (nothing falls through) plus the precision of manual capture (important things get captured right).

### Why append-only?

The staging file is a write-ahead log — entries accumulate until the reflection runs. Modifying existing entries would corrupt the audit trail and break deduplication logic.
