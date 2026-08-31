# The unit of comparison is the install surface, not the product

Each column in the comparison grid is a surface: an installation form with its own config store. This splits products the old TargetPlatform model merged (Claude Code vs Claude Desktop; Copilot in VS Code vs Copilot CLI) and merges installs the model would have split (the ChatGPT desktop app, Codex CLI, and Codex IDE extension share `~/.codex/config.toml`, so they are one surface). Chosen over one-column-per-product because drift is real between a product's surfaces — the same person's Claude Code and Claude Desktop routinely disagree about MCP servers — and hiding that would hide exactly what the grid exists to show.

## Consequences

- The `TargetPlatform` type and capability matrix re-key from product to surface; adapters may serve multiple surfaces (claude-code adapter → claude-code and claude-desktop surfaces) or one surface may absorb several products' clients (codex).
- Columns group visually by product family so the grid stays scannable.

Decided 2026-08-31 during the cross-harness config management design session.
