#!/usr/bin/env bash
# session-end.sh — Automatic session capture hook for Claude Code
#
# Fires at session end. Reads transcript, runs a reflection prompt via Claude,
# and writes a staging file to HARNESS_CAPTURE_DIR/staging/ for later review.
#
# Safety features:
#   1. Anti-recursion: exits immediately if CLAUDE_HOOK_PROCESSING is set
#   2. Rate limiting: configurable (default 3/hour, 10/day)
#   3. CWD filter: optional — only process sessions from matching directories
#   4. Message threshold: skips trivial sessions (< 3 user messages)
#   5. Background processing: hook returns immediately, work runs async
#
# Environment variables:
#   HARNESS_CAPTURE_DIR            Capture output directory (default: $HOME/.claude/capture)
#                                  Staging files written to $HARNESS_CAPTURE_DIR/staging/
#   HARNESS_CAPTURE_CWD_FILTER     Only process sessions where CWD contains this string
#                                  (default: empty = process all sessions)
#   HARNESS_CAPTURE_PROMPT_FILE    Path to the reflection prompt markdown file
#                                  (default: same directory as this script / session-reflection-prompt.md)
#   HARNESS_CAPTURE_MAX_PER_HOUR   Max captures per hour (default: 3)
#   HARNESS_CAPTURE_MAX_PER_DAY    Max captures per day (default: 10)

# ── 1. Anti-recursion guard ─────────────────────────────────────────────────
if [ -n "$CLAUDE_HOOK_PROCESSING" ]; then
    exit 0
fi

# ── 2. Parse hook input ─────────────────────────────────────────────────────
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# ── 3. Configuration ─────────────────────────────────────────────────────────
CAPTURE_DIR="${HARNESS_CAPTURE_DIR:-$HOME/.claude/capture}"
LOG_FILE="$CAPTURE_DIR/session_processing.log"
RATE_FILE="$CAPTURE_DIR/rate_limiter.json"
STAGING_DIR="$CAPTURE_DIR/staging"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
PROMPT_FILE="${HARNESS_CAPTURE_PROMPT_FILE:-$SCRIPT_DIR/session-reflection-prompt.md}"
MAX_PER_HOUR="${HARNESS_CAPTURE_MAX_PER_HOUR:-3}"
MAX_PER_DAY="${HARNESS_CAPTURE_MAX_PER_DAY:-10}"

# ── 4. CWD filter (optional) ────────────────────────────────────────────────
if [ -n "${HARNESS_CAPTURE_CWD_FILTER:-}" ]; then
    if [[ "$CWD" != *"$HARNESS_CAPTURE_CWD_FILTER"* ]]; then
        exit 0
    fi
fi

# ── 5. Transcript check ─────────────────────────────────────────────────────
if [ -z "$TRANSCRIPT" ] || [ ! -s "$TRANSCRIPT" ]; then
    exit 0
fi

# Skip trivial sessions (< 3 user messages)
MSG_COUNT=$(jq -r 'select(.type == "human") | 1' "$TRANSCRIPT" 2>/dev/null | wc -l | tr -d ' ')
if [ "${MSG_COUNT:-0}" -lt 3 ]; then
    mkdir -p "$CAPTURE_DIR"
    echo "[$(date)] Skip: trivial session $SESSION_ID (${MSG_COUNT} user msgs)" >> "$LOG_FILE" 2>/dev/null || true
    exit 0
fi

# ── 6. Rate limiting ────────────────────────────────────────────────────────
NOW=$(date +%s)
TODAY=$(date +%Y-%m-%d)
CURRENT_HOUR=$((NOW / 3600))

HOUR_SESSIONS=0
HOUR_EPOCH=0
DAY_SESSIONS=0
LAST_DAY=""

if [ -f "$RATE_FILE" ] && command -v jq &>/dev/null; then
    HOUR_SESSIONS=$(jq -r '.hourSessions // 0' "$RATE_FILE" 2>/dev/null || echo 0)
    HOUR_EPOCH=$(jq -r '.hourEpoch // 0' "$RATE_FILE" 2>/dev/null || echo 0)
    DAY_SESSIONS=$(jq -r '.daySessions // 0' "$RATE_FILE" 2>/dev/null || echo 0)
    LAST_DAY=$(jq -r '.lastDay // ""' "$RATE_FILE" 2>/dev/null || echo "")
fi

# Reset if new hour or new day
STORED_HOUR=$((HOUR_EPOCH / 3600))
[ "$STORED_HOUR" -ne "$CURRENT_HOUR" ] && HOUR_SESSIONS=0
[ "$LAST_DAY" != "$TODAY" ] && DAY_SESSIONS=0

mkdir -p "$CAPTURE_DIR"

