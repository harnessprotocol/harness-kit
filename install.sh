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

  # Download checksums
  CHECKSUMS=$(curl -fsSL "${RAW_BASE}/checksums.sha256")

  # research skill
  RESEARCH_DEST="${SKILLS_DEST}/research"
  mkdir -p "$RESEARCH_DEST"

  for file in SKILL.md README.md; do
    curl -fsSL "${RAW_BASE}/plugins/research/skills/research/${file}" -o "${RESEARCH_DEST}/${file}"
    expected=$(echo "$CHECKSUMS" | grep "plugins/research/skills/research/${file}" | awk '{print $1}')
    if [[ -z "$expected" ]]; then
      echo "Warning: no checksum found for ${file}, skipping verification" >&2
    else
      actual=$(shasum -a 256 "${RESEARCH_DEST}/${file}" | awk '{print $1}')
      if [[ "$actual" != "$expected" ]]; then
        echo "Error: checksum mismatch for ${file}" >&2
        echo "  expected: ${expected}" >&2
        echo "  got:      ${actual}" >&2
        rm -f "${RESEARCH_DEST}/${file}"
        exit 1
      fi
    fi
  done

  echo "Installed:"
  echo "  ~/.claude/skills/research/"
fi

echo ""
echo "Done. Restart Claude Code for skills to take effect."
