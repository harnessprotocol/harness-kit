#!/usr/bin/env python3
"""harness-kit skill eval runner."""

import argparse
import sys
from pathlib import Path
from typing import Optional

import yaml
import anthropic

# Allow sibling imports from evals/
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    MODELS,
    TASKS_DIR,
    FIXTURES_DIR,
    RESULTS_DIR,
    REPO_ROOT,
    MAX_TOKENS,
    SKILL_MD_PATH,
    GOLDEN_DIR,
)
from grader import run_code_graders, run_model_graders
from results import compute_metrics, write_results


def discover_tasks(
    skill: Optional[str] = None,
    include_plugin_evals: bool = False,
) -> list[Path]:
    task_files = list(TASKS_DIR.glob("**/*.yaml"))
    if include_plugin_evals:
        task_files.extend(REPO_ROOT.glob("plugins/*/evals/tasks/**/*.yaml"))
    if skill:
        task_files = [t for t in task_files if t.parent.name == skill]
    return sorted(task_files)


def load_task(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def load_skill_md(skill: str) -> str:
    path = REPO_ROOT / SKILL_MD_PATH.format(skill=skill)
    if not path.exists():
        raise FileNotFoundError(f"SKILL.md not found at {path}")
    return path.read_text()


def load_fixture(fixture_name: str) -> str:
    fixture_dir = FIXTURES_DIR / fixture_name
    if not fixture_dir.exists():
        raise FileNotFoundError(f"Fixture '{fixture_name}' not found at {fixture_dir}")
    parts = []
    for file_path in sorted(fixture_dir.rglob("*")):
        if file_path.is_file():
            rel = file_path.relative_to(fixture_dir)
            content = file_path.read_text(errors="replace")
            parts.append(f"--- FILE: {rel} ---\n{content}")
    return "\n\n".join(parts)


def build_prompt(task: dict, skill_md: str, fixture_content: str) -> tuple[str, str]:
    """Returns (system_prompt, user_message)."""
    user_parts = []
    if fixture_content:
        user_parts.append(fixture_content)
    user_parts.append(task["input"]["user_message"])
    return skill_md, "\n\n".join(user_parts)


def load_golden_response(task_name: str, model_key: str) -> Optional[str]:
    """Load a pre-committed golden response from evals/golden/<task_name>/<model_key>.txt.

    Returns None (with a warning) if the file does not exist.
    """
    path = GOLDEN_DIR / task_name / f"{model_key}.txt"
    if not path.exists():
        print(f"    [offline] WARNING: golden file not found: {path.relative_to(REPO_ROOT)}")
        return None
    return path.read_text()


def call_api(
    client: anthropic.Anthropic, model_id: str, system: str, user: str
) -> str:
    msg = client.messages.create(
        model=model_id,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text


def run_task_model(
    client: Optional[anthropic.Anthropic],
    task: dict,
    model_key: str,
    model_id: str,
    structure_only: bool = False,
    offline: bool = False,
) -> Optional[dict]:
    skill = task["skill"]
    task_name = task["name"]
    n_trials = task.get("trials", 3)

    print(f"  [{model_key}] {task_name} ({n_trials} trials)")

    if offline:
        golden = load_golden_response(task_name, model_key)
        if golden is None:
            return None

    skill_md = load_skill_md(skill)
    fixture_name = task.get("input", {}).get("fixture")
    fixture_content = load_fixture(fixture_name) if fixture_name else ""
    system, user = build_prompt(task, skill_md, fixture_content)

    # In offline mode: run code graders once against the single golden response.
    # (quality/model graders are always skipped in offline mode.)
    if offline:
        print(f"    [offline] grading golden response...", end=" ", flush=True)
        code_grades = run_code_graders(golden, task)
        structure_passed = all(g.passed for g in code_grades) if code_grades else True
        status = "pass" if structure_passed else "fail"
        print(f"{status}")
        trial_results = [
            {
                "trial": 1,
                "output_length": len(golden),
                "code_grades": [
                    {"name": g.name, "passed": g.passed, "detail": g.detail}
                    for g in code_grades
                ],
                "quality_grades": [],
                "structure_passed": structure_passed,
                "quality_score": 0.0,
                "quality_max": float(
                    sum(c.get("weight", 1) for c in task.get("expectations", {}).get("quality", []))
                ),
            }
        ]
        metrics = compute_metrics(trial_results)
        return {
            "task": task_name,
            "skill": skill,
            "model": model_key,
            "trials": trial_results,
            **metrics,
        }

    trial_results = []
    for i in range(n_trials):
        print(f"    trial {i + 1}/{n_trials}...", end=" ", flush=True)
        output = call_api(client, model_id, system, user)

        code_grades = run_code_graders(output, task)
        quality_grades = [] if structure_only else run_model_graders(output, task, client)

        structure_passed = all(g.passed for g in code_grades) if code_grades else True
        quality_score = sum(g.score for g in quality_grades)
        quality_max = float(
            sum(c.get("weight", 1) for c in task.get("expectations", {}).get("quality", []))
        )

        trial_results.append(
            {
                "trial": i + 1,
                "output_length": len(output),
                "code_grades": [
                    {"name": g.name, "passed": g.passed, "detail": g.detail}
                    for g in code_grades
                ],
                "quality_grades": [
                    {
                        "name": g.name,
                        "passed": g.passed,
                        "score": g.score,
                        "detail": g.detail,
                    }
                    for g in quality_grades
                ],
                "structure_passed": structure_passed,
                "quality_score": quality_score,
                "quality_max": quality_max,
            }
        )

        status = "pass" if structure_passed else "fail"
        print(f"{status}  (quality {quality_score:.1f}/{quality_max:.1f})")

    metrics = compute_metrics(trial_results)
    return {
        "task": task_name,
        "skill": skill,
        "model": model_key,
        "trials": trial_results,
        **metrics,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="harness-kit skill eval runner")
    parser.add_argument("--skill", help="Limit to one skill (e.g. explain)")
    parser.add_argument(
        "--model",
        choices=list(MODELS.keys()),
        help="Limit to one model",
    )
    parser.add_argument(
        "--structure-only",
        action="store_true",
        help="Run code graders only — no API cost for quality grading",
    )
    parser.add_argument(
        "--include-plugin-evals",
        action="store_true",
        help="Include plugin-author evals from plugins/*/evals/",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Load golden responses from evals/golden/ instead of calling the API",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List tasks that would run without calling any API",
    )
    args = parser.parse_args()

    task_files = discover_tasks(
        skill=args.skill,
        include_plugin_evals=args.include_plugin_evals,
    )
    if not task_files:
        scope = f" for skill '{args.skill}'" if args.skill else ""
        print(f"No tasks found{scope}.")
        sys.exit(0)

    models = {args.model: MODELS[args.model]} if args.model else dict(MODELS)

    if args.dry_run:
        mode = "[offline mode] " if args.offline else ""
        print(f"{mode}Would run {len(task_files)} task(s) × {len(models)} model(s):\n")
        for task_path in task_files:
            task = load_task(task_path)
            for m in models:
                print(
                    f"  {task['skill']}/{task['name']} @ {m}"
                    f"  ({task.get('trials', 3)} trials)"
                )
        return

    if args.offline:
        print("[offline mode] Loading golden responses from evals/golden/ — no API calls will be made.\n")
        client = None
    else:
        client = anthropic.Anthropic()

    all_results = []

    for task_path in task_files:
        task = load_task(task_path)
        print(f"\nTask: {task['skill']}/{task['name']}")
        for model_key, model_id in models.items():
            result = run_task_model(
                client,
                task,
                model_key,
                model_id,
                structure_only=args.structure_only or args.offline,
                offline=args.offline,
            )
            if result is not None:
                all_results.append(result)

    write_results(all_results, RESULTS_DIR / "latest.json")


if __name__ == "__main__":
    main()
