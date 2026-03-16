# merge-pr

Merge a ready PR — verify CI, sync with base, confirm, squash merge, and clean up.

## Usage

```
/plugin install merge-pr@harness-kit
```

Then, when a PR is ready to land:

```
/merge-pr
```

Or tell Claude:

> "Merge this PR."
> "Squash merge and clean up."

## What It Does

1. Identifies the open PR on the current branch (or accepts a PR number)
2. Verifies CI is passing and no CHANGES_REQUESTED reviews are outstanding
3. Syncs with the base branch — rebases if it's fallen behind
4. Confirms with you before merging
5. Squash merges, deletes the remote branch, and syncs your local checkout

## Pipeline

```
Development ─→ /open-pr ─→ /merge-pr ─→ /deploy-preview ─→ /go-live
                              ▲ you are here
```

## Notes

- Requires the `gh` CLI (`brew install gh`, then `gh auth login`)
- Works on any open PR — does not require `/open-pr` to have created it
- Does NOT deploy to any environment — use `/deploy-preview` or `/go-live` after merging
