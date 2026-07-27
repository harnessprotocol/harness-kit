---
name: harness-compile
description: Use when user invokes /harness-compile or wants to compile a harness.yaml into native config files for Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini CLI, or JetBrains Junie. Generates CLAUDE.md, AGENT.md, .mcp.json, .cursor/rules/, .vscode/mcp.json, AGENTS.md, and related files from a single harness.yaml source. Supports --target, --dry-run, and --clean flags.
disable-model-invocation: true
---

# Compile a Harness Configuration

You are compiling a `harness.yaml` file into native configuration files for one or more AI coding tools. Each target tool gets its own idiomatic output: instruction files, MCP server configs, skill files, and permission settings.

This skill implements the Harness Protocol compiler mapping defined at harnessprotocol.ai. The output is deterministic — the same `harness.yaml` always produces the same files.

**The 8 supported targets:** `claude-code`, `cursor`, `copilot`, `codex`, `opencode`, `windsurf`, `gemini`, `junie`. The last five (Codex, OpenCode, Windsurf, Gemini CLI, Junie) all read operational instructions from a single shared `AGENTS.md` file at the project root — see Step 3 for how that sharing works.

## Workflow Order (MANDATORY)

**Follow these steps in order. Do not skip any step.**

---

### Step 1: Find harness.yaml

Check for the harness file in this order:
1. A path provided by the user after `/harness-compile` (e.g., `/harness-compile ~/dotfiles/harness.yaml`)
2. `./harness.yaml` in the current directory

If no file is found at either location, tell the user:
> "No `harness.yaml` found. Specify a path: `/harness-compile path/to/harness.yaml`"

Read and parse the file. Extract `metadata.name` (use `default` if absent). Extract `version` to confirm v1 format. Note the `instructions.import-mode` value (default: `merge` if not specified).

If `version` is absent, is the integer `1` (legacy format), or is any value other than the string `"1"`, stop and tell the user: "This harness.yaml uses an unsupported format. Run `/harness-validate` to check the file and see upgrade instructions."

Also check for any flags the user passed:
- `--target <targets>` — comma-separated subset of `claude-code`, `cursor`, `copilot`, `codex`, `opencode`, `windsurf`, `gemini`, `junie`, or `all` for every target
- `--dry-run` — preview output without writing any files
- `--clean` — remove orphaned marker blocks in addition to current update
- `--verbose` — show skipped slots and extra detail in the compilation report

---

### Step 2: Platform detection

If `--target` was provided, skip interactive detection and use those targets directly. `all` means compile for all 8 targets listed above.

Otherwise, scan the working directory for platform indicators:

**Claude Code** is present if any of these exist: `CLAUDE.md`, `.claude/`, `.mcp.json`
**Cursor** is present if any of these exist: `.cursor/`, `.cursor/rules/`, `.cursor/mcp.json`, `.cursor/skills/`
**Copilot** is present if any of these exist: `.github/`, `.vscode/mcp.json`, `.github/skills/`
**Codex** is present if `.codex/` exists
**OpenCode** is present if `opencode.json` or `.opencode/` exists
**Windsurf** is present if `.windsurf/` exists
**Gemini CLI** is present if `.gemini/` exists
**Junie** is present if `.junie/` exists

**`AGENTS.md` alone is an ambiguous signal, not a confident one.** It's the shared instruction file for Codex, OpenCode, Windsurf, Gemini CLI, and Junie (and Cursor/Copilot read it too, though they have their own richer conventions) — its presence alone doesn't tell you which of those tools is actually in use. If a project has `AGENTS.md` but none of the tool-specific indicators above, ask which of that family the user actually uses rather than guessing or offering all five:
> "I found an `AGENTS.md` file but no tool-specific directory (`.codex/`, `.opencode/`, `.windsurf/`, `.gemini/`, `.junie/`). Which of these are you using?"

