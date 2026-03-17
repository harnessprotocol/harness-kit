#!/usr/bin/env bash
# start-board.sh — Open the board UI (board server runs as a launchd service)
set -euo pipefail

BOARD_PORT="${BOARD_PORT:-4800}"
BOARD_UI_PORT="${BOARD_UI_PORT:-3002}"

# Check if server is already running
if curl -sf "http://localhost:${BOARD_PORT}/health" > /dev/null 2>&1; then
  echo "Board server running on :${BOARD_PORT}"
else
  echo ""
  echo "Board server is not running on :${BOARD_PORT}."
  echo ""
  echo "To install it as a persistent background service (starts at login):"
  echo ""
  echo "  pnpm board:install"
  echo ""
  echo "This registers a macOS Launch Agent that runs automatically and restarts"
  echo "on crash. Run it once — it will persist across reboots."
  echo ""
  exit 1
fi

# Open the board UI in the default browser
open "http://localhost:${BOARD_UI_PORT}" 2>/dev/null || \
  xdg-open "http://localhost:${BOARD_UI_PORT}" 2>/dev/null || \
  echo "Open your browser at: http://localhost:${BOARD_UI_PORT}"
