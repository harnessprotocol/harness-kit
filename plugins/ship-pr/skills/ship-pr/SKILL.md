---
name: ship-pr
description: Use when wrapping up a development task and ready to ship — runs local tests, creates a PR (if one doesn't exist) with a structured description template, conducts a code review via subagent, checks CI status and attempts quick fixes if failing, verifies the branch is up-to-date with base, then squash merges and cleans up. Trigger when the user says they're done with a feature, want to ship, wrap up, open a PR, finalize their work, or merge their branch. Also invoke proactively after completing all tasks in an implementation plan.
---

# Ship PR

A structured end-of-task workflow: create PR → code review → CI → base sync → squash merge.

**Announce at start:** "I'm using the ship-pr skill to wrap up this work."

---

## Step 1: Pre-flight — Run Local Tests

Run the test suite before touching anything else. Detect the right command from project files:

| Indicator | Command |
|-----------|---------|
| CLAUDE.md test command | Use that (takes precedence over all below) |
| `go.mod` | `go test ./...` |
| `package.json` | `npm test` or `yarn test` |
| `pyproject.toml` / `setup.py` | `pytest` |
| `Cargo.toml` | `cargo test` |

If **tests fail:** Stop. Show the failures clearly. Don't proceed — fix them or ask the user how to handle. Do not skip or bypass test hooks.

If **tests pass:** Continue.

---

## Step 2: Check for Existing PR

```bash
gh pr view --json number,url,state 2>/dev/null
```

- **PR already open:** Skip to [Step 4 — Code Review](#step-4-code-review).
- **No PR:** Continue to Step 3.

---

## Step 3: Create the PR

### Push the branch

```bash
git push -u origin $(git branch --show-current)
```

### Title

Use the most meaningful commit message as a starting point, cleaned up to be concise. Follow conventional commit format (`feat:`, `fix:`, `refactor:`, etc.) if the repo uses it — check recent commits with `git log --oneline -10`.

### Auto-detect labels

Infer labels from the branch name and commits — apply with `--label` if the label exists in the repo:

| Pattern | Label |
|---------|-------|
| `fix/`, `bug/`, "fix" in commits | `bug` |
| `feat/`, `feature/` | `enhancement` |
| `refactor/`, `chore/` | `refactor` |
| `docs/` | `documentation` |

Skip labels that don't exist in the repo rather than erroring.

### PR description template

Fill in every section based on the actual changes — no unfilled placeholders:

```
## Summary
<!-- What this PR does and why — 2-4 sentences. Lead with intent, not implementation. -->

## Changes
<!-- Key changes. Be specific — not "updated code" but what and why. -->
-

## Test Plan
<!-- How this was verified -->
- [ ] Local tests pass
- [ ] CI checks pass
- [ ] <any manual or integration steps>

## Notes
<!-- Edge cases, follow-ups, known limitations, or anything a reviewer should know -->
```

### Create

```bash
gh pr create \
  --title "<title>" \
  --body "$(cat <<'EOF'
<filled-template>
EOF
)"
```

Leave `--reviewer` and `--assignee` unset.

---

## Step 4: Code Review

Invoke the `review` skill (use the Skill tool) to review all changes in this PR.

The review should cover:
- **Baseline:** correctness, security, error handling, performance, naming clarity
- **Test coverage:** flag any new functionality that lacks tests
- **Codebase-specific:** scan CLAUDE.md for any `## Code Review`, `## Standards`, or `## Gotchas` sections and incorporate those requirements

After the review, present a clear report:

```
Code Review Report
──────────────────
[MUST FIX] <issue> — <file>:<line>
[SUGGESTION] <issue>
No blocking issues found.
```

**If MUST FIX items:** Address them, commit, push. Once resolved, continue to Step 5.

**If only suggestions:** Note them for the user to follow up post-merge at their discretion.

---

## Step 5: CI Status

```bash
gh pr checks
```

**All passing:** Continue.

**Failing:**
1. Read the failure output — identify root cause
2. **Quick fix** (lint, formatting, import, typo): Fix it, commit, push, wait for CI to rerun, then continue
3. **Complex failure** (logic error, architecture issue, flaky infra): Stop and report clearly:
   > "CI is failing due to [X]. This needs a dedicated fix before merging — let's plan it out."

Never merge with failing CI.

---

## Step 6: Base Branch Sync

Check whether the base branch has moved since branching:

```bash
BASE=$(gh pr view --json baseRefName --jq '.baseRefName')
git fetch origin $BASE
git log HEAD..origin/$BASE --oneline
```

**New commits exist:** Rebase and force-push:

```bash
git rebase origin/$BASE
git push --force-with-lease
```

If rebase has conflicts, resolve them, then `git rebase --continue`.

After rebasing and pushing, wait for CI to pass on the rebased code:

```bash
gh pr checks --watch --fail-fast
```

If CI fails after rebase: treat as a Step 5 failure — diagnose and fix.

**No new commits:** Skip.

---

## Step 7: Confirm and Squash Merge

First, verify no reviews are blocking:

```bash
gh pr view --json reviewDecision --jq '.reviewDecision'
```

- **`CHANGES_REQUESTED`:** Stop. Report: "This PR has changes requested by a reviewer. Address their feedback before merging." Do not proceed.
- **`APPROVED` or empty (no required reviews):** Continue.

Before merging, confirm with the user unless they've already said to proceed automatically:

```
Ready to squash merge PR #<N> ("<title>") into <base>.
All checks passed. Proceed?
```

Wait for confirmation. If the user says to always proceed without asking (e.g. "just ship it", "auto-merge", "no need to confirm"), skip this prompt for the rest of the session.

Once confirmed:

```bash
gh pr merge --squash --delete-branch
```

After merge, sync locally:

```bash
git checkout $BASE
git pull
git branch -d <feature-branch> 2>/dev/null || true
```

Report: "PR merged. Branch cleaned up. Done."

---

## Quick Reference

| Step | Action | Block on failure? |
|------|--------|-------------------|
| 1. Local tests | Run test suite | Yes — fix first |
| 2. PR check | Exists? | Skip to review |
| 3. Create PR | Push + `gh pr create` | — |
| 4. Code review | `review` skill | Yes for MUST FIX |
| 5. CI | `gh pr checks` | Yes — fix or plan |
| 6. Base sync | Rebase if behind + re-verify CI | Yes — resolve conflicts, fix CI |
| 7. Merge | Check reviews → confirm → squash | Yes — address CHANGES_REQUESTED |

## Rules

**Never:**
- Merge with failing CI
- Merge with CHANGES_REQUESTED reviews outstanding
- Force-push to main/master
- Use `--no-verify` to bypass hooks
- Leave PR template sections unfilled
- Set reviewer or assignee

**Always:**
- Squash merge
- Delete the branch after merge
- Address MUST FIX review items before merging
