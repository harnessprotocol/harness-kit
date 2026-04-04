# Contributing

Thank you for your interest in contributing to harness-kit! This guide covers everything from initial setup through submitting your first PR.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v24+ ([download](https://nodejs.org/))
- **pnpm** 10.29.1+ (install via `corepack enable` or `npm install -g pnpm`)
- **Rust** 1.77.2+ ([install via rustup](https://rustup.rs/)) — required for desktop app
- **Python** 3.11+ — required for evals
- **Git** for version control

Verify your installations:

```bash
node --version   # should show v24+
pnpm --version   # should show 10.29.1+
rustc --version  # should show 1.77.2+
python3 --version # should show 3.11+
```

## Quick start

```bash
git clone --recurse-submodules https://github.com/harnessprotocol/harness-kit.git
cd harness-kit
pnpm install
git checkout -b feat/<plugin-name>
# implement plugin (see CLAUDE.md for full 5-step guide)
# open PR against main
```

> If you already cloned without `--recurse-submodules`, run `git submodule update --init` to pull submodules (e.g., `packages/membrain`).

CI runs on every PR. Squash merge only.

---

## Building the project

### Build all packages

```bash
pnpm build
```

This builds all packages in dependency order.

### Build specific packages

```bash
pnpm build:core         # Core library
pnpm build:cli          # CLI tool
pnpm build:website      # Documentation website
pnpm build:marketplace  # Marketplace web app
pnpm build:desktop      # Desktop app (requires Rust, copies to $HOME/Applications/)
pnpm build:board        # Board client
pnpm build:board-server # Board WebSocket server
```

### Development mode

Run development servers with hot reload:

```bash
pnpm dev:website        # Documentation site
pnpm dev:marketplace    # Marketplace web app
pnpm dev:desktop        # Tauri desktop app
pnpm dev:board          # Board client
pnpm dev:board-server   # Board server
```

---

## Running tests

### All tests

```bash
# Run all tests across packages
pnpm test:all

# Run with coverage
pnpm test:coverage
```

### Package-specific tests

```bash
# Core library tests
pnpm test:core

# Desktop app tests
pnpm test:desktop        # Runs Rust + unit tests
pnpm test:desktop:unit   # TypeScript/React tests only
pnpm test:desktop:rust   # Rust tests only
pnpm test:desktop:e2e    # End-to-end tests (requires dev server running)
```

**Note:** Desktop e2e tests require the dev server to be running separately. Run `pnpm dev:desktop` in another terminal before running `pnpm test:desktop:e2e`.

---

## Evals setup

The evals system tests skill behavior across Claude models. See [`evals/README.md`](evals/README.md) for full documentation.

### Quick start

```bash
cd evals

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run offline tests (no API key required)
python runner.py --offline

# Run with API key (requires ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY="your-key-here"
python runner.py
```

### Common eval commands

```bash
# Test a single skill
python runner.py --skill research

# Structure checks only (lower cost)
python runner.py --structure-only

# Preview what would run
python runner.py --dry-run
```

---

## Common issues

### Build failures

**Issue:** `pnpm install` fails with dependency errors  
**Solution:** Ensure you're using pnpm 10.29.1+. Run `pnpm --version` to check.

**Issue:** Desktop app build fails  
**Solution:** Ensure Rust 1.77.2+ is installed. Run `rustc --version` to check.

**Issue:** TypeScript errors after pulling latest changes  
**Solution:** Rebuild core packages: `pnpm build:core`

**Issue:** Submodule missing (e.g., `packages/membrain`)  
**Solution:** Run `git submodule update --init --recursive`

### Test failures

**Issue:** Desktop e2e tests fail with "connection refused"  
**Solution:** Run `pnpm dev:desktop` in a separate terminal before running e2e tests.

**Issue:** Rust tests fail with "test cannot be run in parallel"  
**Solution:** Rust tests are configured to run with `--test-threads=1` by default in the script.

### Evals issues

**Issue:** `python runner.py` fails with missing dependencies  
**Solution:** Activate the virtual environment and install requirements:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

**Issue:** Evals fail with API errors  
**Solution:** Use offline mode during development: `python runner.py --offline`

### Plugin development

**Issue:** Plugin not showing up in marketplace  
**Solution:** Ensure `source` path in `marketplace.json` is relative to repo root (e.g., `"./plugins/my-plugin"`).

**Issue:** Versions out of sync  
**Solution:** Versions in `plugin.json` and `marketplace.json` must match exactly.

**Issue:** Plugin installation fails  
**Solution:** Validate plugin manifest with the schema in `.github/schema/plugin.schema.json`.

---

## Adding a plugin

The full step-by-step guide lives in [CLAUDE.md](CLAUDE.md) — directory layout, manifest format, marketplace registration, versioning, and the release checklist. This file covers what comes after: skill quality, PR format, and commit standards.

---

## Naming convention

Plugin and skill names follow these rules:

- **Lowercase kebab-case** — `merge-pr`, not `MergePR` or `merge_pr`
- **Verb-first for actions** — `merge-pr` (merges), `review` (reviews), `capture` (captures)
- **Noun for modes/tools** — `research`, `explain`, `notify`
- **Max 2 words** — `pr-sweep`, not `pull-request-sweep`
- **Prefer shorter names** — `capture` over `capture-session`, `stats` over `usage-stats`

The plugin directory name, skill directory name, SKILL.md `name:` field, and `plugin.json` `name` field must all match exactly.

---

## Writing SKILL.md

Skill quality is the primary review criterion. Get this right.

### Frontmatter (required)

```yaml
---
name: my-skill
description: Use when user invokes /my-skill with [argument types]. [One sentence of behavior.]
---
```

- `name` — the slash command (no spaces, lowercase, hyphenated)
- `description` — the trigger. Claude Code reads this to decide when to invoke the skill. Must start with "Use when" and name the invocation pattern explicitly.

**Do not** write a vague description like "Helps the user manage tasks." Write what signals it: `/my-skill` invocation, specific argument types, or natural language patterns.

### Required sections

| Section | Required when |
|---------|--------------|
| Numbered steps (`## Step N: …`) | Always — one action per step |
| `## Quick Reference` table | Any skill with 3+ steps |
| `## Rules` with Never/Always lists | Any skill with safety constraints or merge/write operations |
| `## Argument Types` table | Any parameterized skill |

### Step conventions

- Number all steps. Prefix with `## Step N:` and a short label.
- Each step: one action, one concrete command where applicable. Never vague ("process the file" → tell it exactly how).
- Use Bash blocks for exact commands Claude should run.
- If a step requires stopping to verify before continuing, say so explicitly: `**STOP HERE until verified.**`
- Mark the full workflow mandatory when order matters: `## Steps (MANDATORY — follow in order)`

### Quick Reference table format

```markdown
## Quick Reference

| Step | Action | Block on failure? |
|------|--------|-------------------|
| 1. Name | What it does | Yes — fix first |
```

### Rules section format

```markdown
## Rules

**Never:**
- [constraint]

**Always:**
- [invariant]
```

### What not to add

- Don't repeat the README in the SKILL.md — the README is for humans, the SKILL.md is for the model.
- Don't describe the plugin philosophy or background. State the workflow.
- Don't add sections not listed above unless they carry real behavioral signal.

---

## PR format

### Branch naming

```
feat/<plugin-name>          # new plugin
feat/<plugin>/<feature>     # enhancement to existing plugin
fix/<plugin>/<issue>        # bug fix
docs/<name>                 # documentation only
chore/<name>                # maintenance, version bumps
```

### PR description

Use this structure (reference PR #1 and #3 for examples):

```markdown
## Summary

- What this adds or changes (bullets)

## What ships

| File | Purpose |
|------|---------|
| plugins/x/.claude-plugin/plugin.json | Plugin manifest |
| plugins/x/skills/x/SKILL.md | Skill definition |
| plugins/x/skills/x/README.md | Human-facing docs |

## CI

- JSON manifests valid ✓
- Version aligned between plugin.json and marketplace.json ✓

## Test plan

- [ ] Test case 1
- [ ] Test case 2
```

### Merge strategy

Squash merge only. One commit per PR lands on main.

---

## Commits

Conventional commits with imperative present tense:

| Prefix | Use for |
|--------|---------|
| `feat:` | New plugin, new capability |
| `feat(scope):` | Enhancement to specific plugin |
| `fix:` | Bug in an existing skill or script |
| `docs:` | Documentation only — no skill behavior changes |
| `chore:` | Version bumps, CI, tooling |
| `refactor:` | Internal restructuring, no behavior change |

Examples from this repo:
```
feat: capture-session plugin — on-demand session information capture
feat(orient): improve query behavior, caps, and output format
docs: add plugins vs. skills guide
chore: set initial version to v0.1.0
```

---

## CI

Six checks run on every PR via `validate.yml`:

| Check | What it validates |
|-------|------------------|
| JSON manifests valid | `marketplace.json` and all `plugin.json` files parse without error |
| Version alignment | `version` in `plugin.json` and `marketplace.json` must match exactly |
| All plugins registered | Every `plugins/<name>/` directory has a matching `marketplace.json` entry |
| `x-developed-with` field | Must be a non-empty string if present (optional field) |
| `requires.env` schema | Each env entry has `name`, `description`, and valid `required`/`sensitive` booleans |
| Protocol schema | All `plugin.json` files validate against the Protocol's `plugin.schema.json` |

Plus five additional jobs: `test-all` (runs `pnpm test:all` across all packages), `core-build-test` (includes `pnpm audit --audit-level=critical`), `desktop-build-test`, `board-build`, `docs-build`. All must pass before merge. If they fail: fix manifests or source, push, CI re-runs automatically.

---

## Pre-submit checklist

Before opening a PR:

- [ ] `plugins/<name>/.claude-plugin/plugin.json` exists and is valid JSON
- [ ] `marketplace.json` has a matching entry with the same `version`
- [ ] `SKILL.md` has YAML frontmatter with `name:` and `description:`
- [ ] `description:` starts with "Use when" and names the invocation trigger
- [ ] `README.md` exists in `plugins/<name>/skills/<name>/`
- [ ] Plugin section added to `README.md` at repo root
- [ ] PR includes a test plan with at least one test per argument type
- [ ] If plugin includes agents: `agents/<name>.md` has YAML frontmatter with `name:` and `description:`
