---
title: Memory
---

# Memory

An AI coding agent with no persistent memory resets every session. It can't recall the decisions made last week, the system you explained three weeks ago, or the tension you've been working through for a month. You end up re-explaining your codebase instead of building on it.

Memory makes your agent cumulative — each session adds to a knowledge graph that shapes every session after it.

## How it works in harness-kit

harness-kit's memory layer is built on [membrain](https://github.com/siracusa5/membrain): a graph-based memory system that exposes an MCP server. When `mem mcp` is connected to Claude Code, the agent gets direct read/write access to a persistent knowledge graph — 11 graph tools and 2 semantic tools, available in every session.

Because it's delivered as an MCP server, memory works across harnesses. Any AI coding tool that supports MCP (Claude Code, Cursor, Windsurf, and more) can connect to the same graph. Configure it once in `membrain.yaml`; carry it to every tool.

## Graph-based vs. flat memory

Most memory systems store facts: `User prefers Go. User works on membrain.` membrain stores a graph: entities with typed relationships, observations timestamped over time, and episodes that capture what happened and when.

| Flat memory | Graph memory |
|-------------|-------------|
| Key-value or vector store | Entities with typed relations |
| Facts retrieved individually | Connected context retrieved via traversal |
| No sense of time | Episodes with timestamps, date-range filtering |
| Contradictions silently overwrite | `contradicts` is a first-class relation type |
| Fixed schema | Typed ontology you define in `membrain.yaml` |

The difference matters when your codebase evolves: a graph can represent that your auth service *used to* use one approach but was *changed* because of a specific decision — and link that decision to the ticket, the person, and the date.

## What the MCP server exposes

membrain registers tools and resources your agent can call directly during any session.

**Graph tools (always on):**

| Tool | What it does |
|------|-------------|
| `create_entities` | Add new entities to the graph |
| `create_relations` | Add typed relations between entities |
| `add_observations` | Append timestamped observations to an entity |
| `add_episode` | Create a timestamped episode; auto-links to mentioned entities |
| `open_nodes` | Fetch specific entities by exact name |
| `search_nodes` | Substring search across names, types, and observations; supports date range filtering |
| `read_graph` | Return the full graph (JSON or compact SGN format) |
| `suggest_entities` | Heuristic entity extraction from raw text — suggests, doesn't create |
| `delete_entities` | Remove entities and cascade-delete their relations |
| `delete_observations` | Remove specific observations from an entity |
| `delete_relations` | Remove specific relations |

**Semantic tools (require vector config):**

| Tool | What it does |
|------|-------------|
| `search_research` | Semantic search over indexed knowledge files via embeddings |
| `suggest_merges` | Find near-duplicate entities by name similarity — surfaces dedup candidates |

**Resources (always on):**

| Resource | What it provides |
|----------|----------------|
| `membrain://profile` | Mission, directives, disposition, and named context profiles from `membrain.yaml` |
| `membrain://recent` | The 10 most recently modified entities |

## Token efficiency

A naive memory implementation dumps the entire graph into every context window. membrain's `search_nodes` and `open_nodes` return a `_membrain.retrievalStats` block alongside results — showing exactly how many tokens were retrieved vs. what a full dump would have cost and the percentage saved. On a mature graph this typically saves 80–95% of context overhead per query.

## Getting started

See the [membrain plugin page](/docs/plugins/research-knowledge/membrain) for install instructions, setup, and the `/memory` skill reference.

See the [membrain repository](https://github.com/siracusa5/membrain) for `membrain.yaml` configuration, schema design, vector setup, and internals.