**Never assume a platform is present.** Detect each independently. If `.github/` is the only Copilot indicator, ask the user: "I found a `.github/` directory but no other Copilot indicators. Are you using GitHub Copilot in this project?"

Present the detected platforms as a multi-select and ask the user to confirm or adjust:

> "I detected these targets in your project:
>   [x] Claude Code (found: CLAUDE.md, .claude/)
>   [x] Cursor (found: .cursor/)
>   [ ] Copilot (not detected)
>   [x] Windsurf (found: .windsurf/, AGENTS.md)
>
> Which targets should I compile for? (Confirm, add, or remove any.)"

Wait for confirmation before proceeding. If no platforms are detected, ask:
> "No AI tool config directories found. Which targets should I compile for? (claude-code, cursor, copilot, codex, opencode, windsurf, gemini, junie)"

---

### Step 3: Compile instructions

For each confirmed target, write the instruction slots using this mapping:

| Harness slot | Claude Code | Cursor | Copilot | Codex / OpenCode / Windsurf / Gemini / Junie |
|---|---|---|---|---|
| `instructions.operational` | `CLAUDE.md` | `.cursor/rules/harness.mdc` | `.github/copilot-instructions.md` | `AGENTS.md` |
| `instructions.behavioral` | `AGENT.md` | `.cursor/rules/behavioral.mdc` | `.github/instructions/behavioral.instructions.md` | (omit — not supported) |
| `instructions.identity` | `SOUL.md` | (omit — not supported) | (omit — not supported) | (omit — not supported) |

**The shared `AGENTS.md` file — write it once, not per-target.** Codex, OpenCode, Windsurf, Gemini CLI, and Junie all map the `operational` slot to the exact same path, `AGENTS.md`. When two or more of them are confirmed targets, generate the operational content **once** and write **one** `AGENTS.md` — do not write it multiple times or produce per-target variants; the content is identical for all five, so a second or third write would just be a redundant no-op diff. Only `operational` is supported for this family — `behavioral` and `identity` have no equivalent file for any of these five tools and must be omitted, exactly as for Cursor's and Copilot's unsupported slots.

**Section markers (exact format — do not deviate):**

Every generated block must be wrapped in markers. The `{name}` value is `metadata.name` from harness.yaml, or `default` if absent. The `{slot}` value is `operational`, `behavioral`, or `identity`.

```
<!-- BEGIN harness:{name}:{slot} -->
...generated content...
<!-- END harness:{name}:{slot} -->
```

Example with `metadata.name: data-engineer` and slot `operational`:
```
<!-- BEGIN harness:data-engineer:operational -->
## Commands
- Build: `dbt run`
<!-- END harness:data-engineer:operational -->
```

**Import-mode behavior:**

- **`merge`** (default): If the target file already exists and contains matching markers, update only the content between those markers. If no markers exist yet, append the marker block at the end of the file (creating the file if it does not exist).
- **`replace`**: Warn the user that existing content will be overwritten and require explicit confirmation before proceeding:
  > "Warning: import-mode 'replace' will overwrite `CLAUDE.md`.
  > Existing content (42 lines) will be replaced with generated content.
  > Your manual customizations outside the markers will be lost.
  >
  > Proceed? [y/N]"
  After confirmation, write the generated content wrapped in markers as the entire file. Skip the confirmation prompt on re-compilation if the file already contains only harness marker blocks.
- **`skip`**: Do not write or modify this slot's file at all. Leave it untouched.

**Cursor `.mdc` frontmatter (mandatory):**

Cursor rules files require YAML frontmatter. Always prepend this block before the instruction content for `.cursor/rules/harness.mdc` (operational slot):

```
---
description: Harness operational instructions
globs: **/*
alwaysApply: true
---
```

For `.cursor/rules/behavioral.mdc` (behavioral slot):

```
---
description: Harness behavioral preferences
globs: **/*
alwaysApply: true
---
```

The frontmatter goes before the `<!-- BEGIN ... -->` marker block.

