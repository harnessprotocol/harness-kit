# open-pr

Pre-flight checks and PR creation — run tests, open a PR, code review, check CI, and hand off to merge.

## Usage

```
/plugin install open-pr@harness-kit
```

Then, when you're done with a feature:

```
/open-pr
```

Or tell Claude you're ready:

> "I'm done with this feature, open a PR."
> "Wrap this up and push for review."

## What It Does

1. Runs local tests
2. Creates a PR with a structured description (summary, changes, test plan)
3. Runs a code review via the `review` skill — flags MUST FIX issues before proceeding
4. Checks CI — attempts quick fixes (lint, format, typos) if failing
5. Reports PR status and hands off to `/merge-pr`

## Pipeline

```
Development ─→ /open-pr ─→ /merge-pr ─→ /deploy-preview ─→ /go-live
                 ▲ you are here
```

## Notes

- Requires the `gh` CLI (`brew install gh`, then `gh auth login`)
- Uses the `review` skill for code review — install it alongside this plugin
- Does NOT merge — use `/merge-pr` when the PR is ready to land
