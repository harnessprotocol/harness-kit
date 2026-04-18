---
title: Compatibility
---

# Skill Compatibility Matrix

> **Note:** This page is populated automatically by CI runs. No evaluation results have been published yet.

Run evals locally to generate results:

```bash
# Install deps
pip install -r evals/requirements.txt

# Dry run — see what would run
python evals/runner.py --dry-run

# Structure-only (no API grading cost)
python evals/runner.py --structure-only

# Full run
python evals/runner.py

# Render this page
python evals/render_results.py
```

Or trigger the [eval workflow](https://github.com/harnessprotocol/harness-kit/actions/workflows/evals.yml) on a release.
