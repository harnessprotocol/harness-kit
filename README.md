# claude-setup

My personal Claude Code setup — the parts worth sharing.

---

## `/research` skill

I read a lot. Blog posts, GitHub repos, papers, YouTube talks. For a while the knowledge just evaporated — browser tabs closed, notes scattered, no way to build on what I'd already looked into.

This skill fixes that. You throw a source at it and it builds a real knowledge base: raw content preserved verbatim, a synthesized document that gets updated as you find more on the same topic, and a master index so you can actually find things later.

```
/research: https://github.com/letta-ai/letta
```

That one command fetches the repo, identifies the important docs, synthesizes the key ideas, and drops everything into your project:

```
your-project/
├── resources/
│   └── letta-readme-2026-03-06.md     ← verbatim content, always saved first
└── research/
    ├── INDEX.md                        ← searchable master index
    └── agent-memory/
        └── letta.md                    ← synthesis, tagged, dated
```

The part that makes it actually useful over time: if you research a YouTube talk about Letta next week, it doesn't create a second file. It finds the existing synthesis and folds the new insights in. One document per topic, fed by as many sources as you find.

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

One thing I added that I haven't seen elsewhere: for GitHub repos, it scans fetched content for prompt injection before saving or synthesizing anything — HTML comments, zero-width characters, imperative language targeting AI tools. If it finds something suspicious, it flags it and documents it. It never follows it.

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

Nothing in here was added because it seemed like a good idea. It's here because I use it.
