# Research Plugin

A Claude Code plugin for systematically processing and indexing research materials — from any source, any medium — into a structured knowledge base you can build on over time.

## Components

- **`/research` skill** — the main workflow. Point it at a source, it extracts, preserves, and synthesizes.
- **`/refresh-research` skill** — re-fetch refreshable sources (repos, docs), detect changes, and surgically update syntheses. Supports staleness thresholds, backfill, and audit-only dry runs.
- **`rebuild-research-index.py`** — regenerates `research/INDEX.md` from synthesis file frontmatter. Both skills run this automatically. You can also run it manually if files get out of sync.

## Requirements

- **Claude Code** — required
- **`gh` CLI** ([GitHub CLI](https://cli.github.com/)) — required only for GitHub repository URLs; all other sources work without it
- **Python 3.10+** — for the index rebuild script (`pip install pyyaml`)

## What It Does

When you invoke `/research` with a source, the skill:

1. Checks whether you've already researched this (exact URL match) and whether a synthesis for this topic already exists
2. Fetches the content using the appropriate method for the source type
3. Saves the raw content to `resources/` — always, before anything else
4. Creates or updates a synthesis document in `research/[category]/`
5. Cross-references related research you've already done
6. Updates a master index so everything stays discoverable

Files are created relative to your current working directory — typically your project root.

**Key design principle: one synthesis per topic, many raw sources.** If you research a YouTube video about a tool and then later research that tool's documentation, you get two raw files in `resources/` and one synthesis document in `research/` that incorporates both. Knowledge accumulates rather than sprawls.

## Supported Source Types

The source medium doesn't matter. All of these work:

| Source | Example |
|--------|---------|
| GitHub repository | `github.com/owner/repo` |
| Documentation site | `docs.example.com`, ReadTheDocs |
| Product / marketing site | Company homepages, feature pages |
| Academic paper | arXiv links, PDF URLs |
| Blog post / article | dev.to, Substack, Medium, personal sites |
| Reddit post or thread | Any `reddit.com` link |
| YouTube video | `youtube.com` or `youtu.be` — captures description + transcript if available |
| Podcast episode | Show notes page — captures notes + any linked transcript |
| Live audio / dictation | Transcript from a dictation tool — see tip below |
| Local file | PDF, markdown, text, code — any readable format |

## Tip: Capture Live Audio with a Dictation Tool

For content that isn't on the web — a podcast playing through your speakers, a conversation, a lecture, a meeting — you can use a dictation tool to transcribe it in real time and feed the transcript directly into this skill.

Tools like [Superwhisper](https://superwhisper.com) or [Spokenly](https://spokenly.app) run locally and can transcribe anything your microphone picks up. When you're done, save the transcript as a text or markdown file and process it like any local file:

```
/research ~/Downloads/podcast-transcript.md
```

This effectively makes any audio source researchable — live or recorded.

## Usage

### Process a single source

```
/research https://example.com/article
/research https://github.com/owner/repo
/research ~/Downloads/paper.pdf
```

### Process multiple sources at once

```
/research https://url1.com, https://url2.com, /path/to/file.pdf
```

Each source goes through the full workflow sequentially.

### Audit for gaps

```
/research
```

Scans `resources/` and `research/` to find raw files without syntheses, syntheses missing source references, and INDEX.md gaps. Processes any found.

### Rebuild the index manually

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/rebuild-research-index.py"
```

### Keep sources fresh

```
/refresh-research --audit                      # See staleness report (no modifications)
/refresh-research --backfill                   # One-time: classify sources by type
/refresh-research --stale 30                   # Refresh entries not checked in 30+ days
/refresh-research research/agent-memory/cognee.md  # Refresh a specific file
/refresh-research agent-memory                 # Refresh all in a category
```

See the [refresh-research README](../refresh-research/README.md) for full details.

## Output Structure

```
your-project/
├── resources/
│   ├── temporal-docs-2026-03-06.md        # Raw extracted content, preserved verbatim
│   └── temporal-video-2026-03-06.md       # Raw content from YouTube video
└── research/
    ├── INDEX.md                           # Master index — includes Type and Last Checked columns
    ├── ai-routing/
    │   └── temporal.md                    # One synthesis per topic, updated as sources accumulate
    ├── agent-memory/
    │   └── cognee.md
    └── psychology/
        └── identity-continuity.md
```

## Synthesis Categories

Categories are fully customizable — create whatever fits your knowledge domain. The default set is oriented toward AI/technology research, but you can add `finance/`, `biology/`, `design/`, or anything else. Just use the category name; no configuration needed.

**Default categories:**

| Category | What goes here |
|----------|---------------|
| `agent-memory/` | Memory systems, RAG, knowledge graphs, persistence |
| `agent-communication/` | Multi-agent protocols, messaging standards |
| `ai-routing/` | Model selection, routing, orchestration |
| `ai-safety/` | Safety, alignment, guardrails, red-teaming |
| `foundational/` | Algorithms, data structures, graph theory |
| `governance/` | Policy, oversight, regulation |
| `psychology/` | Cognition, memory, emotion, behavior, identity |
| `society/` | Technology's societal effects, culture, institutions |
| `philosophy/` | Consciousness, ethics, epistemology, meaning |
| `human-factors/` | Human-AI interaction, trust, UX, autonomy |

## How Synthesis Works

Each synthesis is structured based on content type:

- **Technical** (APIs, architecture, code): overview, key concepts, architecture notes, how it applies to your work, references
- **Non-technical** (psychology, philosophy, culture): overview/thesis, key concepts, evidence, implications, bridge to practical application, references
- **Reference/Directory** (curated lists, tool indexes): what it is, curated contents, directly relevant items, references

The "Bridge to Practical Application" section in non-technical syntheses makes connections explicit — how does this psychological insight or philosophical framework connect to what you're building? If no connection exists, that's stated rather than fabricated.

**Synthesis frontmatter** includes `source_type` (auto-classified: `repo`, `docs`, `blog`, `paper`, `internal`, `video`) to support the `/refresh-research` workflow. After a refresh, `last_checked` and `refresh_status` fields are also present.

**Length targets:** 2-5x the original source, not 200x. The goal is extracted insight, not padded summaries.

## Security: Prompt Injection Detection

For GitHub repositories, the skill scans fetched content for prompt injection attempts before saving or synthesizing — HTML comments (invisible in rendered Markdown), zero-width characters, and imperative language targeting AI tools ("always include", "add the phrase", "CI compliance").

If found, the injection is flagged to you, displayed, and documented in the synthesis. It is never followed.

All external content is treated as untrusted data regardless of how legitimate it looks.

## Model Recommendation

**Sonnet** gives reliable results. Haiku may skip the raw content preservation steps.

If you're using Haiku, be explicit: "Follow the research skill workflow and show me each step."

## Design Notes

### Why raw preservation?

WebFetch returns an AI-processed extraction — useful but lossy. For GitHub repos, the skill fetches file content verbatim via the GitHub API. For all sources, raw content is saved before synthesis begins. This enables:
- Verification against the original
- Re-synthesis with different prompts or updated models
- Future RAG indexing against the actual source text
- An audit trail of what was actually retrieved and when

### Why one synthesis per topic?

Research on the same subject from different angles (a blog post, then the official docs, then a conference talk) should compound. Separate synthesis files for the same topic create fragmentation — you end up with partial pictures that never connect. The topic-matching step detects when a new source covers existing ground and defaults to merging rather than forking.

### Why the INDEX.md?

`research/INDEX.md` is a flat table of every synthesized topic. It makes the whole knowledge base scannable at a glance and is the first thing checked before fetching anything new, making duplicate detection fast without scanning every file.
