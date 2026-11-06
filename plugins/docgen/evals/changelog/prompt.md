---
max_turns: 8
runs: 1
timeout_seconds: 180
model: claude-haiku-5-5
allowed_tools: [Skill, Read, Glob, Grep]
tags: [docgen, changelog]
---

Write the changelog for this project from its git history. Show it here and ask before writing any file.

There is no git checkout here. Treat this as the output of `git log --oneline`:

```
abc1234 feat: add item deletion endpoint
def5678 fix: handle empty store response on list endpoint
123abcd feat: add GET /api/items/:id endpoint
456defg feat: add POST /api/items create endpoint
789ghij feat: add GET /api/items list endpoint
012ijkl chore: add go.mod and project scaffold
```