**Copilot `.instructions.md` frontmatter:**

Copilot instructions files require YAML frontmatter. Always prepend this block:

```
---
applyTo: "**"
---
```

The frontmatter goes before the `<!-- BEGIN ... -->` marker block.

**`AGENTS.md` gets no frontmatter.** Unlike Cursor's `.mdc` and Copilot's `.instructions.md` files, `AGENTS.md` is plain markdown with no YAML header of any kind — the marker block goes straight into the file with nothing prepended.

**Directory creation:** Create parent directories before writing if they don't exist (`.cursor/rules/`, `.github/instructions/`). `AGENTS.md` lives at the project root, so no directory creation is needed for it.

---

### Step 4: Compile MCP servers

If the harness has a `mcp-servers:` section, write MCP JSON config files for each confirmed target.

| Target | File path |
|---|---|
| Claude Code | `.mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Copilot / VS Code | `.vscode/mcp.json` |
| OpenCode | `opencode.json` |
| Gemini CLI | `.gemini/settings.json` |
| Junie | `.junie/mcp/mcp.json` |
| Codex | (skipped — see below) |
| Windsurf | (skipped — see below) |

All project-level MCP files use identical JSON structure. Translate from harness YAML:
- YAML key `transport` → JSON key `type`
- Omit any harness-specific YAML keys that have no MCP JSON equivalent

```json
{
  "mcpServers": {
    "postgres": {
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-server-postgres", "--connection-string", "${DB_CONNECTION_STRING}"]
    }
  }
}
```

**Note the casing:** `mcpServers` (camelCase) — not `mcp-servers`, not `mcp_servers`.

**Codex and Windsurf do not get a project-level MCP file written.** Codex configures MCP servers via its own `~/.codex/config.toml`, a TOML format this compiler doesn't generate; Windsurf's MCP config is global (`~/.codeium/windsurf/mcp_config.json`), not project-scoped. For both, skip the write entirely and print a warning instead of guessing at a file to create:
```
Warning: Codex: MCP config is global-only, skipping project-level write
Warning: Windsurf: MCP config is global-only, skipping project-level write
```
Do not invent a project-level MCP file for either tool — there isn't one to write.

**Merging:** If the target MCP file already exists, merge: add new servers defined in the harness, but do not overwrite existing server configurations. Servers already present in the file take precedence.

If a server name in harness.yaml already exists in the target config file, **do not overwrite** but print a warning (substitute the actual target file path and server name):
```
Warning: <target-config-file> already defines server '<server-name>'. Existing config kept.
  To update it, edit <target-config-file> directly or remove the entry and re-run.
