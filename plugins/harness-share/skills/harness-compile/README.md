# harness-compile

Compiles a `harness.yaml` into native config files for Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini CLI, and Junie. One source file, all your tools.

## Usage

```
/harness-compile
/harness-compile path/to/harness.yaml
/harness-compile --target cursor,windsurf
/harness-compile --target all
/harness-compile --dry-run
/harness-compile --clean
```

Without an argument, looks for `harness.yaml` in the current directory.

## What It Does

1. Finds and parses your `harness.yaml`
2. Detects which AI tools are present in the project (or accepts `--target` to skip detection)
3. Compiles instruction slots to each tool's native file format — Codex, OpenCode, Windsurf, Gemini CLI, and Junie all share one `AGENTS.md`, written once even when several of them are selected
4. Writes MCP server configs for each target (Codex and Windsurf are skipped — both use global, not project-level, MCP config)
5. Copies installed skills to each target's skill directory
6. Writes permissions to `.claude/settings.json` (Claude Code) or instruction text (every other target)
7. Prints a compilation report

## Flags

| Flag | Description |
|------|-------------|
| `--target <tools>` | Comma-separated targets: `claude-code`, `cursor`, `copilot`, `codex`, `opencode`, `windsurf`, `gemini`, `junie`, or `all` |
| `--dry-run` | Preview all output without writing any files |
| `--clean` | Remove orphaned marker blocks from prior harness profiles |
| `--verbose` | Show skipped slots and extra detail in the compilation report |

## Output Files

| Harness slot | Claude Code | Cursor | Copilot | Codex / OpenCode / Windsurf / Gemini / Junie |
|---|---|---|---|---|
| `operational` | `CLAUDE.md` | `.cursor/rules/harness.mdc` | `.github/copilot-instructions.md` | `AGENTS.md` (shared) |
| `behavioral` | `AGENT.md` | `.cursor/rules/behavioral.mdc` | `.github/instructions/behavioral.instructions.md` | (omitted) |
| `identity` | `SOUL.md` | (omitted) | (omitted) | (omitted) |
| MCP servers | `.mcp.json` | `.cursor/mcp.json` | `.vscode/mcp.json` | `opencode.json` / (skipped) / (skipped) / `.gemini/settings.json` / `.junie/mcp/mcp.json` |
| Permissions | `.claude/settings.json` | instruction text | instruction text | instruction text (in `AGENTS.md`) |

Codex and Windsurf don't get a project-level MCP file — Codex uses `~/.codex/config.toml`, Windsurf uses a global config. Both print a warning instead of a file being written.

## Merge Safety

Generated content is wrapped in section markers so re-compilation only updates the harness-managed sections — your manual customizations outside the markers are never touched:

```
<!-- BEGIN harness:my-harness:operational -->
...generated content updated on every compile...
<!-- END harness:my-harness:operational -->
```

The `{name}` in markers comes from `metadata.name` in your harness.yaml (defaults to `default`).

## Import Modes

Control how the compiler handles existing files via `instructions.import-mode` in your harness.yaml:

| Mode | Behavior |
|------|----------|
| `merge` (default) | Append marker block at end of file; update only between markers on re-compile |
| `replace` | Overwrite entire file with generated content (requires confirmation) |
| `skip` | Do not write or modify this slot's file |

## Example Output

```
Compiled harness: data-engineer (v1.2.0)
Targets: claude-code, cursor

  CLAUDE.md                        operational   merge    48 lines added
  AGENT.md                         behavioral    merge    12 lines added
  .mcp.json                        mcp-servers   ——       2 servers
  .claude/settings.json            permissions   ——       4 allowed, 1 denied
  .cursor/rules/harness.mdc        operational   merge    48 lines added
  .cursor/rules/behavioral.mdc     behavioral    merge    12 lines added
  .cursor/mcp.json                 mcp-servers   ——       2 servers

  Warnings:
    permissions.tools.deny is not machine-enforceable for target 'cursor'.
```

## Permissions

Claude Code permissions compile to `.claude/settings.json` with `allow`, `deny`, and `additionalDirectories` keys — fully machine-enforced.

Every other target (Cursor, Copilot, Codex, OpenCode, Windsurf, Gemini CLI, Junie) does not support machine-enforceable permissions. The compiler injects a human-readable permission description into that target's operational instructions file and prints a warning.

## Related Skills

- `/harness-validate` — validate a harness.yaml before compiling
- `/harness-export` — generate a harness.yaml from your current setup
- `/harness-import` — install plugins from a harness.yaml
