---
name: harness-sync
description: Use when user invokes /harness-sync or wants to sync AI tool configurations across any of the 8 supported targets (Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini CLI, Junie). Inventories installed skills, instruction blocks, and MCP configs on all detected platforms, reports divergence, and lets the user push or pull changes. Push path reuses harness-compile logic. Pull path updates harness.yaml and recompiles. Never overwrites without explicit confirmation.
disable-model-invocation: true
---

# Sync Harness Configurations Across Platforms

You are syncing AI tool configurations across any combination of the 8 supported targets: Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini CLI, and Junie. You will inventory what is installed and configured on each platform, report any divergence, and execute the sync direction the user chooses.

This skill depends on harness-compile: the push path reuses harness-compile's compilation logic to write the selected source platform's content to all target platforms.

## Workflow Order (MANDATORY)

**Follow these steps in order. Do not skip any step.**

---

### Step 1: Detect platforms

Check for any `--target <platform>` flag the user passed. If present, restrict the entire workflow to that platform only. Valid values: `claude-code`, `cursor`, `copilot`, `codex`, `opencode`, `windsurf`, `gemini`, `junie`. For sync, `--target <platform>` means "treat this platform as the only target for push output." It does not restrict which platforms are scanned in Step 2 — all detected platforms are still inventoried so divergence can be identified.

Otherwise, scan the working directory for platform indicators:

**Claude Code** is present if any of these exist: `CLAUDE.md`, `.claude/`, `.mcp.json`
**Cursor** is present if any of these exist: `.cursor/`, `.cursor/rules/`, `.cursor/mcp.json`, `.cursor/skills/`
**Copilot** is present if any of these exist: `.github/`, `.vscode/mcp.json`, `.github/skills/`
**Codex** is present if `.codex/` exists
**OpenCode** is present if `opencode.json` or `.opencode/` exists
**Windsurf** is present if `.windsurf/` exists
**Gemini CLI** is present if `.gemini/` exists
**Junie** is present if `.junie/` exists

**Never assume a platform is present.** Detect each independently. If `.github/` is the only Copilot indicator, ask the user:
> "I found a `.github/` directory but no other Copilot indicators. Are you using GitHub Copilot in this project?"

A bare `AGENTS.md` with none of the tool-specific directories above is ambiguous — it's the shared instruction file for Codex, OpenCode, Windsurf, Gemini CLI, and Junie, so its presence alone doesn't identify which one. Ask which of those five the user actually uses rather than assuming or offering all of them.

Also check global skill directories:
- `~/.claude/skills/` — Claude Code global skill installs
- `~/.cursor/skills/` — Cursor global skills (if the directory exists)

If no platforms are detected, tell the user:
> "No AI tool config directories found. Which platforms are you using? (claude-code, cursor, copilot, codex, opencode, windsurf, gemini, junie)"

---

### Step 2: Inventory current state

For each detected platform, catalog three things:

**Installed skills:**
- Claude Code: `~/.claude/skills/` (global) and any project-local skill symlinks
- Cursor: `.cursor/skills/` (project-local), `~/.cursor/skills/` (global if the directory exists)
- Copilot: `.github/skills/` (project-local)
- Codex: `.agents/skills/` (also the agentskills.io shared location)
- OpenCode: `.opencode/skills/` (project-local)
- Windsurf: `.windsurf/skills/` (project-local)
- Gemini CLI: `.gemini/skills/` (project-local)
- Junie: `.junie/skills/` (project-local)

Distinguish global vs. project-local installs with a `(global)` or `(local)` tag. Label skills found in `.agents/skills/` as `(shared)` in the inventory display.

**Instruction files:** Read each platform's instruction files and identify:
- Harness marker blocks: lines matching `<!-- BEGIN harness:` and `<!-- END harness: -->`
- Manual content: any content outside marker blocks

