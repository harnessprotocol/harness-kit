# harness-sync

Syncs AI tool configurations bidirectionally across Claude Code, Cursor, and GitHub Copilot. Inventories installed skills, instruction blocks, and MCP server configs on each detected platform, reports what's out of sync, and lets you push or pull changes.

## Usage

```
/harness-sync
/harness-sync --target cursor
```

Without a flag, detects all platforms present in the project and compares them.

## What It Does

1. Detects which AI tools are configured in the project (Claude Code, Cursor, Copilot)
2. Inventories skills, MCP configs, and harness instruction blocks on each platform
3. Reports divergence — what's missing, what differs, what's in sync
4. Asks which sync direction you want (push or pull)
5. Detects and surfaces conflicts — shows both versions side by side, never overwrites silently
6. Executes the sync, touching only divergent items
7. Re-scans to verify platforms are now in sync

## Flags

| Flag | Description |
|------|-------------|
| `--target <tool>` | Restrict scope to one platform: `claude-code`, `cursor`, or `copilot`. Useful when you only want to push from one platform to another specific one, ignoring unrelated platforms. All platforms are still inventoried for the divergence report. |

## Divergence Report

After inventorying each platform, you'll see a report like:

```
Divergence detected:

Skills:
  ✓ research  — all platforms
  ✓ explain   — all platforms
  ✗ orient    — Claude Code only (missing from Cursor, Copilot)

MCP:
  △ postgres  — Claude Code, Cursor (missing from Copilot)
  ✗ filesystem — Claude Code only

Instructions:
  CLAUDE.md ↔ .cursor/rules/harness.mdc: content differs (my-harness:operational block)
```

## Sync Directions

**Push** — pick one platform as the source of truth, write its content to the others. Uses harness-compile logic for consistent output (marker blocks, frontmatter, MCP merging).

**Pull** — read native changes from Cursor or Copilot config files, merge them back into `harness.yaml`, then recompile everything. This modifies your `harness.yaml` source of truth — you'll be asked to confirm before any changes are written.

## Conflict Handling

If the same harness block was modified independently on two platforms, both versions are shown side by side:

```
Conflict: my-harness:operational

Claude Code (CLAUDE.md):
  [content A]

Cursor (.cursor/rules/harness.mdc):
  [content B]

How would you like to resolve this?
1. Use Claude Code version (overwrite Cursor)
2. Use Cursor version (overwrite Claude Code)
3. Edit manually first, then re-run /harness-sync
4. Skip this conflict for now
```

Conflicts are never silently resolved.

## Skill Inventory

Skills are tracked by install location and labelled accordingly:

| Location | Tag | Notes |
|----------|-----|-------|
| `~/.claude/skills/` | `(global)` | Claude Code global install via plugin marketplace |
| `.cursor/skills/` | `(local)` | Cursor project-local skill file |
| `~/.cursor/skills/` | `(global)` | Cursor global skills (if directory exists) |
| `.github/skills/` | `(local)` | Copilot project-local skill file |
| `.agents/skills/` | `(shared)` | agentskills.io shared location (Cursor + Copilot) |

Global and project-local installs are not interchangeable — the sync report distinguishes them.

## Sync Summary

After execution you'll see what changed:

```
Sync complete:

  Added:   .cursor/skills/orient/SKILL.md
  Updated: .cursor/mcp.json (added filesystem server)
  Updated: .cursor/rules/harness.mdc (my-harness:operational block)
  Skipped: .github/ (Copilot not detected)

All platforms are now in sync.
```

## Related Skills

- `/harness-compile` — compile a harness.yaml into native configs (push uses harness-compile logic)
- `/harness-validate` — validate a harness.yaml before syncing
- `/harness-export` — capture your current setup into a harness.yaml
- `/harness-import` — install plugins from a harness.yaml
