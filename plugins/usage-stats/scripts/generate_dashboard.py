#!/usr/bin/env python3
"""Aggregate Claude Code usage data and produce an interactive HTML dashboard.

Reads from:
  ~/.claude/stats-cache.json   – pre-computed daily totals
  ~/.claude/projects/*/‌*.jsonl  – session transcripts
  ~/.claude/history.jsonl      – command history (sessionId → project mapping)

Outputs a self-contained HTML file with embedded JSON data.

Python 3.10+ stdlib only — no pip dependencies.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Model name shortening
# ---------------------------------------------------------------------------

def shorten_model(name: str) -> str:
    """Strip 'claude-' prefix and date suffixes from model identifiers.

    Examples:
        claude-opus-4-6             → opus-4-6
        claude-sonnet-4-5-20250929  → sonnet-4-5
        claude-haiku-4-5-20251001   → haiku-4-5
        qwen2.5:7b                  → qwen2.5:7b
    """
    if not name.startswith("claude-"):
        return name
    short = name[len("claude-"):]
    # Trim everything from the second occurrence of "-202" onward.
    # The *first* "-202" might be part of the model id itself (unlikely today
    # but we follow the spec literally: "second -202").
    idx = short.find("-202")
    if idx != -1:
        short = short[:idx]
    return short


# ---------------------------------------------------------------------------
# Project name helpers
# ---------------------------------------------------------------------------

def decode_project_dir(dirname: str) -> str:
    """Convert an encoded directory name back to a filesystem path.

    '-Users-john-repos-harness-kit' → '/Users/john/repos/harness-kit'
    """
    if dirname.startswith("-"):
        return "/" + dirname[1:].replace("-", "/")
    return dirname.replace("-", "/")


def shorten_project(full_path: str) -> str:
    """Derive a human-friendly short name from a project path.

    Strips the user's home prefix and returns the last meaningful segment(s).
    """
    home = os.path.expanduser("~")
    rel = full_path
    if rel.startswith(home):
        rel = rel[len(home):]
    # Take last non-empty segment
    parts = [p for p in rel.split("/") if p]
    if parts:
        return parts[-1]
    return full_path


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_stats_cache(claude_dir: Path) -> dict | None:
    cache_path = claude_dir / "stats-cache.json"
    if not cache_path.exists():
        return None
    try:
        with open(cache_path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"Warning: could not read stats-cache.json: {exc}", file=sys.stderr)
        return None


def load_history(claude_dir: Path) -> tuple[dict[str, str], dict[str, str]]:
    """Return (sessionId → project_path, encoded_dir → real_path) from history.jsonl."""
    session_map: dict[str, str] = {}
    dir_map: dict[str, str] = {}
    history_path = claude_dir / "history.jsonl"
    if not history_path.exists():
        return session_map, dir_map
    try:
        with open(history_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    sid = entry.get("sessionId")
                    proj = entry.get("project")
                    if sid and proj:
                        session_map[sid] = proj
                        # Build encoded dir name → real path mapping
                        # Claude Code encodes paths by replacing / and _ with -
                        encoded = proj.replace("/", "-").replace("_", "-")
                        dir_map[encoded] = proj
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return session_map, dir_map


# ---------------------------------------------------------------------------
# JSONL scanning
# ---------------------------------------------------------------------------

def scan_jsonl_files(
    claude_dir: Path,
    start_date: date,
    end_date: date,
    session_project_map: dict[str, str],
    dir_project_map: dict[str, str] | None = None,
) -> dict:
    """Scan session JSONL files and return aggregated data.

    Returns dict with keys:
        daily        – {date_str: {messages, sessions set, toolCalls,
                        outputTokens, inputTokens, cacheReadTokens,
                        tokensByModel}}
        projects     – {full_path: {sessions set, outputTokens, messages}}
        hourly       – {hour_int: count}
        sessions     – {session_id: {project, date, messages, outputTokens,
                        primaryModel, toolCalls, tokensByModel}}
    """
    daily: dict[str, dict] = defaultdict(lambda: {
        "messages": 0,
        "sessions": set(),
        "toolCalls": 0,
        "outputTokens": 0,
        "inputTokens": 0,
        "cacheReadTokens": 0,
        "tokensByModel": defaultdict(int),
    })
    projects: dict[str, dict] = defaultdict(lambda: {
        "sessions": set(),
        "outputTokens": 0,
        "messages": 0,
    })
    hourly: dict[int, int] = defaultdict(int)
    sessions: dict[str, dict] = {}

    projects_dir = claude_dir / "projects"
    if not projects_dir.is_dir():
        return {"daily": daily, "projects": projects, "hourly": hourly, "sessions": sessions}

    # Collect all JSONL files, skipping subagents dirs
    jsonl_files: list[tuple[Path, str]] = []  # (path, project_dir_name)
    start_ts = datetime(start_date.year, start_date.month, start_date.day).timestamp()

    for proj_entry in projects_dir.iterdir():
        if not proj_entry.is_dir():
            continue
        proj_dir_name = proj_entry.name
        for item in proj_entry.iterdir():
            if item.is_dir() and item.name == "subagents":
                continue
            if item.is_dir():
                continue
            if not item.name.endswith(".jsonl"):
                continue
            # Skip files last modified before start_date
            try:
                mtime = os.path.getmtime(item)
                if mtime < start_ts:
                    continue
            except OSError:
                continue
            jsonl_files.append((item, proj_dir_name))

    print(f"Scanning {len(jsonl_files)} files...", file=sys.stderr)

    start_str = start_date.isoformat()
    end_str = end_date.isoformat()

    for filepath, proj_dir_name in jsonl_files:
        # Derive project full path from dir name
        # First try the history-based mapping (preserves hyphens in real paths)
        if dir_project_map and proj_dir_name in dir_project_map:
            proj_full_path = dir_project_map[proj_dir_name]
        else:
            proj_full_path = decode_project_dir(proj_dir_name)

        try:
            with open(filepath) as f:
                for line in f:
                    # Quick pre-filter before JSON parsing
                    is_assistant = '"type":"assistant"' in line or '"type": "assistant"' in line
                    is_human = '"type":"human"' in line or '"type": "human"' in line
                    if not is_assistant and not is_human:
                        continue

                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        print(f"Warning: malformed JSONL line in {filepath}", file=sys.stderr)
                        continue

                    entry_type = entry.get("type")
                    if entry_type not in ("assistant", "human"):
                        continue

                    ts_str = entry.get("timestamp", "")
                    if not ts_str or len(ts_str) < 10:
                        continue

                    entry_date = ts_str[:10]  # YYYY-MM-DD
                    if entry_date < start_str or entry_date > end_str:
                        continue

                    session_id = entry.get("sessionId", "")

                    # Resolve project from history mapping if possible
                    resolved_path = session_project_map.get(session_id, proj_full_path)

                    # Parse hour from timestamp
                    try:
                        hour = int(ts_str[11:13])
                    except (ValueError, IndexError):
                        hour = 0

                    day = daily[entry_date]
                    day["messages"] += 1
                    if session_id:
                        day["sessions"].add(session_id)
                    hourly[hour] += 1

                    # Project tracking
                    proj_data = projects[resolved_path]
                    proj_data["messages"] += 1
                    if session_id:
                        proj_data["sessions"].add(session_id)

                    # Session tracking
                    if session_id and session_id not in sessions:
                        sessions[session_id] = {
                            "project": shorten_project(resolved_path),
                            "date": entry_date,
                            "messages": 0,
                            "outputTokens": 0,
                            "primaryModel": "",
                            "toolCalls": 0,
                            "tokensByModel": defaultdict(int),
                        }
                    if session_id:
                        sessions[session_id]["messages"] += 1

                    if entry_type == "assistant":
                        msg = entry.get("message", {})
                        if not isinstance(msg, dict):
                            continue

                        model = msg.get("model", "")
                        short_model = shorten_model(model) if model else ""
                        usage = msg.get("usage", {})
                        if not isinstance(usage, dict):
                            usage = {}

                        out_tok = usage.get("output_tokens", 0) or 0
                        in_tok = usage.get("input_tokens", 0) or 0
                        cache_tok = usage.get("cache_read_input_tokens", 0) or 0

                        day["outputTokens"] += out_tok
                        day["inputTokens"] += in_tok
                        day["cacheReadTokens"] += cache_tok
                        if short_model:
                            day["tokensByModel"][short_model] += out_tok

                        proj_data["outputTokens"] += out_tok

                        if session_id and session_id in sessions:
                            sessions[session_id]["outputTokens"] += out_tok
                            if short_model:
                                sessions[session_id]["tokensByModel"][short_model] += out_tok

                        # Count tool_use blocks
                        content = msg.get("content", [])
                        if isinstance(content, list):
                            tc = sum(1 for c in content if isinstance(c, dict) and c.get("type") == "tool_use")
                            day["toolCalls"] += tc
                            if session_id and session_id in sessions:
                                sessions[session_id]["toolCalls"] += tc

        except OSError as exc:
            print(f"Warning: could not read {filepath}: {exc}", file=sys.stderr)
            continue

    # Determine primary model for each session
    for sid, sdata in sessions.items():
        tbm = sdata["tokensByModel"]
        if tbm:
            sdata["primaryModel"] = max(tbm, key=tbm.get)  # type: ignore[arg-type]

    return {"daily": daily, "projects": projects, "hourly": hourly, "sessions": sessions}


# ---------------------------------------------------------------------------
# Report assembly
# ---------------------------------------------------------------------------

def build_report(
    start_date: date,
    end_date: date,
    cache: dict | None,
    scanned: dict,
) -> dict[str, Any]:
    """Merge cached and scanned data into the final report structure."""

    cache_through: str | None = None
    if cache:
        cache_through = cache.get("lastComputedDate")

    # Build daily array
    daily_list: list[dict] = []
    all_dates: set[str] = set()

    # Cached daily data
    if cache and cache_through:
        cached_activity = {d["date"]: d for d in cache.get("dailyActivity", [])}
        cached_tokens = {d["date"]: d for d in cache.get("dailyModelTokens", [])}

        d = start_date
        while d.isoformat() <= cache_through and d <= end_date:
            ds = d.isoformat()
            act = cached_activity.get(ds)
            tok = cached_tokens.get(ds)
            if act:
                all_dates.add(ds)
                tokens_by_model_raw = tok.get("tokensByModel", {}) if tok else {}
                tokens_by_model = {shorten_model(k): v for k, v in tokens_by_model_raw.items()}
                primary = max(tokens_by_model, key=tokens_by_model.get) if tokens_by_model else ""  # type: ignore[arg-type]
                daily_list.append({
                    "date": ds,
                    "messages": act.get("messageCount", 0),
                    "sessions": act.get("sessionCount", 0),
                    "toolCalls": act.get("toolCallCount", 0),
                    "outputTokens": 0,  # cache doesn't have per-day output tokens
                    "inputTokens": 0,
                    "cacheReadTokens": 0,
                    "primaryModel": primary,
                    "tokensByModel": tokens_by_model,
                })
            d += timedelta(days=1)

    # Scanned daily data — for dates beyond cache
    scanned_daily = scanned["daily"]
    for ds in sorted(scanned_daily.keys()):
        if ds < start_date.isoformat() or ds > end_date.isoformat():
            continue
        # Skip dates already covered by cache
        if cache_through and ds <= cache_through:
            continue
        all_dates.add(ds)
        day = scanned_daily[ds]
        tbm = dict(day["tokensByModel"])
        primary = max(tbm, key=tbm.get) if tbm else ""  # type: ignore[arg-type]
        daily_list.append({
            "date": ds,
            "messages": day["messages"],
            "sessions": len(day["sessions"]),
            "toolCalls": day["toolCalls"],
            "outputTokens": day["outputTokens"],
            "inputTokens": day["inputTokens"],
            "cacheReadTokens": day["cacheReadTokens"],
            "primaryModel": primary,
            "tokensByModel": tbm,
        })

    daily_list.sort(key=lambda x: x["date"])

    # Summary
    total_messages = sum(d["messages"] for d in daily_list)
    total_sessions = sum(d["sessions"] for d in daily_list)
    total_tool_calls = sum(d["toolCalls"] for d in daily_list)
    total_output = sum(d["outputTokens"] for d in daily_list)
    total_input = sum(d["inputTokens"] for d in daily_list)
    total_cache = sum(d["cacheReadTokens"] for d in daily_list)
    days_in_range = (end_date - start_date).days + 1
    days_active = len(all_dates)

    avg_msg = total_messages / days_active if days_active else 0

    busiest = max(daily_list, key=lambda x: x["messages"]) if daily_list else {"date": "", "messages": 0}
    # Quietest among days with > 0 messages
    active_days = [d for d in daily_list if d["messages"] > 0]
    quietest = min(active_days, key=lambda x: x["messages"]) if active_days else {"date": "", "messages": 0}

    # Model split — aggregate across all daily
    model_agg: dict[str, dict] = defaultdict(lambda: {
        "outputTokens": 0, "inputTokens": 0, "messages": 0,
    })
    for d in daily_list:
        for model, out_tok in d["tokensByModel"].items():
            model_agg[model]["outputTokens"] += out_tok
    # Also aggregate from scanned sessions for message counts per model
    for sid, sdata in scanned["sessions"].items():
        for model, out_tok in sdata["tokensByModel"].items():
            model_agg[model]["messages"] += sdata["messages"] if model == sdata.get("primaryModel") else 0
            # outputTokens already counted above for scanned dates
    # For input tokens, we don't have per-model breakdown from cache
    # Use scanned data for what we can
    for ds, day in scanned["daily"].items():
        if cache_through and ds <= cache_through:
            continue
        if ds < start_date.isoformat() or ds > end_date.isoformat():
            continue
        # inputTokens not split by model in our data, skip per-model input

    total_model_output = sum(m["outputTokens"] for m in model_agg.values())
    model_split = []
    for model, data in sorted(model_agg.items(), key=lambda x: x[1]["outputTokens"], reverse=True):
        if data["outputTokens"] == 0 and data["messages"] == 0:
            continue
        pct = (data["outputTokens"] / total_model_output * 100) if total_model_output else 0
        model_split.append({
            "model": model,
            "outputTokens": data["outputTokens"],
            "inputTokens": data["inputTokens"],
            "percentage": round(pct, 1),
            "messages": data["messages"],
        })

    # Project split — from scanned data only
    project_split = []
    for full_path, pdata in sorted(scanned["projects"].items(), key=lambda x: x[1]["outputTokens"], reverse=True):
        project_split.append({
            "project": shorten_project(full_path),
            "fullPath": full_path,
            "sessions": len(pdata["sessions"]),
            "outputTokens": pdata["outputTokens"],
            "messages": pdata["messages"],
        })

    # Hourly distribution
    hourly_dist = {str(h): c for h, c in scanned["hourly"].items()}

    # Sessions list
    sessions_list = []
    for sid, sdata in scanned["sessions"].items():
        sessions_list.append({
            "id": sid,
            "project": sdata["project"],
            "date": sdata["date"],
            "messages": sdata["messages"],
            "outputTokens": sdata["outputTokens"],
            "primaryModel": sdata["primaryModel"],
            "toolCalls": sdata["toolCalls"],
        })
    sessions_list.sort(key=lambda x: (x["date"], x["messages"]), reverse=True)

    return {
        "meta": {
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "daysInRange": days_in_range,
            "daysActive": days_active,
            "cacheCoversThrough": cache_through,
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
        },
        "daily": daily_list,
        "summary": {
            "totalMessages": total_messages,
            "totalSessions": total_sessions,
            "totalToolCalls": total_tool_calls,
            "totalOutputTokens": total_output,
            "totalInputTokens": total_input,
            "totalCacheReadTokens": total_cache,
            "avgMessagesPerDay": round(avg_msg),
            "busiestDay": {"date": busiest["date"], "messages": busiest["messages"]},
            "quietestDay": {"date": quietest["date"], "messages": quietest["messages"]},
        },
        "modelSplit": model_split,
        "projectSplit": project_split,
        "hourlyDistribution": hourly_dist,
        "sessions": sessions_list,
    }


# ---------------------------------------------------------------------------
# HTML injection
# ---------------------------------------------------------------------------

PLACEHOLDER = "/*__DASHBOARD_DATA__*/ {} /*__END__*/"


def inject_into_template(report: dict, script_dir: Path) -> str:
    """Read the HTML template and inject the report JSON."""
    template_path = script_dir.parent / "assets" / "dashboard.html"
    if not template_path.exists():
        print(f"Error: template not found at {template_path}", file=sys.stderr)
        sys.exit(1)

    template = template_path.read_text()

    if PLACEHOLDER not in template:
        print("Error: placeholder string not found in template", file=sys.stderr)
        sys.exit(1)

    data_json = json.dumps(report)
    replacement = f"/*__DASHBOARD_DATA__*/ {data_json} /*__END__*/"
    return template.replace(PLACEHOLDER, replacement)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Claude Code usage dashboard",
    )
    parser.add_argument(
        "--start",
        type=str,
        default=None,
        help="Start date YYYY-MM-DD (default: 14 days ago)",
    )
    parser.add_argument(
        "--end",
        type=str,
        default=None,
        help="End date YYYY-MM-DD (default: today)",
    )
    parser.add_argument(
        "--range",
        type=str,
        default=None,
        choices=["week", "month", "30d", "14d", "all"],
        help="Preset range (overrides --start)",
    )
    parser.add_argument(
        "--claude-dir",
        type=str,
        default=None,
        help="Override ~/.claude location",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output HTML path (default: /tmp/claude-usage-YYYY-MM-DD.html)",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Don't auto-open browser",
    )
    return parser.parse_args()


def resolve_dates(args: argparse.Namespace, cache: dict | None) -> tuple[date, date]:
    """Compute (start_date, end_date) from CLI arguments."""
    today = date.today()
    end_date = today
    if args.end:
        end_date = date.fromisoformat(args.end)

    if args.range:
        presets = {
            "week": 7,
            "14d": 14,
            "30d": 30,
            "month": 30,
        }
        if args.range == "all":
            # Go back to first known date
            if cache and cache.get("firstSessionDate"):
                first = cache["firstSessionDate"]
                start_date = date.fromisoformat(first[:10])
            elif cache and cache.get("dailyActivity"):
                dates = [d["date"] for d in cache["dailyActivity"]]
                start_date = date.fromisoformat(min(dates))
            else:
                start_date = today - timedelta(days=365)
        else:
            start_date = end_date - timedelta(days=presets[args.range] - 1)
    elif args.start:
        start_date = date.fromisoformat(args.start)
    else:
        start_date = end_date - timedelta(days=13)  # 14 days inclusive

    return start_date, end_date


def main() -> None:
    t0 = time.monotonic()
    args = parse_args()

    # Resolve Claude directory
    claude_dir = Path(args.claude_dir) if args.claude_dir else Path.home() / ".claude"
    if not claude_dir.is_dir():
        print(f"Error: Claude directory not found at {claude_dir}", file=sys.stderr)
        sys.exit(1)

    # Load cache
    cache = load_stats_cache(claude_dir)

    # Resolve date range
    start_date, end_date = resolve_dates(args, cache)
    print(f"Date range: {start_date} to {end_date}", file=sys.stderr)

    # Determine which dates the cache covers vs which need scanning
    cache_through: date | None = None
    if cache and cache.get("lastComputedDate"):
        cache_through = date.fromisoformat(cache["lastComputedDate"])

    # We always scan for project breakdown, hourly, and sessions.
    # But for daily aggregates, we use cache for dates <= cache_through.
    # Scan start = max(start_date, cache_through + 1) for daily merging,
    # but we scan ALL dates for project/session/hourly data.

    # Load history mapping
    session_project_map, dir_project_map = load_history(claude_dir)

    # Scan JSONL files for the full date range
    scanned = scan_jsonl_files(claude_dir, start_date, end_date, session_project_map, dir_project_map)

    # Build report
    report = build_report(start_date, end_date, cache, scanned)

    # Inject into template
    script_dir = Path(__file__).resolve().parent
    html = inject_into_template(report, script_dir)

    # Write output
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = Path(f"/tmp/claude-usage-{date.today().isoformat()}.html")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html)

    elapsed = time.monotonic() - t0
    print(f"Dashboard written to {output_path}", file=sys.stderr)
    print(f"Done in {elapsed:.1f}s", file=sys.stderr)

    # Open in browser
    if not args.no_open:
        system = platform.system()
        if system == "Darwin":
            subprocess.run(["open", str(output_path)])
        elif system == "Linux":
            subprocess.run(["xdg-open", str(output_path)])


if __name__ == "__main__":
    main()
