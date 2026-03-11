#!/usr/bin/env bash
# harness-restore.sh — interactive shell installer for harness.yaml configs
#
# Usage:
#   ./harness-restore.sh [path/to/harness.yaml]
#   curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness-restore.sh | bash -s -- harness.yaml

set -euo pipefail

CONFIG="${1:-harness.yaml}"
BRANCH="main"
SKILLS_DEST="${HOME}/.claude/skills"

if [[ ! -f "$CONFIG" ]]; then
  echo "harness-restore: config not found: $CONFIG" >&2
  echo ""
  echo "Get a template:"
  echo "  curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness.yaml.example > harness.yaml"
  echo ""
  echo "Or generate from your current setup (inside Claude Code):"
  echo "  /harness-export"
  exit 1
fi

# Parse harness.yaml using Python (available on macOS and most Linux)
# Outputs TSV: TYPE<TAB>field1<TAB>field2<TAB>...
# Types:
#   M <short-name> <owner/repo>   — marketplace entry
#   P <name> <marketplace> <description>  — plugin entry
_parse_config() {
  python3 - "$1" <<'PYEOF'
import sys

with open(sys.argv[1]) as f:
    content = f.read()

section = None
current_plugin = {}
plugins = []
marketplaces = {}  # short-name -> owner/repo

for line in content.splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith('#'):
        continue

    indent = len(line) - len(line.lstrip())

    if indent == 0:
        key = stripped.rstrip(':')
        if key == 'marketplaces':
            section = 'marketplaces'
        elif key == 'plugins':
            section = 'plugins'
        else:
            section = None
        continue

    if section == 'marketplaces' and ':' in stripped and not stripped.startswith('-'):
        # "harness-kit: harnessprotocol/harness-kit"
        parts = stripped.split(':', 1)
        name = parts[0].strip()
        source = parts[1].strip()
        marketplaces[name] = source

    elif section == 'plugins':
        if stripped.startswith('- name:'):
            if current_plugin:
                plugins.append(current_plugin)
            current_plugin = {'name': stripped[7:].strip()}
        elif stripped.startswith('marketplace:'):
            current_plugin['marketplace'] = stripped[12:].strip()
        elif stripped.startswith('description:'):
            current_plugin['description'] = stripped[12:].strip()

if current_plugin:
    plugins.append(current_plugin)

for name, source in marketplaces.items():
    print(f'M\t{name}\t{source}')

for p in plugins:
    name = p.get('name', '')
    mp = p.get('marketplace', '')
    desc = p.get('description', '')
    print(f'P\t{name}\t{mp}\t{desc}')
PYEOF
}

echo "Reading $CONFIG..."
echo ""

# Collect parsed data into bash 3.2-compatible indexed arrays
mp_names=()
mp_sources=()
plugin_names=()
plugin_mps=()
plugin_descs=()

while IFS=$'\t' read -r type a b c; do
  if [[ "$type" == "M" ]]; then
    mp_names+=("$a")
    mp_sources+=("$b")
  elif [[ "$type" == "P" ]]; then
    plugin_names+=("$a")
    plugin_mps+=("$b")
    plugin_descs+=("$c")
  fi
done < <(_parse_config "$CONFIG")

if [[ ${#plugin_names[@]} -eq 0 ]]; then
  echo "No plugins found in $CONFIG." >&2
  exit 1
fi

echo "Found ${#plugin_names[@]} plugin(s):"
echo ""
for i in "${!plugin_names[@]}"; do
  printf "  %d. %s (%s) — %s\n" "$((i+1))" "${plugin_names[$i]}" "${plugin_mps[$i]}" "${plugin_descs[$i]}"
done
echo ""

# Interactive selection
selected_names=()
selected_mps=()

for i in "${!plugin_names[@]}"; do
  name="${plugin_names[$i]}"
  mp="${plugin_mps[$i]}"
  desc="${plugin_descs[$i]}"

  printf "Install %s (%s) — %s? [y/N] " "$name" "$mp" "$desc"
  read -r answer </dev/tty
  if [[ "${answer}" == "y" || "${answer}" == "Y" || "${answer}" == "yes" ]]; then
    selected_names+=("$name")
    selected_mps+=("$mp")
  fi
done

echo ""

if [[ ${#selected_names[@]} -eq 0 ]]; then
  echo "Nothing selected. Exiting."
  exit 0
fi

echo "Installing ${#selected_names[@]} skill(s)..."
echo ""

# Helper: look up owner/repo for a marketplace short name
_mp_source() {
  local name="$1"
  for i in "${!mp_names[@]}"; do
    if [[ "${mp_names[$i]}" == "$name" ]]; then
      echo "${mp_sources[$i]}"
      return
    fi
  done
  echo ""
}

install_ok=()
install_skip=()

for i in "${!selected_names[@]}"; do
  name="${selected_names[$i]}"
  mp="${selected_mps[$i]}"
  source=$(_mp_source "$mp")

  if [[ -z "$source" ]]; then
    echo "  ○ $name — marketplace '$mp' not in config, skipping direct install"
    install_skip+=("${name}@${mp}")
    continue
  fi

  # Only know how to download from harnessprotocol/harness-kit (known URL pattern)
  case "$source" in
    harnessprotocol/harness-kit)
      raw_base="https://raw.githubusercontent.com/${source}/${BRANCH}"
      dest="${SKILLS_DEST}/${name}"
      mkdir -p "$dest"
      if curl -fsSL "${raw_base}/plugins/${name}/skills/${name}/SKILL.md" \
           -o "${dest}/SKILL.md" 2>/dev/null; then
        curl -fsSL "${raw_base}/plugins/${name}/skills/${name}/README.md" \
             -o "${dest}/README.md" 2>/dev/null || true
        echo "  ✓ $name → ~/.claude/skills/${name}/"
        install_ok+=("${name}@${mp}")
      else
        echo "  ✗ $name — download failed (check plugin name)"
        install_skip+=("${name}@${mp}")
      fi
      ;;
    *)
      echo "  ○ $name — direct install not supported for '$source' (requires marketplace)"
      install_skip+=("${name}@${mp}")
      ;;
  esac
done

echo ""

if [[ ${#install_ok[@]} -gt 0 ]]; then
  echo "Installed ${#install_ok[@]} skill(s) to ~/.claude/skills/."
  echo "Restart Claude Code for them to take effect."
  echo ""
fi

# Collect unique marketplaces for selected plugins
selected_mp_set=()
for mp in "${selected_mps[@]}"; do
  already=false
  for existing in "${selected_mp_set[@]:-}"; do
    [[ "$existing" == "$mp" ]] && already=true && break
  done
  $already || selected_mp_set+=("$mp")
done

echo "For the full install (includes scripts, hooks, and auto-updates), run in Claude Code:"
echo ""

for mp in "${selected_mp_set[@]}"; do
  source=$(_mp_source "$mp")
  [[ -n "$source" ]] && echo "  /plugin marketplace add $source"
done

echo ""

for i in "${!selected_names[@]}"; do
  echo "  /plugin install ${selected_names[$i]}@${selected_mps[$i]}"
done

echo ""
echo "Or import interactively: /harness-import $CONFIG"