```
For example: `Warning: .cursor/mcp.json already defines server 'postgres'. Existing config kept.`

Create parent directories if they don't exist.

---

### Step 5: Compile skills

This step only runs if both conditions are true:
1. The harness has a `plugins:` section
2. At least one plugin has a SKILL.md discoverable via the source lookup below

For each plugin in `plugins:`, locate its SKILL.md by checking these locations in order:
1. `~/.claude/skills/<name>/SKILL.md` — Claude Code global install
2. `.cursor/skills/<name>/SKILL.md` — project-local Cursor
3. `.agents/skills/<name>/SKILL.md` — agentskills.io shared location

Use the first SKILL.md found. If no SKILL.md is found in any of these locations, skip that plugin and note it in the compilation report as: `<name>: skipped (no SKILL.md found in ~/.claude/skills/, .cursor/skills/, or .agents/skills/)`.

For each plugin that has a SKILL.md, copy it to each confirmed target's skill directory. Unlike instructions, skills are **not** deduplicated across the AGENTS.md family — every target here has its own distinct skills directory, so each gets its own copy:

| Target | Skill directory |
|---|---|
| Claude Code | (skip — uses plugin install system, not file copy) |
| Cursor | `.cursor/skills/<name>/SKILL.md` or `.agents/skills/<name>/SKILL.md` |
| Copilot | `.github/skills/<name>/SKILL.md` or `.agents/skills/<name>/SKILL.md` |
| Codex | `.agents/skills/<name>/SKILL.md` |
| OpenCode | `.opencode/skills/<name>/SKILL.md` |
| Windsurf | `.windsurf/skills/<name>/SKILL.md` |
| Gemini CLI | `.gemini/skills/<name>/SKILL.md` |
| Junie | `.junie/skills/<name>/SKILL.md` |

Ask the user which location to write to if multiple are applicable, or write to the platform-specific location by default.

**Frontmatter adaptation when copying to any non-Claude-Code target:**
- If the source SKILL.md frontmatter has a `dependencies` field, rename it to `compatibility`
- Enforce that the `name` field matches the folder name: lowercase letters and hyphens only, max 64 characters. Truncate and slugify if needed.
- If `description` exceeds 1024 characters, truncate at the last word boundary before 1024 characters and append `…`.

Create parent directories before writing.

---

### Step 6: Compile permissions

**Claude Code:**

If the harness has a `permissions:` section, write or update `.claude/settings.json` with the permissions data:

```json
{
  "permissions": {
    "allow": ["Read", "Glob", "Grep", "Write", "Edit"],
    "deny": ["mcp__postgres__drop_*"],
    "additionalDirectories": ["sql/", "migrations/"]
  }
}
```

The keys map as follows:
- `permissions.tools.allow` → `permissions.allow`
- `permissions.tools.deny` → `permissions.deny`
- `permissions.paths` → `permissions.additionalDirectories`

If `.claude/settings.json` already exists, merge: update or add the `permissions` key without touching other keys in the file.

**Every other target (Cursor, Copilot, Codex, OpenCode, Windsurf, Gemini CLI, Junie):**

None of these tools support machine-enforceable permissions via a JSON config. Instead, append a human-readable permission description inside markers to the operational instructions file for that target (`.cursor/rules/harness.mdc`, `.github/copilot-instructions.md`, or the shared `AGENTS.md` for the Codex/OpenCode/Windsurf/Gemini/Junie family — written once there, same as the operational content itself):

```markdown
## Tool Permissions

This harness specifies the following tool permissions:
- **Allowed**: Read, Glob, Grep, Write, Edit, Bash
- **Denied**: Any tool matching `mcp__*__drop_*` or `mcp__*__delete_*`

Please configure your tool's permission settings to match these constraints.
```

Print a warning for each non-Claude-Code target that has a `deny` list:
```
Warning: permissions.tools.deny is not machine-enforceable for target 'cursor'.
  Denied tools: mcp__*__drop_*
  Instructions have been updated to describe the intended permissions,
  but manual tool configuration is required.
```

---

### Step 7: Handle flags

**`--dry-run`:**

Do not write any files. Instead, for each file that would be written, print its path and full content:

```
[DRY RUN] Would write: CLAUDE.md
----------------------------------------
<!-- BEGIN harness:data-engineer:operational -->
## Commands
- Build: `dbt run`
<!-- END harness:data-engineer:operational -->
----------------------------------------

