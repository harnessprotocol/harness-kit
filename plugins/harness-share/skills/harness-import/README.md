# harness-import

Imports plugins from a shared `harness.yaml` config file. Presents each plugin interactively so you can install all of them or pick a subset.

## Usage

```
/harness-import
/harness-import path/to/harness.yaml
```

Without an argument, looks for `harness.yaml` in the current directory.

## What It Does

1. Reads the config and shows the available plugins with descriptions
2. Asks how you want to proceed — all, pick individually, or get more details first
3. Generates the complete Claude Code install command sequence for your selection

If Cursor or GitHub Copilot are detected in the project, it also offers to set them up: copying skill files, writing MCP server configs, and compiling instructions to each tool's native format — all from the same `harness.yaml`.

## Example Output

```
Run these in Claude Code:

/plugin marketplace add harnessprotocol/harness-kit
/plugin install explain@harness-kit
/plugin install research@harness-kit
```

If other AI tools are detected, a cross-platform setup report is printed after all steps. MCP configs declared in `harness.yaml` are also written to each platform's config file (`.cursor/mcp.json`, `.vscode/mcp.json`):

```
Cross-platform setup complete:

  Cursor:
    Skills:       explain, research  (.cursor/skills/)
    MCP:          postgres  (.cursor/mcp.json)
    Instructions: harness.mdc (operational), behavioral.mdc (behavioral)

  GitHub Copilot:
    Skills:       explain, research  (.github/skills/)
    MCP:          (none declared in harness.yaml)
    Instructions: copilot-instructions.md (operational)
```

## Shell Alternative

If you don't have Claude Code, use `harness-restore.sh` instead:

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness-restore.sh | bash -s -- harness.yaml
```

This downloads skill files directly (skills only — no scripts or hooks).
