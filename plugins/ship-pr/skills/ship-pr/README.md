# ship-pr

End-of-task shipping workflow — open a PR, code review, fix CI, and squash merge.

## Usage

```
/plugin install ship-pr@harness-kit
```

Then, when you're done with a feature:

```
/ship-pr
```

Or tell Claude you're ready:

> "I'm done with this feature, let's ship it."
> "Wrap this up and open a PR."

## What It Does

1. Runs local tests
2. Creates a PR with a structured description (summary, test plan)
3. Runs a code review via subagent — flags MUST FIX issues before proceeding
4. Checks CI — attempts quick fixes (lint, format, typos) if failing
5. Verifies the branch is up-to-date with base
6. Confirms with you, then squash merges and cleans up the branch

## Notes

- Requires the `gh` CLI (`brew install gh`, then `gh auth login`)
- Uses the `review` skill for code review — install it alongside this plugin
- Skips drafts — draft PRs are not shipped
- "Just ship it" mode available if you want to skip the confirmation gate
