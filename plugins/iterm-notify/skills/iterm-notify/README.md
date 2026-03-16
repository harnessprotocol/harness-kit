# iterm-notify

macOS desktop notifications and iTerm2 badge management for Claude Code lifecycle events.

## What it does

| Event | Action |
|-------|--------|
| `Notification` (needs attention) | Bounces dock, sets iTerm2 badge, sends macOS notification |
| `Stop` (task complete) | Clears iTerm2 badge |

The badge reads `<topic> ⚡` if you have a topic file configured, or just `⚡` otherwise.

Clicking the macOS notification focuses the iTerm2 window where Claude is running.

## Prerequisites

- macOS with [iTerm2](https://iterm2.com)
- `terminal-notifier`: `brew install terminal-notifier`
- `jq`: `brew install jq`

## Install

```
/plugin install iterm-notify@harness-kit
```

## Wiring

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/scripts/notify.sh"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/scripts/notify.sh"
      }]
    }]
  }
}
```

Both events use the same script — it reads `hook_event_name` from the JSON input to determine behavior.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HARNESS_BADGE_LABEL_FILE` | `~/.claude/iterm-badge-label.txt` | Path to a file whose contents label the badge. Write your current project name here to get `myproject ⚡` instead of just `⚡`. |

### Setting the badge label

```bash
echo "my-project" > ~/.claude/iterm-badge-label.txt
```

Clear it:

```bash
echo "" > ~/.claude/iterm-badge-label.txt
```
