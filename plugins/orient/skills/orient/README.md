# Orient Plugin

A Claude Code plugin for topic-focused session orientation. Search your knowledge graph, knowledge files, journal entries, and research index for a specific topic — get only what's relevant instead of loading everything.

## What It Does

When you invoke `/orient`, the skill:

1. Parses your input into topic keywords, entity types, and/or time qualifiers
2. Searches the MCP Memory Server graph for matching entities (if connected)
3. Scans knowledge files and journal entries for relevant sections
4. Checks the research index for related materials
5. Produces a focused briefing with suggested follow-up queries

## Output Structure

Every briefing includes relevant sections from:

| Section | What it covers |
|---------|---------------|
| **Graph** | Matching entities from MCP Memory Server with top observations |
| **Knowledge** | Relevant excerpts from knowledge files (section-level, not full files) |
| **Journal** | Matching entries from journal files |
| **Research** | Listed research files (not read — offered for follow-up) |
| **Suggested Queries** | Follow-up graph queries to go deeper |

Empty sections are omitted automatically.

## Usage

### Orient on a topic

```
/orient membrain
/orient data engineering
```

Searches graph, knowledge, and research for everything related to the topic.

### Orient on entity types

```
/orient desires
/orient desires and tensions
```

Searches the graph for specific entity types (Desire, Tension, Evidence, Project, etc.).

### Orient on recent activity

```
/orient recent
/orient recent evidence
/orient last week
```

Shows recent journal entries, optionally filtered to a specific topic.

### Compound queries

```
/orient recent membrain
/orient the streaming migration project
```

Combines time qualifiers and topic keywords for targeted results.

## Graceful Degradation

If MCP Memory Server is not connected, the graph section is skipped and noted. Knowledge files and research still work — you always get something useful.

## Scope Controls

The skill enforces strict limits to keep orientation fast and focused:

- Max 3 `search_nodes` calls, 2 `open_nodes` calls
- Max 10 graph entities shown, 3 observations each
- Max 3 knowledge files read, 3 journal entries
- Max 5 research entries listed (not read)
- If >15 graph results, asks you to narrow the query

**Requirements:** Optional — [MCP Memory Server](https://github.com/anthropics/claude-code-memory) for graph search. Works without it using knowledge files and research index only.

**Note:** This plugin assumes a specific project structure (`knowledge/`, `knowledge/journal/`, `research/INDEX.md`) and MCP Memory Server entity types (Desire, Tension, Evidence, etc.). Fork and adapt the SKILL.md if your project uses different conventions.

## Design Notes

### Why topic-focused?

Session orientation is all-or-nothing — you either load the general context or manually query specific things. `/orient` fills the gap: say `/orient membrain` and get only what's relevant to membrain across all knowledge sources.

### Why conversation output?

Same rationale as `/explain` — most of the time you want quick context, not a document. If you want to save the briefing, just ask.

### Why strict caps?

Orientation should be fast. Dumping 50 graph entities defeats the purpose. The caps keep output between ~800-2000 tokens — enough to orient, not enough to overwhelm.
