#!/usr/bin/env bash
# Fallback installer for Claude Code versions without plugin marketplace support.
# Preferred install:
#   /plugin marketplace add siracusa5/claude-setup
#   /plugin install research@claude-setup

set -euo pipefail

REPO="siracusa5/claude-setup"
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

  RESEARCH_DEST="${SKILLS_DEST}/research"
  mkdir -p "$RESEARCH_DEST"

  curl -fsSL "${RAW_BASE}/plugins/research/skills/research/SKILL.md"  -o "${RESEARCH_DEST}/SKILL.md"
  curl -fsSL "${RAW_BASE}/plugins/research/skills/research/README.md" -o "${RESEARCH_DEST}/README.md"

  echo "Installed:"
  echo "  ~/.claude/skills/research/"
fi

echo ""
echo "Done. Restart Claude Code for skills to take effect."
