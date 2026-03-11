# harness-export

Captures your installed harness-kit plugins into a `harness.yaml` file you can share with teammates or commit to your dotfiles.

## Usage

```
/harness-export
/harness-export ~/dotfiles/harness.yaml
```

The skill:
1. Reads `~/.claude/skills/` to detect installed plugins
2. Asks which marketplaces you've added
3. Builds entries for each plugin (auto-fills descriptions for known harness-kit plugins)
4. Writes `harness.yaml` to the current directory or a path you specify

## Output Format

```yaml
version: 1

marketplaces:
  harness-kit: harnessprotocol/harness-kit

plugins:
  - name: explain
    marketplace: harness-kit
    description: Layered explanations of files, functions, directories, or concepts
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
