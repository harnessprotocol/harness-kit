---
sidebar_position: 2
title: Secrets Management
---

# Secrets Management

Practical guide for plugin authors declaring environment requirements and users supplying them.

## For Plugin Authors

### Declare environment requirements

Add a `requires.env` array to your `plugin.json`. Each entry names one environment variable your plugin depends on:

```json
{
  "name": "my-plugin",
  "description": "Does something useful",
  "version": "0.1.0",
  "requires": {
    "env": [
      {
        "name": "MY_API_KEY",
        "description": "API key for My Service — used to authenticate fetch requests",
        "required": true,
        "sensitive": true
      }
    ]
  }
}
```

### Field reference

| Field | Required | Default | Use |
|-------|----------|---------|-----|
| `name` | yes | — | Env var name — uppercase, underscored |
| `description` | yes | — | One sentence: what it's for, how it's used |
| `required` | no | `false` | `true` blocks execution; `false` degrades gracefully |
| `sensitive` | no | `true` | `false` for non-secret config (URLs, flags) |
| `when` | no | — | Describe the conditional code path |

### `required: true` vs `false`

Use `required: true` only when the plugin fundamentally cannot run without the variable — nothing works, not even partially. For most optional integrations (e.g., GitHub fetching when the user might be working with local files), use `required: false`.

**`required: true` example:** An API key for a service that's the plugin's entire purpose.

**`required: false` example:** `GH_TOKEN` for a research plugin where GitHub is one of many source types. Without it, the plugin still works for URLs, local files, YouTube, etc.

### `sensitive: false` for config values

If the variable is a non-secret configuration value — a service URL, a feature flag, a numeric threshold — set `sensitive: false`. This allows the value to appear in diagnostic output, making it easier to debug misconfiguration:

```json
{
  "name": "MY_SERVICE_URL",
  "description": "Base URL for My Service — use to point at a staging environment",
  "required": false,
  "sensitive": false,
  "when": "Connecting to a non-production My Service endpoint"
}
```

### Graceful degradation in SKILL.md

For optional variables, your SKILL.md should describe what happens when they're absent:

```markdown
## Requirements

- `MY_API_KEY` (optional) — enables X feature. Without it, the skill will Y instead.
  Set up with: `export MY_API_KEY=your-key-here`
```

Don't silently skip functionality — tell the user what's missing and how to enable it.

---

## For Users

### Check what a plugin needs

Look at the plugin's `plugin.json` under `requires.env`, or check the plugin's documentation page on this site. The requirements table on each plugin page lists what's needed and when.

### 5 ways to set environment variables

Pick the method that fits your workflow:

#### 1. Shell profile (simplest, always available)

Add to `~/.zshrc` or `~/.bashrc`:

```bash
export GH_TOKEN=ghp_yourtoken
```

Reload your shell or run `source ~/.zshrc`. The variable is available in every terminal session.

**Tradeoff:** Tokens persist in your shell config file. Keep it out of version control.

#### 2. direnv (per-project, automatic)

Install [direnv](https://direnv.net), then create `.envrc` in your project root:

```bash
export GH_TOKEN=ghp_yourtoken
```

Run `direnv allow`. The variable loads automatically when you `cd` into the project and unloads when you leave.

Add `.envrc` to `.gitignore` — never commit it.

#### 3. 1Password CLI

If you use 1Password, inject secrets at shell startup:

```bash
# In ~/.zshrc
export GH_TOKEN=$(op read "op://Private/GitHub Token/password" 2>/dev/null)
```

Or use `op run` to inject into a single command:

```bash
op run --env-file=.env -- claude
```

#### 4. Google Secret Manager

```bash
export GH_TOKEN=$(gcloud secrets versions access latest --secret=gh-token)
```

Add this to your shell profile or a startup script.

#### 5. CI / GitHub Actions

Add the secret in your repo settings under **Settings → Secrets and variables → Actions**, then reference it in your workflow:

```yaml
env:
  GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

The variable is available to all steps in the job.

### What happens when a variable is missing

| Situation | Behavior |
|-----------|----------|
| `required: true`, variable unset | Error before execution — plugin surfaces a clear message telling you which variable to set |
| `required: false`, variable unset | Plugin continues with degraded functionality — the SKILL.md describes what's skipped |
| `sensitive: false`, variable unset | Same as above; non-sensitive vars may also appear in diagnostic output |

---

## Cross-Harness Notes

Environment variables work the same across all tools in your harness:

- **Claude Code** — reads your shell environment directly
- **VS Code Copilot** — reads the environment of the shell that launched VS Code
- **Cursor** — same as Copilot
- **MCP servers** — servers listed in `.mcp.json` also read env vars; the same `GH_TOKEN` you set for plugins is available to any MCP server that needs it

Set the variable once in your shell profile and it's available everywhere.
