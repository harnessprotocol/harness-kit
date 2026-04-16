#!/usr/bin/env bash
# stamp-version.sh <version>
# Writes a release version into all package manifests and Tauri config.
# Used by the release workflow before building artifacts.
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

# Validate semver (major.minor.patch, optional pre-release)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: '$VERSION' is not a valid semver string" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

stamp_json() {
  local file="$1"
  echo "  $file"
  local tmp
  tmp="$(mktemp)"
  jq --arg v "$VERSION" '.version = $v' "$file" > "$tmp"
  mv "$tmp" "$file"
}

stamp_cargo() {
  local file="$1"
  echo "  $file"
  # Replace only the first occurrence (the crate's own version, not dependency versions).
  # Uses awk instead of sed to avoid BSD sed vs GNU sed divergence on macOS vs Linux.
  awk -v ver="$VERSION" '
    !replaced && /^version = "/ { sub(/"[^"]*"/, "\"" ver "\""); replaced=1 }
    { print }
  ' "$file" > "${file}.tmp"
  mv "${file}.tmp" "$file"
}

echo "Stamping version $VERSION into:"
stamp_json "$REPO_ROOT/packages/shared/package.json"
stamp_json "$REPO_ROOT/packages/core/package.json"
stamp_json "$REPO_ROOT/apps/cli/package.json"
stamp_json "$REPO_ROOT/apps/desktop/src-tauri/tauri.conf.json"
stamp_cargo "$REPO_ROOT/apps/desktop/src-tauri/Cargo.toml"
echo "Done."
