# claude-setup

Claude Code plugins — the parts worth sharing. Add a marketplace once, then install skills by name.

**Requires:** [Claude Code](https://claude.ai/claude-code)

## Install

```bash
/plugin marketplace add siracusa5/claude-setup
/plugin install research@claude-setup
```

<details>
<summary>Fallback: install with script (skills only)</summary>

If your Claude Code build doesn’t support the plugin marketplace:

```bash
curl -fsSL https://raw.githubusercontent.com/siracusa5/claude-setup/main/install.sh | bash
```

Downloads skill files to `~/.claude/skills/` over HTTPS. This installs only the skill files; the full plugin (e.g. index rebuild script) comes from the marketplace install.
</details>

---

## Plugins

### [`research`](plugins/research/skills/research/README.md)

Process any source — URL, GitHub repo, YouTube video, PDF, local file — into a structured knowledge base that compounds over time. One synthesis per topic, updated as new sources come in.

**Components:** `/research` skill (extract, preserve raw content, synthesize, cross-reference), prompt-injection scanner for GitHub repos, and index rebuild (when installed via marketplace). **Requirements:** [gh CLI](https://cli.github.com/) for GitHub URLs; Python 3.10+ and `pyyaml` only if you run the index script outside the plugin.
