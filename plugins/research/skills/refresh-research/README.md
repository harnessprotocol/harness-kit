# /refresh-research

Re-fetch live research sources, detect meaningful changes, and update synthesis files.

## What It Does

Your research corpus ages. GitHub repos get new releases, documentation sites update their APIs, features ship. This skill goes back to refreshable sources (repos and docs — not blogs or papers), fetches the current state, diffs against what you captured, and surgically updates syntheses.

Raw sources are versioned (new file per fetch, never overwritten). Syntheses are updated in place, preserving your analysis while updating facts.

## Usage

```
/refresh-research                              # Interactive — show stale entries, pick which to refresh
/refresh-research research/agent-memory/cognee-architecture.md  # Specific file
/refresh-research agent-memory                 # All refreshable entries in a category
/refresh-research --all                        # All refreshable entries
/refresh-research --stale 14                   # Entries not checked in 14+ days (default: 30)
/refresh-research --backfill                   # One-time: add source_type to entries missing it
/refresh-research --audit                      # Dry-run: staleness report, no modifications
```

## Frontmatter Fields

Three fields added to synthesis YAML frontmatter:

| Field | Values | Purpose |
|-------|--------|---------|
| `source_type` | `repo`, `docs`, `blog`, `paper`, `internal`, `video` | Gates refresh eligibility |
| `last_checked` | `YYYY-MM-DD` | Staleness clock (separate from `date`) |
| `refresh_status` | `changed`, `unchanged`, `dead-link`, `archived` | Informational |

## Getting Started

1. Run `/refresh-research --audit` to see your corpus staleness
2. Run `/refresh-research --backfill` to classify sources (one-time)
3. Run `/refresh-research --stale 30` periodically to keep sources fresh

## Related Skills

- **`/research`** — the primary research workflow. Use it to process new sources into your knowledge base. `/refresh-research` keeps those sources up to date over time.