[DRY RUN] Would write: .mcp.json
----------------------------------------
{
  "mcpServers": {
    "postgres": { ... }
  }
}
----------------------------------------
```

End with:
> "Dry run complete. No files were written. Remove --dry-run to apply."

**`--clean`:**

In addition to normal compilation, scan all target files for orphaned marker blocks — markers whose `{name}` no longer matches `metadata.name` in the current harness.yaml.

Example: if a file contains `<!-- BEGIN harness:old-harness:operational -->` but the current harness name is `data-engineer`, that block is orphaned.

Before deleting any orphaned blocks, the agent **must**:
1. List every orphaned block found: profile name, slot, file, and line numbers
2. Show the user exactly what will be deleted
3. Ask for confirmation: "Remove these N orphaned blocks? [y/N]"
4. Only proceed with deletion if the user confirms

This confirmation is required every time. `--clean` is a destructive operation with no recovery path — never skip this step.

---

### Step 8: Print compilation report

After all files are written (or previewed in dry-run mode), print a compilation report:

```
Compiled harness: data-engineer (v1.2.0)
Targets: claude-code, cursor, windsurf, gemini

  CLAUDE.md                        operational   merge    48 lines added
  AGENT.md                         behavioral    merge    12 lines added
  .mcp.json                        mcp-servers   ——       2 servers
  .claude/settings.json            permissions   ——       4 allowed, 1 denied
  .cursor/rules/harness.mdc        operational   merge    48 lines added
  .cursor/rules/behavioral.mdc     behavioral    merge    12 lines added
  .cursor/mcp.json                 mcp-servers   ——       2 servers
  AGENTS.md                        operational   merge    48 lines added   (shared: windsurf, gemini)
  .gemini/settings.json            mcp-servers   ——       2 servers

  Warnings:
    permissions.tools.deny is not machine-enforceable for target 'cursor'.
    permissions.tools.deny is not machine-enforceable for target 'windsurf'.
    permissions.tools.deny is not machine-enforceable for target 'gemini'.
```

Format rules:
- Group by target: claude-code entries first, then cursor, then copilot, then the AGENTS.md family
- For a file shared across multiple targets (`AGENTS.md`), list it once and note which targets share it in parentheses — never repeat the same file path multiple times in the report
- Within each target group, list files in slot order: operational, behavioral, identity, mcp-servers, permissions, skills
- Skipped slots are omitted unless `--verbose` is passed
- Show line counts for instruction files where calculable
- Show server counts for MCP files
- Show allowed/denied counts for permissions

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using wrong marker format | Markers must be exact: `<!-- BEGIN harness:{name}:{slot} -->` — any deviation breaks re-compilation merge logic |
| Using `mcp_servers` or `mcp-servers` in JSON | JSON key must be `mcpServers` (camelCase) |
| Omitting Cursor `.mdc` frontmatter | Always add frontmatter to `.mdc` files — it is mandatory for Cursor to recognize the file |
| Omitting Copilot `.instructions.md` frontmatter | Always add `applyTo: "**"` frontmatter to Copilot instructions files |
| Adding frontmatter to `AGENTS.md` | `AGENTS.md` is plain markdown — never prepend YAML frontmatter to it |
| Writing `AGENTS.md` once per target in that family | It's one shared file — write it once even when 2+ of codex/opencode/windsurf/gemini/junie are confirmed targets |
| Writing a project-level MCP file for Codex or Windsurf | Both are global-only for MCP — skip the write and warn instead of inventing a file |
| Overwriting existing MCP server configs on merge | Merge means add new servers only; existing server definitions win |
| Silently skipping MCP server key collisions | Always warn when a server name already exists in the target file — never skip silently |
| Expecting `import-mode` to be per-slot | `import-mode` is a single scalar under `instructions:` that applies to all slots. Per-slot override is not supported in v1 |
| Writing SOUL.md or a behavioral file for the AGENTS.md family | `identity` is Claude Code-only; `behavioral` is Claude Code/Cursor/Copilot-only. Neither has an equivalent file for codex/opencode/windsurf/gemini/junie — omit both |
| Assuming platforms are present | Always detect independently; never assume a platform exists |
| Treating a bare `AGENTS.md` as a confident match | It's ambiguous across 5 tools — ask which one before assuming |
| Applying `--clean` without the flag | Only remove orphaned markers when `--clean` is explicitly passed |
| Skipping `replace` confirmation | Always confirm with the user before overwriting existing file content |
| Skipping parent directory creation | Always create parent dirs (`.cursor/rules/`, `.github/instructions/`, `.vscode/`) before writing |
| Using `{name}` as literal string in markers | `{name}` must be replaced with the actual `metadata.name` value, or `default` if absent |
