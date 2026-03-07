# claude-setup

Claude Code configuration — the parts worth sharing.

---

## `/research` skill

You read something interesting. You synthesize it, maybe take a few notes, move on. Three weeks later you vaguely remember it existed but can't find it. You re-read it. This is the loop.

This skill breaks the loop. Point it at anything — a URL, a GitHub repo, a YouTube talk, a PDF — and it builds a knowledge base that actually compounds over time.

```
/research: https://github.com/letta-ai/letta
```

That fetches the repo, identifies the important docs, synthesizes the key ideas, and drops everything into your project:

```
your-project/
├── resources/
│   └── letta-readme-2026-03-06.md     ← verbatim content, always saved first
└── research/
    ├── INDEX.md                        ← searchable master index
    └── agent-memory/
        └── letta.md                    ← synthesis, tagged, dated
```

The part that makes it worth using over time: when you find a YouTube talk about Letta next week, it doesn't create a second file. It finds the existing synthesis and folds the new insights in. One document per topic, fed by as many sources as you find.

Works with anything you can link to or read:

| Source | How it works |
|--------|-------------|
| GitHub repo | Fetches tree + key files via the API — verbatim, not rendered |
| Docs / articles / blog posts | WebFetch extraction |
| YouTube video | Description + transcript if available |
| Podcast episode | Show notes + linked transcripts |
| Academic papers | arXiv, PDF URLs |
| Reddit threads | Full thread |
| Local files | PDF, markdown, text, code — anything readable |

For GitHub repos, fetched content gets scanned for prompt injection before anything is saved — HTML comments, zero-width characters, imperative language targeting AI tools. Suspicious content gets flagged and documented, never followed.

**Install:**

```bash
cp -r skills/research/ ~/.claude/skills/research/
```

Requires [Claude Code](https://claude.ai/claude-code). The [`gh` CLI](https://cli.github.com/) is only needed for GitHub URLs.

Full usage docs in [`skills/research/README.md`](skills/research/README.md).

---

## `scripts/rebuild-research-index.py`

Regenerates `research/INDEX.md` by scanning synthesis files and reading their YAML frontmatter. The research skill runs this automatically at the end of every session, but you can run it manually if you edit files by hand or something gets out of sync.

```bash
pip install pyyaml
python3 scripts/rebuild-research-index.py        # rebuild
python3 scripts/rebuild-research-index.py --dry-run  # preview
```

Requires Python 3.10+. Expects `research/` and `scripts/` to sit at the same level in your project.

---

## How this repo works

```
claude-setup/
├── skills/
│   └── research/
│       ├── SKILL.md     ← what Claude reads to run the workflow
│       └── README.md    ← what you read to understand it
└── scripts/
    └── rebuild-research-index.py
```

Skills go in `~/.claude/skills/`. Scripts go in your project.

Nothing in here was added because it seemed like a good idea. It's here because it's useful.
