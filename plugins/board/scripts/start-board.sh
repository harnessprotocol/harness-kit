#!/usr/bin/env bash
# start-board.sh — Start the Harness Board server if not running, then open the UI
set -euo pipefail

BOARD_PORT="${BOARD_PORT:-4800}"
BOARD_UI_PORT="${BOARD_UI_PORT:-3002}"
SERVER_DIR="$(cd "$(dirname "$0")/../../../packages/board-server" && pwd)"

# Check if server is already running
if curl -sf "http://localhost:${BOARD_PORT}/health" > /dev/null 2>&1; then
  echo "Board server already running on :${BOARD_PORT}"
else
  echo "Starting board server on :${BOARD_PORT}..."
  cd "$SERVER_DIR"
  node dist/index.js &
  # Wait up to 5 seconds for server to come up
  for i in $(seq 1 10); do
    if curl -sf "http://localhost:${BOARD_PORT}/health" > /dev/null 2>&1; then
      echo "Board server ready"
      break
    fi
    sleep 0.5
  done
fi

# Open the board UI in the default browser
open "http://localhost:${BOARD_UI_PORT}" 2>/dev/null || \
  xdg-open "http://localhost:${BOARD_UI_PORT}" 2>/dev/null || \
  echo "Open your browser at: http://localhost:${BOARD_UI_PORT}"
