# pull-request-sweep

Cross-repo PR sweep — discover, triage, review, merge, and report on all your open PRs.

## Usage

```
/plugin install pull-request-sweep@harness-kit
```

Then:

```
/pull-request-sweep
```

Or:

> "Check my PRs."
> "What's the status of all my open PRs?"
> "Sweep my PRs."

## What It Does

1. Discovers all open (non-draft) PRs authored by you across all repos
2. Enriches each PR with CI status and merge state
3. Triages into: MERGE_READY / PENDING_CI / NEEDS_REVIEW / BEHIND_BASE / CI_FAILING / CHANGES_REQUESTED / CONFLICTING / BLOCKED
4. Shows triage table and waits for your confirmation
5. Acts: merges ready PRs, rebases behind ones, fixes quick CI failures (lint/format/typo), runs code reviews on unreviewed PRs
6. Produces a full report

## Notes

- Requires the `gh` CLI (`brew install gh`, then `gh auth login`)
- Uses the `review` skill for code reviews — install it alongside this plugin
- Never acts on draft PRs
- Never auto-resolves CHANGES_REQUESTED — flags for human follow-up
- Safe to run repeatedly — idempotent, already-merged PRs won't reappear
- Pairs with `/loop 30m /pull-request-sweep` for ongoing PR babysitting
