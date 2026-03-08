#!/usr/bin/env bash
# Session staging hook — fires at session end via ~/.claude/hooks.json (Stop event).
# Generates a short summary of the session and appends it to the staging file
# for the daily reflection to consume and write to the knowledge graph.
#
# Bundled with the harness-kit stage plugin.
# https://github.com/siracusa5/harness-kit

set -euo pipefail

# ── Detect claude binary ─────────────────────────────────────────────────────

if command -v claude &>/dev/null; then
  CLAUDE_BIN="$(command -v claude)"
elif [[ -x "$HOME/.local/bin/claude" ]]; then
  CLAUDE_BIN="$HOME/.local/bin/claude"
else
  exit 0
fi

# ── Resolve staging file ─────────────────────────────────────────────────────

STAGING_FILE=""

# 1. Project-local: scripts/session-staging.md in current working directory.
# Note: $PWD may not be the project root when a Stop hook fires — Claude Code
# may set a different working directory. If the file doesn't exist here, we
# fall through to the global fallback rather than creating a stray file.
if [[ -f "$PWD/scripts/session-staging.md" ]]; then
  STAGING_FILE="$PWD/scripts/session-staging.md"
elif [[ -d "$PWD/scripts" ]]; then
  STAGING_FILE="$PWD/scripts/session-staging.md"
fi

# 2. Fallback: ~/.claude/session-staging.md
if [[ -z "$STAGING_FILE" ]]; then
  STAGING_FILE="$HOME/.claude/session-staging.md"
fi

# Create if missing
if [[ ! -f "$STAGING_FILE" ]]; then
  mkdir -p "$(dirname "$STAGING_FILE")"
  cat > "$STAGING_FILE" <<'EOF'
# Session Staging

Facts staged here are consumed by the daily reflection and written to the knowledge graph.
EOF
fi

# ── Find transcript ──────────────────────────────────────────────────────────

PAYLOAD=$(cat)
TRANSCRIPT_PATH=$(echo "$PAYLOAD" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('transcript_path',''))" \
  2>/dev/null || echo "")

# Fall back: most recently modified JSONL in ~/.claude/projects/
if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
  TRANSCRIPT_PATH=$(find "$HOME/.claude/projects" -name "*.jsonl" -type f \
    2>/dev/null | xargs ls -t 2>/dev/null | head -1 || echo "")
fi

if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
  exit 0
fi

# ── Guard: skip tiny transcripts (< 5KB = nothing meaningful happened) ───────

TRANSCRIPT_SIZE=$(wc -c < "$TRANSCRIPT_PATH" 2>/dev/null || echo "0")
if [[ "$TRANSCRIPT_SIZE" -lt 5120 ]]; then
  exit 0
fi

# ── Check for manual entries from today ──────────────────────────────────────

TODAY=$(date '+%Y-%m-%d')
MANUAL_CONTEXT=""

if grep -q "<!-- source: manual -->" "$STAGING_FILE" 2>/dev/null; then
  # Extract today's manual entries if any exist.
  # `found` is intentionally not reset between sections — if the user ran
  # /stage multiple times today, we accumulate all their bullets.
  MANUAL_TODAY=$(awk "
    /^## ${TODAY}/ { in_section=1; next }
    /^## [0-9]/ { in_section=0 }
    in_section && /<!-- source: manual -->/ { found=1 }
    in_section && found && /^- / { print }
  " "$STAGING_FILE" 2>/dev/null || echo "")

  if [[ -n "$MANUAL_TODAY" ]]; then
    MANUAL_CONTEXT="The following facts were already manually staged today — do NOT repeat these facts:
${MANUAL_TODAY}

"
  fi
fi

# ── Summarize ────────────────────────────────────────────────────────────────

RECENT=$(tail -c 30000 "$TRANSCRIPT_PATH" 2>/dev/null)
DATE=$(date '+%Y-%m-%d %H:%M')

PROMPT="${MANUAL_CONTEXT}Summarize this Claude Code session in 3-6 bullet points for a knowledge graph update. Focus only on: new projects or decisions made, technical facts learned, status changes, new entities or tools introduced. Max 20 words per bullet. If nothing notable happened, output exactly: NOTHING_NOTABLE"

SUMMARY=$(echo "$RECENT" | "$CLAUDE_BIN" -p "$PROMPT" \
  --max-turns 1 \
  2>/dev/null || echo "NOTHING_NOTABLE")

if [[ -z "$SUMMARY" || "$SUMMARY" == *"NOTHING_NOTABLE"* ]]; then
  exit 0
fi

# ── Append to staging file ───────────────────────────────────────────────────

{
  echo ""
  echo "## $DATE"
  echo "<!-- source: hook -->"
  echo "$SUMMARY"
} >> "$STAGING_FILE"
