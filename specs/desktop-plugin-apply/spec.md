# Desktop plugin Apply

**Workflow:** Requirements-First. **Status:** approved design choices, 2026-11-16.
**Related:** [ux-consolidation AC-27](../ux-consolidation/spec.md) (Install to … with Apply off), [cross-harness-config-management](../cross-harness-config-management/spec.md) AC-18/AC-19 (plugin broker: native and unpack drivers).

## Why

The Marketplace's "Install to …" card and the Machine drawer's plugin cells both show an Apply button that is always off. Core can already plan and run a plugin install (`planPluginAction`, `executePluginAction`), but the desktop has no way to run a process, and the unpack driver writes files in a way the guarded write commands refuse. Users copy a CLI command or an agent prompt instead of clicking once.

## Decisions (John, 2026-11-16)

1. **Rust allowlist.** A new Rust command runs only the installer invocations the registry defines today. It checks binary, verb and every argument itself, so a tampered definitions bundle or a compromised webview cannot run anything else.
2. **Add the marketplace, then install.** For Claude Code, when the catalog's marketplace is not yet known, Apply adds it first.
3. **Marketplace and drawer.** One bridge serves both Apply buttons.
4. **Unpack through guarded writes.** Pi and OpenCode installs write SKILL.md files through the existing guarded write commands.

## Acceptance criteria

### Process bridge

- [ ] AC-1: WHEN the webview asks Rust to run a plugin installer THE SYSTEM SHALL run it only when the binary is `claude`, `copilot` or `codex` and the argument vector matches one of these shapes exactly:
  - `claude plugin install|uninstall <id> [--scope user|project|local]`
  - `claude plugin marketplace add <owner>/<repo>`
  - `copilot plugin install|uninstall <id>`
  - `codex plugin add|remove <id> [--json]`
  where `<id>` is `name@marketplace` and each part matches `^[A-Za-z0-9][A-Za-z0-9._-]*$`, and `<owner>/<repo>` uses the same part pattern.
- [ ] AC-2: WHEN a request fails AC-1 THE SYSTEM SHALL refuse it without spawning anything and return a refusal reason that names the rejected part.
- [ ] AC-3: WHEN an installer runs THE SYSTEM SHALL spawn it with an argument vector and no shell, with stdin closed, and with `NO_COLOR=1` added to the inherited environment.
- [ ] AC-4: WHEN a request carries a working directory THE SYSTEM SHALL run only if that directory is a project root the user granted in the native folder dialog; otherwise it SHALL refuse.
- [ ] AC-5: WHEN an installer runs longer than 180 seconds THE SYSTEM SHALL kill it and return a timed-out result with the output so far.
- [ ] AC-6: WHEN an installer writes more than 64 KiB to stdout or stderr THE SYSTEM SHALL keep the last 64 KiB of that stream.
- [ ] AC-7: WHEN the webview asks whether an installer binary exists THE SYSTEM SHALL answer only for the three allowlisted names, by PATH lookup, without running the binary.
- [ ] AC-8: THE SYSTEM SHALL never pass `-y`, `--yes`, `--config`, `--accept-command` or `--marketplace` to an installer, so a plugin that needs a person to confirm a command fails instead of being accepted silently.

### Marketplace Apply

- [ ] AC-9: WHEN the chosen surface has a supported native installer and its binary is on PATH THE SYSTEM SHALL enable Apply, and clicking it SHALL run the planned invocation shown beside the button.
- [ ] AC-10: WHEN the chosen surface is Claude Code AND the catalog's marketplace name is not a key in `~/.claude/plugins/known_marketplaces.json` THE SYSTEM SHALL run `claude plugin marketplace add <catalog repo>` before the install, and SHALL stop with the add's error if it fails.
- [ ] AC-11: WHEN the chosen surface is Pi or OpenCode THE SYSTEM SHALL enable Apply, and clicking it SHALL write each catalog skill as `<skills dir>/<plugin>/<skill dir>/SKILL.md`, rebuilding the `name` and `description` frontmatter from the catalog.
- [ ] AC-12: WHILE an Apply runs THE SYSTEM SHALL disable the button and label it "Installing…".
- [ ] AC-13: WHEN an Apply succeeds THE SYSTEM SHALL show a success toast naming the plugin and the surface; WHEN it fails or is refused THE SYSTEM SHALL show a warning toast with the reason.
- [ ] AC-14: WHEN Apply is unavailable THE SYSTEM SHALL CONTINUE TO show why beside the button and keep Copy CLI command and Copy prompt working.

### Machine drawer Apply

- [ ] AC-15: WHEN a drawer cell's plan carries a supported plugin action THE SYSTEM SHALL enable Apply and run it through `applyCellAction`'s plugin path with the Tauri process runner and file provider.
- [ ] AC-16: WHEN a drawer plugin Apply succeeds THE SYSTEM SHALL show "Installed <name> on <surface>" and rescan, as AC-16 of ux-consolidation does for other resources.
- [ ] AC-17: WHEN a drawer cell copies a plugin to Pi or OpenCode THE SYSTEM SHALL unpack from the Claude Code install path recorded for that plugin, as the CLI does.

### Unpack writes

- [ ] AC-18: WHEN the unpack driver writes a SKILL.md THE SYSTEM SHALL write a `.harness-tmp-<suffix>` sibling and rename it over the target, so the guarded write commands accept it.
- [ ] AC-19: WHEN any target SKILL.md already exists THE SYSTEM SHALL refuse the whole unpack before writing anything, naming the first existing file.
- [ ] AC-20: WHEN an unpack succeeds THE SYSTEM SHALL say in its outcome that only SKILL.md files were written and a skill's other files (scripts, references) were not.
- [ ] AC-21: WHEN the unpack driver is given catalog skills THE SYSTEM SHALL use them as the source and SHALL NOT require a source surface or recorded install path.

### Unchanged behavior

- [ ] AC-22: WHEN a drawer cell action is not a plugin THE SYSTEM SHALL CONTINUE TO apply it through the transaction engine with preimage checks and a rollback point.
- [ ] AC-23: WHEN the CLI runs `surface sync` with a plugin unpack THE SYSTEM SHALL CONTINUE TO install it, now through temp-and-rename writes.
- [ ] AC-24: THE SYSTEM SHALL CONTINUE TO deny the webview any general process-spawn or shell capability.

## Boundaries

- ✅ Always: build installer argv in core from the registry; re-validate it in Rust; run Rust tests for every allowlist shape and every refusal.
- ⚠️ Ask first: adding a binary, verb or flag to the allowlist; any change to `fs_guarded.rs` acceptance rules.
- 🚫 Never: commit secrets or token-shaped fixtures; spawn through a shell; pass a confirmation-skipping flag; overwrite an existing SKILL.md during unpack.

## Out of scope

- Uninstall from the desktop (unpack uninstall still needs the recorded file list read back).
- Marketplace add for Copilot or Codex (no known CLI verb).
- Copying a skill's sibling files during unpack (the catalog carries only SKILL.md bodies).
- Recording desktop unpacks in the state store.
