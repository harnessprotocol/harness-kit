# dependabot-sweep

Clears a repository's open Dependabot security alerts end to end, with minimal intervention.

## What it does

```
fetch alerts → triage by manifest → fix per ecosystem → verify → branch → commit → push → PR → merge
```

- **Fetch** every open alert via `gh api .../dependabot/alerts`, grouped by manifest.
- **Fix** each one with the smallest change that lands a patched version:
  - direct deps → bump the version range
  - transitive deps → ecosystem override/pin (pnpm `overrides`, npm `overrides`, …)
  - then regenerate the lockfile (lockfile-only)
- **Verify** with the ecosystem audit (moderate+) and a frozen-lockfile install.
- **Ship** on a `fix/dependabot-security-alerts` branch → conventional commit → PR → squash-merge once CI is green.

## Ecosystems

pnpm / npm (incl. workspaces and standalone `--ignore-workspace` lockfiles), cargo (runtime vs build-only triage), pip, go, bundler. Other ecosystems follow the same direct-vs-transitive → regenerate → audit pattern.

## Autonomy

Running the skill is consent for the full workflow — it does not prompt to push, open a PR, or merge. It **escalates** only for genuine judgment calls: a major-version bump of a direct dependency, an alert with no reachable patch (recommend dismissal), an audit that won't clear, or CI that fails after one quick-fix attempt.

## Requirements

- `gh` CLI authenticated (`GH_TOKEN` or `gh auth login`)
- The repo's package manager(s) installed (`pnpm`, `cargo`, etc.)

## Usage

```
/dependabot-sweep
```

Also triggers on: "address the dependabot alerts", "fix the security vulnerabilities", "clear the dependabot alerts".
