# claude-setup

[![Release](https://img.shields.io/github/v/release/siracusa5/claude-setup?style=flat-square)](https://github.com/siracusa5/claude-setup/releases)
[![Validate](https://img.shields.io/github/actions/workflow/status/siracusa5/claude-setup/validate.yml?style=flat-square&label=validate)](https://github.com/siracusa5/claude-setup/actions/workflows/validate.yml)
[![License](https://img.shields.io/github/license/siracusa5/claude-setup?style=flat-square)](LICENSE)

Claude Code plugins — the parts worth sharing. Add a marketplace once, then install skills by name.

**Requires:** [Claude Code](https://claude.ai/claude-code)

> **[CLAUDE.md Conventions: Three-File Structure](docs/claude-md-conventions.md)** — How to organize Claude Code configuration across CLAUDE.md, AGENT.md, and SOUL.md with separation of concerns, cascade rules, and practical examples.

## Install

```
/plugin marketplace add siracusa5/claude-setup
/plugin install research@claude-setup
```

<details>
<summary>Fallback: install with script (skills only)</summary>

If your Claude Code build doesn't support the plugin marketplace:

```bash
curl -fsSL https://raw.githubusercontent.com/siracusa5/claude-setup/main/install.sh | bash
```

Downloads skill files to `~/.claude/skills/` over HTTPS. This installs only the skill files; the full plugin (e.g. index rebuild script) comes from the marketplace install.
</details>

---

## Plugins

| Plugin | Description |
|--------|-------------|
| [`research`](plugins/research/skills/research/README.md) | Process any source into a structured, compounding knowledge base |

### research

Point it at anything — a URL, GitHub repo, YouTube video, PDF, local file — and it extracts the raw content, preserves it, and synthesizes it into your knowledge base. Multiple sources about the same topic merge into one synthesis document, so knowledge compounds instead of sprawling.

**Components:** `/research` skill, prompt-injection scanner for GitHub repos, index rebuild script.

**Requirements:** [gh CLI](https://cli.github.com/) for GitHub URLs. Python 3.10+ and `pyyaml` for the index script.
