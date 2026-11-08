#!/usr/bin/env bash
# Runs the harness-kit CLI for action.yml and writes the job summary.
#
# Reads its configuration from the environment (set by action.yml):
#   HK_COMMAND      check | status
#   HK_FILE         path to harness.yaml (check only)
#   HK_TARGET       comma-separated targets (check only, optional)
#   HK_BASELINE     baseline harness.yaml path (status only, optional)
#   HK_CLI_VERSION  npm version or dist-tag of the harness-kit package
#   HK_CLI          optional override command used instead of npx (local testing)
#   GITHUB_STEP_SUMMARY, GITHUB_OUTPUT  provided by GitHub Actions
#
# Exit code: the CLI's exit code (1 on drift), so the step fails on drift.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${HK_COMMAND:-check}"

case "$COMMAND" in
  check | status) ;;
  *)
    echo "::error::Unknown command '$COMMAND'. Use 'check' or 'status'."
    exit 2
    ;;
esac

args=("$COMMAND")
if [ "$COMMAND" = "check" ]; then
  args+=("${HK_FILE:-harness.yaml}")
  [ -n "${HK_TARGET:-}" ] && args+=(--target "$HK_TARGET")
else
  [ -n "${HK_BASELINE:-}" ] && args+=(--baseline "$HK_BASELINE")
fi
args+=(--json)

OUT_DIR="$(mktemp -d)"
if [ -n "${HK_CLI:-}" ]; then
  # shellcheck disable=SC2206
  runner=($HK_CLI)
else
  runner=(npx -y "harness-kit@${HK_CLI_VERSION:-latest}")
fi

"${runner[@]}" "${args[@]}" >"$OUT_DIR/stdout.json" 2>"$OUT_DIR/stderr.txt"
code=$?

SUMMARY="$(node "$SCRIPT_DIR/action-summary.mjs" "$COMMAND" "$OUT_DIR/stdout.json" "$OUT_DIR/stderr.txt" "$code")"
echo "$SUMMARY"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "$SUMMARY" >>"$GITHUB_STEP_SUMMARY"
fi

if [ "$code" -ne 0 ]; then
  echo "::error::harness $COMMAND failed with exit code $code. See the job summary."
  [ -s "$OUT_DIR/stderr.txt" ] && cat "$OUT_DIR/stderr.txt" >&2
fi

[ -n "${GITHUB_OUTPUT:-}" ] && echo "exit-code=$code" >>"$GITHUB_OUTPUT"
exit "$code"
