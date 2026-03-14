---
sidebar_position: 2
title: Secrets & Configuration
---

# Secrets & Configuration

## The Problem

Plugins need external credentials — API keys, personal access tokens, service passwords. As harness-kit grows, the list of potential dependencies grows with it. But harness-kit can't mandate a secrets provider, and hardcoding credentials into config files is a security incident waiting to happen.

The question isn't whether plugins need secrets. It's how to handle that dependency cleanly.

## The Contract: Environment Variables

harness-kit uses environment variables as the universal contract for secrets:

- **Plugins declare** what they need (name, description, whether it's required)
- **Users provide** the value however they prefer — shell profile, `.envrc`, a secrets manager
- **harness-kit validates** that required variables exist before running (it never reads or logs the value)

One-liner: **Plugins declare, users provide, harness-kit validates.**

## Why Environment Variables

Environment variables are the right primitive for secrets:

| Property | Why it matters |
|----------|---------------|
| **Universal** | Every OS, CI system, and container runtime supports them |
| **Provider-agnostic** | 1Password, Google Secret Manager, HashiCorp Vault, direnv — all inject via env vars |
| **Cross-harness compatible** | Claude Code, Copilot, Cursor all read the same environment |
| **Familiar** | 12-factor app methodology; what engineers already expect |

Your secrets infrastructure doesn't change. You just configure which variables to set.

## The `requires.env` Schema

Plugins declare environment requirements in `plugin.json` under `requires.env`:

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "requires": {
    "env": [
      {
        "name": "MY_API_KEY",
        "description": "API key for My Service — used to authenticate requests",
        "required": true,
        "sensitive": true
      },
      {
        "name": "MY_SERVICE_URL",
        "description": "Base URL for My Service — defaults to production if unset",
        "required": false,
        "sensitive": false,
        "when": "Connecting to a non-default My Service endpoint"
      }
    ]
  }
}
```

### Field Reference

| Field | Type | Required | Default | Purpose |
|-------|------|----------|---------|---------|
| `name` | string | yes | — | Env var name (uppercase, underscored) |
| `description` | string | yes | — | One sentence: what it's for and how it's used |
| `required` | boolean | no | `false` | `true` = plugin can't function without it; `false` = graceful degradation |
| `sensitive` | boolean | no | `true` | `true` = secret (token, password); `false` = plain config (URL, flag) |
| `when` | string | no | — | Describes the specific code path that needs this var |

### `required` vs optional

- **`required: true`** — The plugin cannot run without this variable. harness-kit will surface an error before attempting to execute.
- **`required: false`** (default) — The plugin degrades gracefully. The SKILL.md describes what's skipped and what the user can do to enable full functionality.

### `sensitive` vs config

- **`sensitive: true`** (default) — The value is a secret: a token, password, or key. harness-kit treats these as opaque and never logs or displays them.
- **`sensitive: false`** — The value is plain configuration: a URL, feature flag, or numeric setting. Non-sensitive vars can appear in diagnostics.

## Security Principles

Five rules for handling secrets in plugins:

1. **Never store secrets in SKILL.md or plugin.json** — declare the variable name, not the value
2. **Never commit `.env` files** — add them to `.gitignore` and document this in your plugin's README
3. **Least privilege** — declare only the scopes your plugin actually needs. If you only read PRs, don't request write access.
4. **harness-kit never logs values** — validation checks for existence only; the value is never read by the framework
5. **`sensitive: true` suppresses diagnostics** — sensitive vars are excluded from any debug output or status displays

## Future: Dependency Graph

`requires.env` is one dimension of a plugin's dependency contract. The `requires` object is designed to grow:

```json
{
  "requires": {
    "env": [...],
    "tools": ["gh", "python3"],
    "mcp": ["memory-server"],
    "plugins": ["research@>=0.2.0"]
  }
}
```

Each sibling key follows the same pattern: plugins declare, users provide, harness-kit validates. The `requires.env` schema establishes the convention.

## See Also

- [Secrets Management Guide](/docs/guides/secrets-management) — step-by-step setup for plugin authors and users
- [Creating Plugins](/docs/guides/creating-plugins) — how to add `requires.env` to a new plugin
- [Architecture](/docs/getting-started/architecture) — how plugins, skills, and the marketplace fit together