Report marker blocks by their `{name}:{slot}` identifier. Codex, OpenCode, Windsurf, Gemini CLI, and Junie all read the **same** `AGENTS.md` file — inventory it once, not five times, and list all five as sharing that one entry.

**MCP server configs:** Parse JSON from:
- Claude Code: `.mcp.json`
- Cursor: `.cursor/mcp.json`
- Copilot / VS Code: `.vscode/mcp.json`
- OpenCode: `opencode.json`
- Gemini CLI: `.gemini/settings.json`
- Junie: `.junie/mcp/mcp.json`
- Codex, Windsurf: no project-level file exists for either (Codex uses `~/.codex/config.toml`, Windsurf uses a global config) — report their MCP row as `(global-only, not scanned)` rather than `(none)`, since `(none)` would wrongly imply an empty project config exists to compare against.

List each server by name and transport type.

Present a unified inventory:

```
Current state:

Claude Code:
  Skills:  research (global), explain (global), orient (global)
  MCP:     postgres (stdio), filesystem (stdio)
  Harness blocks in CLAUDE.md: [my-harness:operational], [my-harness:behavioral]

Cursor:
  Skills:  research (local), explain (local)
  MCP:     postgres (stdio)
  Harness blocks in .cursor/rules/harness.mdc: [my-harness:operational]

Copilot:
  Skills:  (none)
  MCP:     (none)
  Harness blocks in .github/copilot-instructions.md: (none)
```

If a platform has no instruction file for a slot, show `(none)` for that slot's harness blocks.

---

### Step 3: Detect divergence

Compare across all detected platforms:

**Skills divergence:** For each unique skill name found anywhere, note which platforms have it and which don't.

**MCP divergence:** For each unique MCP server name found anywhere, note which platforms have it and which don't. If a server exists on multiple platforms but with different configurations (different command, args, or type), flag it as a configuration conflict.

**Instructions divergence:** For each unique harness block identifier (e.g., `my-harness:operational`) found anywhere, compare the content between platforms. If the content differs between any two platforms, flag it.

Present a divergence report:

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
  .github/copilot-instructions.md: no harness blocks (Claude Code has my-harness:operational, my-harness:behavioral)
```

If no divergence is found across any dimension, tell the user:
> "All platforms are in sync. Nothing to do."

And stop here.

---

### Step 4: Propose sync direction

List push-source options dynamically from whichever platforms were actually detected in Step 1 — don't hardcode a fixed menu of exactly two, and don't special-case any one platform as push-ineligible. Any detected platform's real config files can serve as a push source; the constraint is practical (only platforms that are actually present have content worth pushing from), not a limitation of any specific tool.

> "How would you like to sync?
> 1. Push from [detected platform A] → other platforms
> 2. Push from [detected platform B] → other platforms
> ... (one option per detected platform)
> N. Pull changes from [detected platforms] into harness.yaml, then recompile
> N+1. Show me the diff first
>
> Which would you like?"

Wait for the user's answer before proceeding.

**Push option (any detected platform as source):** Note the source platform. Ask which targets to push to:
> "Push to which platforms? (all detected platforms, or list specific ones)"

Wait for target confirmation before proceeding to Step 5.

**Pull option:** Note that the user wants to pull external changes back into harness.yaml and proceed to Step 5. If more than one non-harness.yaml platform is a candidate pull source, ask which one(s) — pulling from multiple sources at once requires the cross-platform conflict resolution in Step 5.

**Diff option:** Show a detailed diff of each divergent section:
- For skills: list which skills are missing from which platforms
- For MCP: list which servers are missing or differ between platforms, showing the full server config side by side if configs differ
- For instructions: show the full content of each divergent harness block from each platform, labelled by platform and file path

After showing all diffs, return to this question.

---

### Step 5: Conflict detection

Before executing any sync, check for conflicts: a conflict exists when the same harness block identifier (e.g., `my-harness:operational`) has different content on two or more platforms that the user is treating as peers (i.e., neither is designated the authoritative source).

**For push operations:** The source platform is authoritative. There are no conflicts — the source wins. Skip to Step 6.

**For pull operations:** Two kinds of conflicts must be resolved before writing to harness.yaml:

First, if multiple external platforms are selected as pull sources (e.g., both Cursor and Copilot), compare those platforms against each other. If the same harness block exists on both with different content, that is a cross-platform conflict that must be surfaced before either is merged into harness.yaml:

```
Cross-platform conflict: my-harness:operational

