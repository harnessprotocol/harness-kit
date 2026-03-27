#!/usr/bin/env bash
# check-membrain.sh — health check for the membrain installation and server
set -euo pipefail

MEMBRAIN_PORT="${MEMBRAIN_PORT:-3131}"
ok=true

# Check binary
if command -v mem &>/dev/null; then
  echo "OK mem binary: $(which mem)"
else
  echo "MISSING mem binary — install with: go install github.com/siracusa5/membrain/cmd/mem@latest"
  ok=false
fi

# Check server
if curl -sf --max-time 2 "http://localhost:${MEMBRAIN_PORT}/api/v1/graph/stats" &>/dev/null; then
  echo "OK membrain server responding on :${MEMBRAIN_PORT}"
else
  echo "NOT RUNNING membrain server (port ${MEMBRAIN_PORT}) — start with: mem serve"
fi

$ok && echo "membrain health: OK" || { echo "membrain health: DEGRADED (binary missing)"; exit 1; }
