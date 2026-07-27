# Evals

Automated evaluation system for harness-kit skills. Tests skill behavior across Claude models to ensure quality and compatibility.

## Setup

### 1. Create a virtual environment

```bash
cd evals
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

The system requires:
- `anthropic>=0.40.0` - Anthropic API client
- `pyyaml>=6.0` - YAML task definitions
- `jinja2>=3.1.0` - Template rendering

## Usage

### Running offline tests (no API key required)

Use pre-committed golden responses to validate test structure without API calls:

```bash
python runner.py --offline
```

This mode:
- Loads responses from `evals/golden/`
- Runs structural checks only (code graders)
- No API costs
- Fast validation for CI/development

Note: the committed golden responses were generated against Claude 4-era
models. They're sample text for exercising the grading pipeline offline, not
a claim about current model output — `config.py`'s `MODELS` dict (used by
live, non-offline runs) is what tracks the actual current model lineup, and
staying in sync with that is unaffected by the golden corpus being dated.
Re-generating the golden corpus against current models is tracked as
separate follow-up work, not required for this to keep working.

### Running with API key

Set your Anthropic API key and run full evaluations:

```bash
export ANTHROPIC_API_KEY="your-key-here"
python runner.py
```

This mode:
- Calls Claude API for each trial
- Runs both structural and quality grading
- Generates comprehensive results
- Costs API tokens

### Common options

```bash
# Test a single skill
python runner.py --skill research

# Test with one model only
python runner.py --model sonnet

# Structure checks only (no quality grading = lower cost)
python runner.py --structure-only

# Include plugin-authored evals
python runner.py --include-plugin-evals

# Preview what would run
python runner.py --dry-run
```

### Combining flags

```bash
# Fast feedback during development
python runner.py --skill explain --structure-only

# Full eval for one skill before release
python runner.py --skill research --model sonnet
```

## Output

Results are written to `evals/results/latest.json` with:
- Per-trial outputs and grades
- Pass/fail metrics
- Quality scores
- Model compatibility data

To render the compatibility page:

```bash
python render_results.py
```

## CI Integration

The `.github/workflows/evals.yml` workflow runs automatically on releases:
- Installs Python 3.11 and dependencies
- Runs offline tests if no API key
- Runs full evals if API key available
- Opens PR with updated results

## Directory structure

```
evals/
├── README.md              ← this file
├── requirements.txt       ← Python dependencies
├── config.py              ← model names, paths, settings
├── runner.py              ← main eval runner
├── grader.py              ← code and quality grading logic
├── results.py             ← metrics and result serialization
├── render_results.py      ← generate compatibility.md
├── tasks/                 ← eval task definitions (YAML)
├── fixtures/              ← test fixtures (file trees)
├── golden/                ← pre-committed responses for offline mode
└── results/               ← output JSON files
```