Cursor (.cursor/rules/harness.mdc):
  [content A]

Copilot (.github/copilot-instructions.md):
  [content B]

These platforms disagree. Which should I pull from?
1. Use Cursor version
2. Use Copilot version
3. Edit manually first, then re-run /harness-sync
4. Skip this block
```

Resolve all cross-platform conflicts first, then proceed to compare the surviving version against harness.yaml.

Second, any harness block that exists on the pull source and in harness.yaml with different content is a conflict.

For each conflict, show both versions side by side and ask for resolution:

```
Conflict: my-harness:operational

Claude Code (CLAUDE.md):
  [full content of the block from CLAUDE.md]

Cursor (.cursor/rules/harness.mdc):
  [full content of the block from .cursor/rules/harness.mdc]

How would you like to resolve this?
1. Use Claude Code version (overwrite Cursor)
2. Use Cursor version (overwrite Claude Code)
3. Edit manually first, then re-run /harness-sync
4. Skip this conflict for now
```

**Never silently overwrite.** Always show both versions. Always wait for the user's resolution choice before proceeding. Resolve all conflicts before moving to Step 6.

If the user chooses option 3 (edit manually), stop and tell them:
> "Make your edits, then run `/harness-sync` again to pick up where we left off."

If the user chooses option 4 (skip), note the skipped conflict and continue resolving remaining conflicts. Skipped conflicts will not be synced.

---

### Step 6: Execute

**Push path:**

Use harness-compile logic to write the source platform's content to all confirmed target platforms. Only update items that are divergent — do not touch content that is already in sync across platforms.

When reading skill SKILL.md files for the push source, locate them as follows:
- **Push source = Claude Code**: read from `~/.claude/skills/<name>/SKILL.md`
- **Push source = Cursor**: check `.cursor/skills/<name>/SKILL.md` first; if not found, fall back to `~/.cursor/skills/<name>/SKILL.md`
- **Push source = Copilot**: read from `.github/skills/<name>/SKILL.md`
- **Push source = Codex, OpenCode, Windsurf, Gemini CLI, or Junie**: read from that platform's own skill directory (`.agents/skills/`, `.opencode/skills/`, `.windsurf/skills/`, `.gemini/skills/`, `.junie/skills/` respectively)
- Skills in `.agents/skills/<name>/SKILL.md` are available as a fallback source for any platform if its own path yields no SKILL.md

For each divergent item:
- **Skills**: copy the skill's SKILL.md (located via the lookup above) to each target platform's skill directory (see the table in harness-compile's Step 5 for the full 8-target mapping). Apply frontmatter adaptation rules from harness-compile (rename `dependencies` to `compatibility`, enforce name constraints, truncate description if over 1024 characters).
- **MCP servers**: add missing servers to target MCP config files using the source platform's server definition. Do not overwrite existing server entries in the target — if a server name already exists in the target file, print a warning and skip it. If Codex or Windsurf is a target, skip the MCP write and print the same global-only warning harness-compile uses — there's no project-level file to add the server to.
- **Instructions**: write the source platform's harness block content into each target platform's instruction file, following the slot mapping and marker format from harness-compile. Follow import-mode rules: if the target file already contains markers for that block, update between the markers; if no markers exist yet, append the block. If two or more of Codex/OpenCode/Windsurf/Gemini CLI/Junie are targets, write the shared `AGENTS.md` once, not once per target.

Create parent directories before writing if they don't exist.

**Pull path:**

1. Read all content that exists outside harness marker blocks in the source platform's instruction files (any non-Claude-Code platform — Cursor, Copilot, or the shared `AGENTS.md` for Codex/OpenCode/Windsurf/Gemini CLI/Junie). This is native content the user added directly.
2. Read all MCP servers that exist in source platform config files but are not in harness.yaml. (Not applicable if the pull source is Codex or Windsurf — neither has a project-level MCP file.)

**Skill files are not pulled.** Skills in harness.yaml are plugin source references (`source: owner/repo`), not file content. If the pull source has a skill installed that is not in harness.yaml, it cannot be automatically added — the `plugins:` section requires knowing the plugin's source repo. Tell the user:
> "I found skills in `[platform's skill directory]` not in your harness.yaml: [list]. To add these, run `/harness-export` and specify their source repos when prompted."

3. Summarize what would be added to harness.yaml:

```
Changes to write to harness.yaml:

  instructions.operational: 14 lines of content from .cursor/rules/harness.mdc (outside harness blocks)
  mcp-servers: add "redis" server from .cursor/mcp.json
```

4. Warn the user:
> "This will modify your harness.yaml — your source of truth file. The changes above will be merged in."
>
> "Proceed? [y/N]"

5. If the user confirms, write the updated harness.yaml with the pulled content merged in.
6. After writing harness.yaml, immediately run harness-compile logic to recompile all platforms from the updated harness.yaml, applying the new content consistently everywhere.

---

### Step 7: Verify

Re-run the Step 2 inventory scan across all platforms that were modified. Compare the results to confirm platforms are now in sync.

Report the outcome:

```
Sync complete:

  Added:   .cursor/skills/orient/SKILL.md
  Updated: .cursor/mcp.json (added filesystem server)
  Updated: .cursor/rules/harness.mdc (my-harness:operational block)
  Skipped: .github/ (Copilot not detected)

All platforms are now in sync.
```

If any divergence remains (e.g., a skipped conflict, a server that already existed in the target), report it:

```
Remaining divergence:
  my-harness:operational block was skipped (conflict unresolved)
  Run /harness-sync again to address it.
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Silently overwriting divergent content | Always show the conflict and ask — never write without the user's explicit choice |
| Treating `.github/` alone as Copilot confirmation | Ask the user if `.github/` is the only indicator — it may exist for CI only |
| Conflating global and project-local skills | Always label skills as `(global)` or `(local)` in the inventory — they are not equivalent |
| Skipping conflict detection on push | Push makes the source authoritative — but still check whether the user confirmed the target list before writing |
| Overwriting existing MCP server entries in targets | On push, add missing servers only — warn and skip if a server name already exists in the target |
| Running pull without warning about harness.yaml modification | Always warn that pull modifies harness.yaml before writing |
| Forgetting to recompile after pull | Pull must update harness.yaml and then run harness-compile logic — the two steps are always paired |
| Skipping Step 7 verification | Always re-scan after sync to confirm platforms are in sync and report any remaining divergence |
| Reporting all items in the sync report, not just changed ones | Only report files that were actually added, updated, or skipped — do not list unchanged files |
| Applying frontmatter adaptation only for new skills | Frontmatter rules (rename `dependencies`, enforce name constraints, truncate description) apply on every copy to any non-Claude-Code target, including updates |
| Showing only one version in a conflict | Always show both versions side by side with platform labels — never show just one |
| Skipping cross-platform comparison on pull | When multiple platforms are pull sources, compare them against each other before merging into harness.yaml |
| Writing a project-level MCP entry for Codex or Windsurf | Both are global-only for MCP — warn instead of inventing a file to write into |
| Writing `AGENTS.md` once per target in that family | It's one shared file — write it once even when several of codex/opencode/windsurf/gemini/junie are involved |
| Treating a bare `AGENTS.md` match as a confident platform identification | It's ambiguous across 5 tools — ask which one before assuming |
