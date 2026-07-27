# harness-export

Captures your installed harness-kit plugins into a `harness.yaml` file you can share with teammates or commit to your dotfiles.

## Usage

```
/harness-export
/harness-export ~/dotfiles/harness.yaml
```

The skill:
1. Scans the skill directories for all 8 supported targets (`~/.claude/skills/`, `.cursor/skills/`, `.github/skills/`, `.agents/skills/`, `.opencode/skills/`, `.windsurf/skills/`, `.gemini/skills/`, `.junie/skills/`) to detect installed plugins — deduplicating by name
2. Asks which sources the plugins are from and optionally collects a profile name and description
3. Detects harness-generated instruction content in `.cursor/rules/harness.mdc`, `.github/copilot-instructions.md`, and the shared `AGENTS.md` (read by Codex, OpenCode, Windsurf, Gemini CLI, and Junie) and offers to include it
4. Detects MCP servers from every project-level MCP config file (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `opencode.json`, `.gemini/settings.json`, `.junie/mcp/mcp.json` — Codex and Windsurf have no project-level MCP file) and offers to include them
5. Builds entries for each plugin (auto-fills descriptions for known harness-kit plugins)
6. Writes `harness.yaml` to the current directory or a path you specify

## Output Format

```yaml
$schema: https://harnessprotocol.ai/schema/v1/harness.schema.json
version: "1"

metadata:
  name: my-harness
  description: My personal harness configuration.

plugins:
  - name: explain
    source: harnessprotocol/harness-kit
    description: Layered explanations of files, functions, directories, or concepts
```

## Next Steps

After exporting, compile to any of the 8 supported targets:

```
/harness-compile --target all
```

## Sharing Your Config

Commit `harness.yaml` to your dotfiles repo. Teammates can import it with:

```
/harness-import path/to/harness.yaml
```

Or with the shell fallback (no Claude Code required):

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness-restore.sh | bash -s -- harness.yaml
```
