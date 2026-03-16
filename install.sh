#!/usr/bin/env bash
# Fallback installer for Claude Code versions without plugin marketplace support.
# Preferred install:
#   /plugin marketplace add harnessprotocol/harness-kit
#   /plugin install research@harness-kit

set -euo pipefail

REPO="harnessprotocol/harness-kit"
BRANCH="main"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

SKILLS_DEST="${HOME}/.claude/skills"

# Detect local vs remote mode.
# When piped through bash (curl | bash), BASH_SOURCE[0] is unset or "-".
SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "-" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

LOCAL_PLUGINS=""
if [[ -n "$SCRIPT_DIR" && -d "${SCRIPT_DIR}/plugins" ]]; then
  LOCAL_PLUGINS="${SCRIPT_DIR}/plugins"
fi

if [[ -n "$LOCAL_PLUGINS" ]]; then
  echo "Local install: copying skills from ${LOCAL_PLUGINS}/"
  for plugin_dir in "${LOCAL_PLUGINS}"/*/; do
    plugin=$(basename "$plugin_dir")
    skills_src="${plugin_dir}skills"
    if [[ -d "$skills_src" ]]; then
      mkdir -p "$SKILLS_DEST"
      cp -r "${skills_src}/"* "$SKILLS_DEST/"
      echo "  ~/.claude/skills/ (from ${plugin})"
    fi
  done
else
  echo "Remote install: downloading from ${REPO}"

  MARKETPLACE_JSON=$(curl -fsSL "${RAW_BASE}/.claude-plugin/marketplace.json")
  mapfile -t PLUGINS < <(python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
print('\n'.join(p['name'] for p in data['plugins']))
" <<< "$MARKETPLACE_JSON")

  for plugin in "${PLUGINS[@]}"; do
    dest="${SKILLS_DEST}/${plugin}"
    mkdir -p "$dest"
    skill_url="${RAW_BASE}/plugins/${plugin}/skills/${plugin}/SKILL.md"
    if curl -fsSL "$skill_url" -o "${dest}/SKILL.md"; then
      curl -fsSL "${RAW_BASE}/plugins/${plugin}/skills/${plugin}/README.md" -o "${dest}/README.md" || true
      echo "  ~/.claude/skills/${plugin}/"
    else
      rmdir "$dest" 2>/dev/null || true
    fi
  done

  echo "Installed all skills."
fi

echo ""
echo "Done. Restart Claude Code for skills to take effect."
