---
title: Writing Evals
---

# Writing Evals for Your Plugin

harness-kit ships an eval framework that measures skill quality across models. Official evals live in `evals/tasks/`. Plugin authors can ship their own evals alongside their skills (beta).

## Quickstart

Add an `evals/tasks/` directory inside your plugin:

```
plugins/my-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/my-skill/
│   └── SKILL.md
└── evals/
    └── tasks/
        └── task-basic.yaml
```

## Task Definition Format

```yaml
name: my-skill-basic          # unique identifier for this task
skill: my-skill               # matches the skill directory name
version: 1

input:
  user_message: "/my-skill example-input"
  fixture: my-fixture          # optional: directory in evals/fixtures/

expectations:
  structure:                   # fast, free, deterministic
    required_sections:         # H2 headings that must appear in output
      - Summary
      - Details
    min_words: 100
    max_words: 2000
    must_contain:
      - "expected phrase"
    must_not_contain:
      - "I cannot"

  quality:                     # model-based rubric (uses Haiku — costs tokens)
    - criterion: "Summary accurately describes the input"
      weight: 2
    - criterion: "Output does not invent information not present in the fixture"
      weight: 3

trials: 3
tags:
  - my-tag
```

## Fixtures

Fixtures are minimal synthetic codebases loaded as pre-context in the skill prompt — no real repos, no network calls.

Official fixtures live at `evals/fixtures/{name}/`. Each file is injected as:

```
--- FILE: relative/path ---
<file contents>
```

Plugin-authored fixtures should live alongside your task definitions:

```
plugins/my-plugin/evals/
├── fixtures/
│   └── my-fixture/
│       └── example.py
└── tasks/
    └── task-basic.yaml
```

> **Note:** Plugin fixtures are not yet resolved by the official runner. This is planned for a future release.

## Running Evals

```bash
# Install deps (from repo root)
pip install -r evals/requirements.txt

# All tasks, all models
python evals/runner.py

# One skill only
python evals/runner.py --skill explain

# One model only
python evals/runner.py --model sonnet

# Code graders only — no API cost for quality grading
python evals/runner.py --structure-only

# Include plugin evals (beta)
python evals/runner.py --include-plugin-evals

# Dry run — see what would run
python evals/runner.py --dry-run
```

## Grader Design

**Code-based graders** run instantly and for free:

| Grader | What it checks |
|--------|---------------|
| `SectionGrader` | Required `##` headings exist in output |
| `WordCountGrader` | min/max word count bounds |
| `ContainsGrader` | `must_contain` / `must_not_contain` phrases |

**Model-based graders** use Haiku to evaluate quality criteria. Each criterion is one API call returning `{"pass": true/false, "reason": "..."}`. Use `weight` to indicate relative importance.

## Metrics

| Metric | Meaning |
|--------|---------|
| pass@1 | Fraction of trials passing all structure checks |
| pass@N | Probability ≥1 of N trials passes (capability ceiling) |
| pass^N | Probability all N trials pass (reliability floor) |
| quality | Average weighted quality score across trials |

## Tips

- Keep fixtures small (1–5 files, &lt;500 lines total) — they're loaded verbatim into the prompt
- Write `must_not_contain` checks for known failure modes (e.g., "I don't have access")
- Use `--structure-only` during task authoring to iterate without API grading cost
- Quality criteria should be binary and unambiguous — avoid "good" or "clear" without defining what that means
