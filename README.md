# harness-kit

[![Release](https://img.shields.io/github/v/release/siracusa5/harness-kit?style=flat-square)](https://github.com/siracusa5/harness-kit/releases)
[![Validate](https://img.shields.io/github/actions/workflow/status/siracusa5/harness-kit/validate.yml?style=flat-square&label=validate)](https://github.com/siracusa5/harness-kit/actions/workflows/validate.yml)
[![License](https://img.shields.io/github/license/siracusa5/harness-kit?style=flat-square)](LICENSE)

Claude Code plugins — the parts worth sharing. Add a marketplace once, then install skills by name.

**Requires:** [Claude Code](https://claude.ai/claude-code)

> **[Claude Conventions](docs/claude-md-conventions.md)** — How to organize Claude Code configuration with separation of concerns, cascade rules, and practical examples.

## Install

```
/plugin marketplace add siracusa5/harness-kit
/plugin install research@harness-kit
```

<details>
<summary>Fallback: install with script (skills only)</summary>

If your Claude Code build doesn't support the plugin marketplace:

```bash
curl -fsSL https://raw.githubusercontent.com/siracusa5/harness-kit/main/install.sh | bash
```

Downloads skill files to `~/.claude/skills/` over HTTPS. This installs only the skill files; the full plugin (e.g. index rebuild script) comes from the marketplace install.
</details>

---

## Plugins

| Plugin | Description |
|--------|-------------|
| [`research`](plugins/research/skills/research/README.md) | Process any source into a structured, compounding knowledge base |
| [`explain`](plugins/explain/skills/explain/README.md) | Structured code explainer — layered explanations of files, functions, directories, or concepts |
| [`data-lineage`](plugins/data-lineage/skills/data-lineage/README.md) | Trace column-level data lineage through SQL, Kafka, Spark, and JDBC codebases |

### research

Point it at anything — a URL, GitHub repo, YouTube video, PDF, local file — and it extracts the raw content, preserves it, and synthesizes it into your knowledge base. Multiple sources about the same topic merge into one synthesis document, so knowledge compounds instead of sprawling.

**Components:** `/research` skill, prompt-injection scanner for GitHub repos, index rebuild script.

**Requirements:** [gh CLI](https://cli.github.com/) for GitHub URLs. Python 3.10+ and `pyyaml` for the index script.

### explain

Point it at a file, directory, function, or concept and get a layered explanation: what it does, how it connects, gotchas, and where to start if you need to change it. Adapts depth automatically — a single function gets a deep-dive, a directory gets a map first.

**Requirements:** No external dependencies.

```
/explain src/auth/middleware.ts
/explain the payment processing flow
```

### data-lineage

Trace column-level data lineage through messy, heterogeneous data stacks. Follows data through SQL views, Kafka topics, Spark jobs, JDBC writes, and ORM mappings. Each hop gets a confidence rating, and you get an SVG diagram you can open in a browser.

**Requirements:** No external dependencies.

```
/data-lineage orders.total_amount
/data-lineage customer_id in reporting.daily_summary
```
