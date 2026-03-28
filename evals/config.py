from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent

MODELS = {
    "sonnet": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001",
    "opus": "claude-opus-4-6",
}

GRADER_MODEL = "claude-haiku-4-5-20251001"

TASKS_DIR = REPO_ROOT / "evals" / "tasks"
FIXTURES_DIR = REPO_ROOT / "evals" / "fixtures"
RESULTS_DIR = REPO_ROOT / "evals" / "results"
PLUGINS_DIR = REPO_ROOT / "plugins"

SKILL_MD_PATH = "plugins/{skill}/skills/{skill}/SKILL.md"

MAX_TOKENS = 4096

GOLDEN_DIR = REPO_ROOT / "evals" / "golden"
