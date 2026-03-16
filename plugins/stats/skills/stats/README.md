# stats

Generate an interactive HTML dashboard for your Claude Code usage.

## Usage

```
/stats                    # last 14 days (default)
/stats last week          # last 7 days
/stats last month         # last 30 days
/stats all time           # everything since first session
/stats Mar 1 to Mar 10   # specific date range
```

## What You Get

An HTML dashboard opens in your browser with:

- **Summary cards** — total messages, sessions, output tokens, active days
- **Daily activity chart** — stacked bar chart of messages, sessions, and tool calls
- **Token usage trend** — line chart of output tokens over time
- **Model distribution** — donut chart showing which models you used
- **Hourly pattern** — when you're most active during the day
- **Project breakdown** — where you spent your tokens
- **Sortable tables** — daily and session-level detail with click-to-sort headers
- **Live filtering** — filter by date range, model, or project without re-running

## Data Sources

The plugin reads from `~/.claude/`:

- `stats-cache.json` — pre-computed daily aggregates (fast, may be slightly stale)
- `projects/**/*.jsonl` — full session transcripts (scanned for recent data)
- `history.jsonl` — command history for project path mapping

All data stays local. Nothing is sent to any server.

## Limitations

- **Not a billing tool.** Token counts are not costs — pricing depends on your plan.
- **Cache staleness.** `stats-cache.json` may lag behind by a few days. The script fills the gap by scanning recent session files directly.
- **Large histories.** Scanning "all time" with thousands of sessions can take 10-30 seconds.

## Requirements

- Python 3.10+
- Browser with internet access (charts use Chart.js from cdn.jsdelivr.net — they'll be blank if you're offline or behind a proxy that blocks CDN traffic)
