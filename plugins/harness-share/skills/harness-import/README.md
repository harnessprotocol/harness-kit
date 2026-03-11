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

## Example Output

```
Run these in Claude Code:

/plugin marketplace add harnessprotocol/harness-kit
/plugin install explain@harness-kit
/plugin install research@harness-kit
```

## Shell Alternative

If you don't have Claude Code, use `harness-restore.sh` instead:

```bash
curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness-restore.sh | bash -s -- harness.yaml
```

This downloads skill files directly (skills only — no scripts or hooks).
