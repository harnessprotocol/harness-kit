---
sidebar_position: 2
title: research
---

# research

Process any source into a structured, compounding knowledge base.

## Components

- **`/research` skill** — the main workflow. Point it at a source, it extracts, preserves, and synthesizes.
- **`rebuild-research-index.py`** — regenerates `research/INDEX.md` from synthesis file frontmatter. Runs automatically after each session; can also be run manually.

## Requirements

- **Claude Code** — required
- **`gh` CLI** ([GitHub CLI](https://cli.github.com/)) — required only for GitHub repository URLs. `GH_TOKEN` declared as optional in `plugin.json` — see [Secrets Management](/docs/guides/secrets-management) for setup.
- **Python 3.10+** — for the index rebuild script (`pip install pyyaml`)

## What It Does

When you invoke `/research` with a source:

1. Checks whether you've already researched this (exact URL match) and whether a synthesis for this topic exists
2. Fetches the content using the appropriate method for the source type
3. Saves the raw content to `resources/` — always, before anything else
4. Creates or updates a synthesis document in `research/[category]/`
5. Cross-references related research you've already done
6. Updates a master index so everything stays discoverable

**Key design principle: one synthesis per topic, many raw sources.** If you research a YouTube video about a tool and then later research that tool's documentation, you get two raw files in `resources/` and one synthesis that incorporates both. Knowledge accumulates rather than sprawls.

## Supported Sources

| Source | Example |
|--------|---------|
| GitHub repository | `github.com/owner/repo` |
| Documentation site | `docs.example.com`, ReadTheDocs |
| Product / marketing site | Company homepages, feature pages |
| Academic paper | arXiv links, PDF URLs |
| Blog post / article | dev.to, Substack, Medium, personal sites |
| Reddit post or thread | Any `reddit.com` link |
| YouTube video | `youtube.com` or `youtu.be` — captures description + transcript |
| Podcast episode | Show notes page — captures notes + any linked transcript |
| Live audio / dictation | Transcript from a dictation tool |
| Local file | PDF, markdown, text, code — any readable format |

## Usage

### Process a single source

```
/research https://example.com/article
/research https://github.com/owner/repo
/research ~/Downloads/paper.pdf
```

### Process multiple sources

```
/research https://url1.com, https://url2.com, /path/to/file.pdf
```

Each source goes through the full workflow sequentially.

### Audit for gaps

```
/research
```

Scans `resources/` and `research/` to find raw files without syntheses, syntheses missing source references, and INDEX.md gaps.

### Rebuild the index manually

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/rebuild-research-index.py"
```

## Output Structure

```
your-project/
├── resources/
│   ├── temporal-docs-2026-03-06.md        # Raw content, preserved verbatim
│   └── temporal-video-2026-03-06.md       # Raw content from YouTube
└── research/
    ├── INDEX.md                           # Master index
    ├── ai-routing/
    │   └── temporal.md                    # One synthesis per topic
    ├── agent-memory/
    │   └── cognee.md
    └── psychology/
        └── identity-continuity.md
```

## Synthesis Categories

Categories are fully customizable — create whatever fits your knowledge domain. The defaults are oriented toward AI/technology research, but you can add `finance/`, `biology/`, `design/`, or anything else.

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

- **Technical** (APIs, architecture, code): overview, key concepts, architecture notes, practical application, references
- **Non-technical** (psychology, philosophy, culture): overview/thesis, key concepts, evidence, implications, bridge to practical application, references
- **Reference/Directory** (curated lists, tool indexes): what it is, curated contents, directly relevant items, references

**Length targets:** 2-5x the original source, not 200x. The goal is extracted insight, not padded summaries.

## Security

For GitHub repositories, the skill scans fetched content for prompt injection attempts — HTML comments, zero-width characters, and imperative language targeting AI tools. If found, the injection is flagged, displayed, and documented in the synthesis. It is never followed.

All external content is treated as untrusted data.

## Model Recommendation

**Sonnet** gives reliable results. Haiku may skip the raw content preservation steps. If using Haiku, be explicit: "Follow the research skill workflow and show me each step."

## Design Notes

### Why raw preservation?

WebFetch returns an AI-processed extraction — useful but lossy. For GitHub repos, the skill fetches file content verbatim via the GitHub API. For all sources, raw content is saved before synthesis begins. This enables verification against the original, re-synthesis with different prompts, future RAG indexing, and an audit trail.

### Why one synthesis per topic?

Research on the same subject from different angles should compound. Separate synthesis files create fragmentation. The topic-matching step detects when a new source covers existing ground and defaults to merging rather than forking.

### Why the INDEX.md?

`research/INDEX.md` is a flat table of every synthesized topic. It makes the whole knowledge base scannable at a glance and is the first thing checked before fetching anything new — fast duplicate detection without scanning every file.
