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

  for plugin in research explain data-lineage orient capture-session review docgen; do
    dest="${SKILLS_DEST}/${plugin}"
    mkdir -p "$dest"
    curl -fsSL "${RAW_BASE}/plugins/${plugin}/skills/${plugin}/SKILL.md"  -o "${dest}/SKILL.md"
    curl -fsSL "${RAW_BASE}/plugins/${plugin}/skills/${plugin}/README.md" -o "${dest}/README.md"
    echo "  ~/.claude/skills/${plugin}/"
  done

  echo "Installed all skills."
fi

echo ""
echo "Done. Restart Claude Code for skills to take effect."
