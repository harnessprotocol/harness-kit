#!/usr/bin/env bash
# validate-manifests.sh
# Single source of truth for plugin/marketplace manifest validation.
# Called by both the Validate (PR/push) and Release (gate) workflows so a
# release is held to the exact same manifest checks as a PR.
#
# Run from the repo root. Exits non-zero on the first failing check.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "== Validate JSON manifests =="
python3 -c "import json; json.load(open('.claude-plugin/marketplace.json'))"
for manifest in plugins/*/.claude-plugin/plugin.json; do
  echo "  $manifest"
  python3 -c "import json; json.load(open('$manifest'))"
done

echo "== Check version alignment =="
python3 -c "
import json, sys

marketplace = json.load(open('.claude-plugin/marketplace.json'))
errors = []

for plugin in marketplace['plugins']:
    name = plugin['name']
    mp_version = plugin['version']
    manifest_path = f'plugins/{name}/.claude-plugin/plugin.json'

    try:
        manifest = json.load(open(manifest_path))
    except FileNotFoundError:
        errors.append(f'{name}: plugin.json not found at {manifest_path}')
        continue

    pj_version = manifest.get('version', '(missing)')
    if mp_version != pj_version:
        errors.append(f'{name}: marketplace.json says {mp_version}, plugin.json says {pj_version}')

if errors:
    print('Version mismatch:')
    for e in errors:
        print(f'  {e}')
    sys.exit(1)
else:
    for plugin in marketplace['plugins']:
        print(f\"{plugin['name']}: v{plugin['version']}\")
    print('All versions aligned.')
"

echo "== Check all plugins registered =="
python3 -c "
import json, sys, os, glob

marketplace = json.load(open('.claude-plugin/marketplace.json'))
registered = {p['name'] for p in marketplace['plugins']}

on_disk = {os.path.basename(d) for d in glob.glob('plugins/*') if os.path.isdir(d)}

errors = []
for name in sorted(on_disk - registered):
    errors.append(f'{name}: directory exists but not registered in marketplace.json')
for name in sorted(registered - on_disk):
    errors.append(f'{name}: registered in marketplace.json but directory not found')

if errors:
    print('Plugin registration mismatch:')
    for e in errors:
        print(f'  {e}')
    sys.exit(1)
else:
    print(f'All {len(on_disk)} plugins registered: {sorted(on_disk)}')
"

echo "== Validate x-developed-with field =="
python3 -c "
import json, sys, glob

errors = []
for manifest_path in glob.glob('plugins/*/.claude-plugin/plugin.json'):
    manifest = json.load(open(manifest_path))
    dw = manifest.get('x-developed-with')
    if dw is not None:
        if not isinstance(dw, str) or not dw.strip():
            errors.append(f'{manifest_path}: x-developed-with must be non-empty string if present, got {dw!r}')

if errors:
    print('x-developed-with validation errors:')
    for e in errors:
        print(f'  {e}')
    sys.exit(1)
else:
    print('x-developed-with field valid (optional).')
"

echo "== Validate requires.env schema =="
python3 -c "
import json, sys, glob

errors = []
for manifest_path in glob.glob('plugins/*/.claude-plugin/plugin.json'):
    manifest = json.load(open(manifest_path))
    requires = manifest.get('requires', {})
    env_list = requires.get('env', [])

    for i, entry in enumerate(env_list):
        prefix = f'{manifest_path} requires.env[{i}]'
        if not isinstance(entry.get('name'), str) or not entry['name']:
            errors.append(f'{prefix}: missing or invalid \"name\" (must be non-empty string)')
        if not isinstance(entry.get('description'), str) or not entry['description']:
            errors.append(f'{prefix}: missing or invalid \"description\" (must be non-empty string)')
        if 'required' in entry and not isinstance(entry['required'], bool):
            errors.append(f'{prefix}: \"required\" must be boolean if present')
        if 'sensitive' in entry and not isinstance(entry['sensitive'], bool):
            errors.append(f'{prefix}: \"sensitive\" must be boolean if present')

if errors:
    print('requires.env schema errors:')
    for e in errors:
        print(f'  {e}')
    sys.exit(1)
else:
    print('requires.env schema valid.')
"

echo "== Validate plugin.json against Protocol schema =="
# Schema is bundled at .github/schema/plugin.schema.json — sync from harness-protocol
# repo (schema/draft/plugin.schema.json) when the upstream schema changes.
if ! python3 -c "import jsonschema" 2>/dev/null; then
  python3 -m pip install -q 'jsonschema>=4.18,<5' || {
    echo "::error::Failed to install jsonschema"
    exit 1
  }
fi
python3 -c "
import json, sys, glob
from jsonschema import Draft202012Validator

schema = json.load(open('.github/schema/plugin.schema.json'))
validator = Draft202012Validator(schema)
errors = []

for path in sorted(glob.glob('plugins/*/.claude-plugin/plugin.json')):
    name = path.split('/')[1]
    manifest = json.load(open(path))
    for err in validator.iter_errors(manifest):
        loc = ' -> '.join(str(p) for p in err.absolute_path) or '(root)'
        errors.append(f'{name}: [{loc}] {err.message}')
        print(f'::error file={path}::{err.message}')

if errors:
    print(f'\nSchema validation failed ({len(errors)} error(s)):')
    for e in errors:
        print(f'  {e}')
    sys.exit(1)
else:
    print('All plugin.json files valid against Protocol schema.')
"

echo "== Check SKILL.md frontmatter =="
MISSING=0
for skill_md in plugins/*/skills/*/SKILL.md; do
  if [ "$(head -1 "$skill_md")" != "---" ]; then
    echo "::error file=$skill_md::Missing YAML frontmatter (first line must be ---)"
    MISSING=$((MISSING + 1))
  fi
done
if [ "$MISSING" -gt 0 ]; then
  echo "SKILL.md frontmatter check failed ($MISSING file(s) missing frontmatter)"
  exit 1
fi
echo "All SKILL.md files have YAML frontmatter."

echo "== Check README plugin badge count =="
mp_count=$(jq '.plugins | length' .claude-plugin/marketplace.json)
badge_count=$(grep -oP 'Browse all \K[0-9]+(?= plugins)' README.md)
if [ "$badge_count" != "$mp_count" ]; then
  echo "::error::README badge says $badge_count plugins but marketplace.json has $mp_count"
  exit 1
fi
echo "README badge count matches marketplace.json ($mp_count plugins)."

echo "All manifest checks passed."
