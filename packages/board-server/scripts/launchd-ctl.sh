#!/usr/bin/env bash
# launchd-ctl.sh — manage the board-server launchd Launch Agent
set -euo pipefail

LABEL="com.harness-kit.board-server"
PLIST_NAME="${LABEL}.plist"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_DEST="${LAUNCH_AGENTS_DIR}/${PLIST_NAME}"
PLIST_TEMPLATE="$(cd "$(dirname "$0")/../launchd" && pwd)/${PLIST_NAME}"
LOG_DIR="${HOME}/.harness-kit"
BOARD_PORT="${BOARD_PORT:-4800}"

# Validate BOARD_PORT is a plain integer to prevent URL injection in curl calls
if ! [[ "$BOARD_PORT" =~ ^[0-9]+$ ]]; then
  echo "Error: BOARD_PORT must be a number, got: ${BOARD_PORT}" >&2
  exit 1
fi

# Resolve the board-server package directory (2 levels up from scripts/)
SERVER_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Cache UID once to avoid repeated id -u calls and TOCTOU window
GUI_DOMAIN="gui/$(id -u)"

cmd="${1:-help}"

usage() {
  echo "Usage: launchd-ctl.sh <install|uninstall|status|logs|restart>"
  echo ""
  echo "  install    Register and start the board-server Launch Agent"
  echo "  uninstall  Stop and remove the Launch Agent"
  echo "  status     Show service status and health"
  echo "  logs       Tail the board-server log"
  echo "  restart    Restart the service"
}

install_service() {
  local node_path
  node_path="$(which node 2>/dev/null || true)"
  if [[ -z "$node_path" ]]; then
    echo "Error: node not found in PATH. Install Node.js and ensure it is on your PATH." >&2
    exit 1
  fi

  if [[ ! -f "${SERVER_DIR}/dist/index.js" ]]; then
    echo "Error: dist/index.js not found at ${SERVER_DIR}/dist/index.js" >&2
    echo "Run 'pnpm build:board-server' first." >&2
    exit 1
  fi

  mkdir -p "${LAUNCH_AGENTS_DIR}"
  mkdir -p "${LOG_DIR}"

  # Substitute placeholders — use python3 for safe literal replacement
  # (avoids sed delimiter injection if paths contain special characters)
  python3 -c "
import sys
t = open(sys.argv[1]).read()
t = t.replace('__NODE_PATH__', sys.argv[2])
t = t.replace('__SERVER_DIR__', sys.argv[3])
t = t.replace('__LOG_DIR__', sys.argv[4])
sys.stdout.write(t)
" "$PLIST_TEMPLATE" "$node_path" "$SERVER_DIR" "$LOG_DIR" > "$PLIST_DEST"

  echo "Installed plist to ${PLIST_DEST}"

  # Bootstrap the service
  launchctl bootstrap "${GUI_DOMAIN}" "${PLIST_DEST}" 2>/dev/null || true
  launchctl enable "${GUI_DOMAIN}/${LABEL}" 2>/dev/null || true
  launchctl kickstart "${GUI_DOMAIN}/${LABEL}" 2>/dev/null || true

  echo "Service started. Waiting for health check..."
  for i in $(seq 1 20); do
    if curl -sf "http://localhost:${BOARD_PORT}/health" > /dev/null 2>&1; then
      echo "Board server is running on :${BOARD_PORT}"
      exit 0
    fi
    sleep 0.5
  done
  echo "Warning: health check timed out — check logs with: launchd-ctl.sh logs"
}

uninstall_service() {
  if launchctl print "${GUI_DOMAIN}/${LABEL}" > /dev/null 2>&1; then
    launchctl bootout "${GUI_DOMAIN}/${LABEL}" 2>/dev/null || true
    echo "Service stopped."
  fi
  if [[ -f "${PLIST_DEST}" ]]; then
    rm "${PLIST_DEST}"
    echo "Removed ${PLIST_DEST}"
  else
    echo "Plist not found — nothing to remove."
  fi
}

status_service() {
  echo "=== launchctl ==="
  launchctl print "${GUI_DOMAIN}/${LABEL}" 2>/dev/null || echo "(not loaded)"
  echo ""
  echo "=== health ==="
  if curl -sf "http://localhost:${BOARD_PORT}/health" > /dev/null 2>&1; then
    curl -s "http://localhost:${BOARD_PORT}/health"
    echo ""
  else
    echo "Not responding on :${BOARD_PORT}"
  fi
}

logs_service() {
  local log_file="${LOG_DIR}/board-server.log"
  if [[ -f "$log_file" ]]; then
    tail -f "$log_file"
  else
    echo "Log file not found: $log_file"
    echo "Has the service been installed and run yet?"
    exit 1
  fi
}

restart_service() {
  launchctl kickstart -k "${GUI_DOMAIN}/${LABEL}"
  echo "Restarted ${LABEL}"
}

case "$cmd" in
  install)   install_service ;;
  uninstall) uninstall_service ;;
  status)    status_service ;;
  logs)      logs_service ;;
  restart)   restart_service ;;
  help|--help|-h) usage ;;
  *) echo "Unknown command: $cmd"; usage; exit 1 ;;
esac
