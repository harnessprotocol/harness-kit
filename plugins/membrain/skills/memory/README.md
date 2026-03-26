# memory

Search, trace, and manage your [membrain](https://github.com/siracusa5/membrain) knowledge graph from Claude Code.

## Prerequisites

```bash
go install github.com/siracusa5/membrain/cmd/mem@latest
```

## Usage

```
/memory search <topic>       search entities in the knowledge graph
/memory trace <query>        BFS traversal — shows how concepts connect
/memory add <entity> <obs>   add an observation to an existing entity
/memory episode <text>       capture a session as a timestamped episode
/memory status               graph health: entity/relation counts, server status
```

## Examples

```
/memory search authentication
/memory trace "Claude Code"
/memory add "auth-service" "now uses PKCE for all OAuth flows"
/memory episode "Completed membrain MCP integration — 11 graph tools now connected"
/memory status
```

## How it Works

`/memory search` and `/memory add` and `/memory episode` use the membrain MCP server (`mem mcp`) — they work without a running HTTP server.

`/memory trace` and `/memory status` also call the membrain HTTP server (`mem serve`) at `localhost:3131` for richer output.

## Graceful Degradation

If the membrain MCP tools are not connected, the skill prints install and configuration instructions. The HTTP-dependent subcommands (`trace`, `status`) fall back gracefully when the server is not running.

## Desktop UI

When the HTTP server is running (`mem serve`), the full membrain UI is available at `http://localhost:3131`. In the harness-kit desktop app, it appears as the **Memory** section with full sub-page navigation.
