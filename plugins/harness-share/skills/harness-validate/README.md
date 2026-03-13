# harness-validate

Validates a `harness.yaml` file against the Harness Protocol v1 JSON Schema. Reports errors with field paths and fix suggestions.

## Usage

```
/harness-validate
/harness-validate path/to/harness.yaml
```

Without an argument, looks for `harness.yaml` in the current directory.

## What It Does

1. Finds the harness file (argument path or `./harness.yaml`)
2. Installs validation dependencies in a temporary venv (`jsonschema`, `pyyaml`)
3. Fetches the Harness Protocol v1 JSON Schema from GitHub
4. Runs full schema validation against the file
5. Reports PASS/FAIL with field paths and suggested fixes

If the schema cannot be fetched, falls back to basic offline checks (version, metadata.name).

## Common Errors

| Error | Fix |
|-------|-----|
| `version` must be string `"1"` | Change `version: 1` to `version: "1"` |
| `source` is not a valid property | Replace `marketplace: key` with `source: owner/repo` |
| `default` not allowed when `sensitive: true` | Remove the `default` value |
| `metadata.name` is required | Add a `metadata.name` field |
| Unknown additional property | Check for typos in field names |

## When to Use

- Before sharing a `harness.yaml` with others
- After manually editing a harness file
- Before running `/harness-compile` on an untested config
