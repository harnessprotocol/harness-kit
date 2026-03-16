#!/usr/bin/env bash
# notify.sh — macOS desktop notifications and iTerm2 badge management for Claude Code
#
# Wired as a Claude Code hook (Notification + Stop events). Receives JSON on stdin.
#
# Prerequisites:
#   - iTerm2 (https://iterm2.com)
#   - terminal-notifier: brew install terminal-notifier
#
# Environment variables:
#   HARNESS_BADGE_LABEL_FILE   Path to a file whose contents are used as the iTerm2
#                              badge label prefix (default: ~/.claude/iterm-badge-label.txt)
#                              Write the current project or topic name to this file to
#                              label the badge. Leave unset or empty for a plain ⚡ badge.

INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "unknown"')
TITLE=$(echo "$INPUT" | jq -r '.title // "Claude Code"')
MSG=$(echo "$INPUT" | jq -r '.message // ""')
SOUND="${2:-Glass}"

BADGE_LABEL_FILE="${HARNESS_BADGE_LABEL_FILE:-$HOME/.claude/iterm-badge-label.txt}"
TOPIC=$(cat "$BADGE_LABEL_FILE" 2>/dev/null)

# Gather iTerm2 session info
ITERM_INFO=$(osascript <<'ASEOF' 2>/dev/null
tell application "iTerm2"
    set w to current window
    set s to current session of current tab of w
    set wId to id of w
    set sId to id of s
    set sName to name of s
    set sTTY to tty of s
    return wId & "|" & sId & "|" & sName & "|" & sTTY
end tell
ASEOF
)

WINDOW_ID=$(echo "$ITERM_INFO" | cut -d'|' -f1)
SESSION_ID=$(echo "$ITERM_INFO" | cut -d'|' -f2)
SESSION_NAME=$(echo "$ITERM_INFO" | cut -d'|' -f3)
TTY=$(echo "$ITERM_INFO" | cut -d'|' -f4)

# iTerm2 dock bounce + badge (only for attention-needed events, not completion)
if [ "$EVENT" = "Notification" ] && [ -n "$TTY" ] && [ -e "$TTY" ]; then
    BADGE="${TOPIC:+$TOPIC ⚡}"
    BADGE="${BADGE:-⚡}"
    printf '\033]1337;RequestAttention=once\007' > "$TTY"
    printf '\033]1337;SetBadgeFormat=%s\007' "$(printf '%s' "$BADGE" | base64)" > "$TTY"

    # Build click-to-focus AppleScript
    FOCUS_SCRIPT="tell application \\\"iTerm2\\\" to tell window id $WINDOW_ID to select session id \\\"$SESSION_ID\\\""

    # Rich notification via terminal-notifier
    NOTIF_TITLE="${TOPIC:-Claude Code}"
    NOTIF_SUBTITLE="$SESSION_NAME"
    NOTIF_MSG="${MSG:-Needs attention}"

    TERMINAL_NOTIFIER=$(command -v terminal-notifier 2>/dev/null)
    if [ -n "$TERMINAL_NOTIFIER" ] && [ -x "$TERMINAL_NOTIFIER" ]; then
        "$TERMINAL_NOTIFIER" \
            -title "$NOTIF_TITLE" \
            -subtitle "$NOTIF_SUBTITLE" \
            -message "$NOTIF_MSG" \
            -sound "$SOUND" \
            -execute "osascript -e '$FOCUS_SCRIPT'; open -a iTerm" \
            &
    fi
fi

# Clear badge on Stop (task completed)
if [ "$EVENT" = "Stop" ] && [ -n "$TTY" ] && [ -e "$TTY" ]; then
    printf '\033]1337;SetBadgeFormat=%s\007' "$(printf '' | base64)" > "$TTY"
fi