if [ "$HOUR_SESSIONS" -ge "$MAX_PER_HOUR" ]; then
    echo "[$(date)] Rate limit (hourly $HOUR_SESSIONS/$MAX_PER_HOUR): skipping $SESSION_ID" >> "$LOG_FILE" 2>/dev/null || true
    exit 0
fi
if [ "$DAY_SESSIONS" -ge "$MAX_PER_DAY" ]; then
    echo "[$(date)] Rate limit (daily $DAY_SESSIONS/$MAX_PER_DAY): skipping $SESSION_ID" >> "$LOG_FILE" 2>/dev/null || true
    exit 0
fi

# Increment rate counters
NEW_HOUR=$((HOUR_SESSIONS + 1))
NEW_DAY=$((DAY_SESSIONS + 1))
printf '{"hourSessions":%d,"hourEpoch":%d,"daySessions":%d,"lastDay":"%s"}\n' \
    "$NEW_HOUR" "$NOW" "$NEW_DAY" "$TODAY" > "$RATE_FILE" 2>/dev/null || true

echo "[$(date)] Queuing session $SESSION_ID (h:$NEW_HOUR/$MAX_PER_HOUR d:$NEW_DAY/$MAX_PER_DAY)" >> "$LOG_FILE" 2>/dev/null || true

# ── 7. Background processing ────────────────────────────────────────────────
# Capture vars now; the subshell runs after this script exits.
# CLAUDE_HOOK_PROCESSING=1 prevents recursion if the spawned claude process
# triggers another Stop hook.

TRANSCRIPT_PATH="$TRANSCRIPT"
LOG_PATH="$LOG_FILE"
PROMPT_PATH="$PROMPT_FILE"
STAGING_PATH="$STAGING_DIR"
SID="$SESSION_ID"

nohup bash -c '
    TRANSCRIPT="'"$TRANSCRIPT_PATH"'"
    LOG_FILE="'"$LOG_PATH"'"
    PROMPT_FILE="'"$PROMPT_PATH"'"
    STAGING_DIR="'"$STAGING_PATH"'"
    SESSION_ID="'"$SID"'"

    # Unset CLAUDECODE so the child claude process is not blocked by the
    # "running inside Claude Code" check that the CLI enforces.
    unset CLAUDECODE

    # Find claude binary
    CLAUDE_BIN=$(command -v claude 2>/dev/null)
    if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
        echo "[$(date)] claude binary not found, skipping $SESSION_ID" >> "$LOG_FILE"
        exit 0
    fi

    if [ ! -f "$PROMPT_FILE" ]; then
        echo "[$(date)] Prompt file not found: $PROMPT_FILE, skipping $SESSION_ID" >> "$LOG_FILE"
        exit 0
    fi

    # Extract conversation text (human + assistant messages, max 30k chars)
    CONVERSATION=$(jq -r "select(.type == \"human\" or .type == \"assistant\") | \"[\" + (.type | ascii_upcase) + \"] \" + ((.message.content // .message // \"[no content]\") | if type == \"array\" then map(select(.type == \"text\") | .text) | join(\" \") elif type == \"string\" then . else \"[non-text]\" end)" "$TRANSCRIPT" 2>/dev/null | head -c 30000)

    if [ -z "$CONVERSATION" ]; then
        echo "[$(date)] No conversation content in $SESSION_ID" >> "$LOG_FILE"
        exit 0
    fi

    CURRENT_DATE=$(date +%Y-%m-%d)
    CURRENT_TIME=$(date +%H:%M)
    mkdir -p "$STAGING_DIR"
    STAGING_FILE="$STAGING_DIR/${SESSION_ID}.md"

    TEMP_ERR=$(mktemp)
    trap "rm -f $TEMP_ERR" EXIT

    EXIT_CODE=0
    {
        echo "Today'\''s date: $CURRENT_DATE"
        echo "Current time: $CURRENT_TIME"
        echo ""
        echo "## Conversation Transcript"
        echo ""
        echo "$CONVERSATION"
        echo ""
        echo "---"
        echo ""
        cat "$PROMPT_FILE"
    } | CLAUDE_HOOK_PROCESSING=1 "$CLAUDE_BIN" -p \
        --model claude-haiku-4-5-20251001 \
        --max-turns 1 \
        --output-format text \
        > "$STAGING_FILE" 2>"$TEMP_ERR" || EXIT_CODE=$?

    if [ "$EXIT_CODE" -eq 0 ] && [ -s "$STAGING_FILE" ]; then
        echo "[$(date)] Done $SESSION_ID: wrote $STAGING_FILE" >> "$LOG_FILE"
    else
        echo "[$(date)] Done $SESSION_ID: exit=$EXIT_CODE" >> "$LOG_FILE"
        head -3 "$TEMP_ERR" >> "$LOG_FILE" 2>/dev/null || true
        [ -f "$STAGING_FILE" ] && rm -f "$STAGING_FILE"
    fi
' > /dev/null 2>&1 &

exit 0
