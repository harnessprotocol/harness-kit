---
name: harness-import
description: Use when user invokes /harness-import or wants to install plugins from a shared harness.yaml config file. Reads the config, presents each plugin interactively, and generates the Claude Code install commands for the ones the user selects. Handles both Harness Protocol v1 format (version: "1") and the legacy format (version: 1).
---

# Import a Harness Configuration

You are helping the user install plugins from a `harness.yaml` file — either all of them or a subset they choose.

This skill handles both format versions:
- **v1 protocol format** (`version: "1"` string) — uses `source: owner/repo` per plugin, may include `mcp-servers`, `env`, and `instructions` sections
- **Legacy format** (`version: 1` integer) — uses `marketplace: key` per plugin with a `marketplaces:` section

## Workflow Order (MANDATORY)

**Follow these steps in order. Do not skip any step.**

---

### Step 1: Find and read the config

Check for `harness.yaml` in this order:
1. A path provided by the user after `/harness-import` (e.g., `/harness-import ~/dotfiles/harness.yaml`)
2. `./harness.yaml` in the current directory

If no file is found at either location, tell the user:
> "No `harness.yaml` found. Get one from a teammate or generate your own with `/harness-export`."

Read and parse the file. Detect which format version it uses:
- `version: "1"` (string) → **Protocol v1 format**
- `version: 1` (integer) → **Legacy format**

---

### Step 2: Show what's available

Display the plugin list clearly before asking anything:

```
Plugins in this config:

  1. explain (siracusa5/harness-kit) — Layered explanations of files, functions, directories, or concepts
  2. research (siracusa5/harness-kit) — Process any source into a structured, compounding knowledge base
  3. superpowers (obra/superpowers-marketplace) — Structured dev workflows — TDD, systematic debugging, subagent delegation
```

For legacy format, resolve the `source` by looking up `plugins[].marketplace` → `marketplaces[key]`.

Then, if the file contains any of the following sections, mention them briefly:
- `mcp-servers:` — "This config also declares MCP servers. I'll ask about those after plugins."
- `env:` — "This config declares environment variables. I'll surface those after plugins."
- `instructions:` — "This config includes harness instructions. I'll offer to apply those after plugins."

Then ask:
> "Would you like to install all of these, pick a subset, or get more details on any before deciding?"

---

### Step 3: Handle the user's choice

**"All"** — mark all plugins as selected, skip to Step 5.

**"Details"** — for each plugin the user asks about, explain what it does based on its description. You can supplement with your knowledge of harness-kit plugins. Then return to this question.

**"Pick" or "subset"** — proceed to Step 4.

---

### Step 4: Individual selection

Walk through each plugin one at a time:

> "**explain** — Layered explanations of files, functions, directories, or concepts. Include? (yes/no)"

Wait for the answer before moving to the next plugin. Collect the selection list.

After all plugins: "Got it — you've selected: [list]. Ready to generate the install commands?"

---

### Step 5: Generate install commands

Output the complete Claude Code command sequence. **Marketplace adds come first, plugin installs second.**

For **protocol v1 format** (`source: owner/repo`), derive marketplace info from the `source` field:

```
Run these in Claude Code:

/plugin marketplace add harnessprotocol/harness-kit
/plugin marketplace add obra/superpowers-marketplace

/plugin install explain@harness-kit
/plugin install superpowers@obra
```

The marketplace short name to use in `/plugin install` commands is the **repo name** (last segment of `owner/repo`). Example: `harnessprotocol/harness-kit` → short name `harness-kit`.

For **legacy format** (`marketplace: key` + `marketplaces:` section), resolve as before:
- `marketplace: harness-kit` + `marketplaces.harness-kit: harnessprotocol/harness-kit` → `/plugin marketplace add harnessprotocol/harness-kit`

Only include marketplaces for plugins actually selected.

Close with:
> "Paste these into Claude Code and run them in order. Restart Claude Code after the installs complete."

---

### Step 6: Handle MCP servers (if present)

If the config has a `mcp-servers:` section, walk through each server:

> "This config declares an MCP server: **postgres** (stdio, `uvx mcp-server-postgres`). Would you like me to add this to your `.mcp.json`?"

If yes, write or update `.mcp.json` in the current directory with the server definition.

If the server command contains `${VAR}` references, note which env vars are needed (the `env:` section will cover them in Step 7).

---

### Step 7: Surface env declarations (if present)

If the config has an `env:` section, display them clearly:

```
Environment variables required by this harness:

  DB_CONNECTION_STRING (required, sensitive) — PostgreSQL connection string for the project database.
  ANALYTICS_API_KEY (optional, sensitive) — API key for the analytics MCP server.
```

Tell the user:
> "These environment variables need to be set before using the MCP servers or skills that depend on them. Set them in your shell profile, `.env` file, or secret manager."

Do NOT ask for the values — sensitive vars must never be stored in the harness file or conversation.

---

### Step 8: Offer to apply instructions (if present)

If the config has an `instructions:` section and `import-mode: merge` (or if import-mode is absent, default to merge), offer:

> "This config includes harness instructions (operational guidance for the AI). Would you like me to append them to your `CLAUDE.md` or `AGENT.md`?"

If yes, append to the file the user specifies. If `import-mode: replace` is set, warn:
> "This config requests full replacement of existing instructions. That will overwrite your current CLAUDE.md/AGENT.md. Are you sure?"

---

### Step 9: Offer shell fallback

After all the above, add:

> "If you'd rather install without Claude Code, use the shell script:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/harnessprotocol/harness-kit/main/harness-restore.sh | bash -s -- harness.yaml
> ```
> This installs skill files directly (no scripts or hooks — those require the marketplace install)."

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Including marketplaces for plugins the user didn't select | Only add `marketplace add` lines for marketplaces that have at least one selected plugin |
| Forgetting to explain the `@name` convention | The `@name` in `/plugin install` must match the marketplace short name (repo name), not the owner |
| Skipping the marketplace add commands | They must come before the plugin installs, or the installs will fail |
| Ignoring `mcp-servers`, `env`, `instructions` sections | Always check for these sections and handle them in the appropriate steps |
| Prompting the user for sensitive env var values | Never ask for secret values — just tell the user which vars to set and where |
