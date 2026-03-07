#!/usr/bin/env python3
"""Rebuild research/INDEX.md from synthesis file frontmatter.

Scans all synthesis files in research/**/*.md, extracts metadata from
YAML frontmatter (preferred) or inline bold fields (fallback), and
regenerates INDEX.md with a Tags column.

Requires Python 3.10+ (uses X | Y union type hints).

Usage:
    python3 scripts/rebuild-research-index.py
    python3 scripts/rebuild-research-index.py --dry-run
"""
import sys
import re
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: PyYAML required. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

RESEARCH_DIR = Path.cwd() / "research"
INDEX_PATH = RESEARCH_DIR / "INDEX.md"

SKIP_FILES = {"INDEX.md", "README.md", "TEMPLATE.md", "ROADMAP.md",
              "ORGANIZATION_IMPROVEMENTS.md", "UNSYNTHESIZED.md"}


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Extract YAML frontmatter and remaining content. Returns ({}, content) if none."""
    if not content.startswith("---\n"):
        return {}, content
    end = content.find("\n---\n", 4)  # start search after opening "---\n" (4 chars)
    if end == -1:
        return {}, content
    fm_text = content[4:end]          # skip opening "---\n"
    try:
        fm = yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        fm = {}
    return fm, content[end + 5:]      # skip past "\n---\n" (5 chars)


def extract_inline_field(content: str, field: str) -> str | None:
    """Extract value from bold inline field like **Field:** value"""
    # Matches both **Field:** value and **Field**: value styles;
    # [:\*]+ consumes the colon and/or closing asterisks of the bold span.
    pattern = rf"\*\*{re.escape(field)}[:\*]+\*?\*?\s*([^\n]+)"
    m = re.search(pattern, content, re.IGNORECASE)
    return m.group(1).strip() if m else None


def extract_h1(content: str) -> str:
    """Extract first H1 heading text."""
    m = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    return m.group(1).strip() if m else "Unknown"


def extract_source_url(content: str) -> str:
    """Extract source URL from References section or inline Source field."""
    m = re.search(r"\*\*Original URL\*\*:?\s*(\S+)", content)
    if m:
        return m.group(1).strip()
    val = extract_inline_field(content, "Source")
    if val:
        link_m = re.match(r"\[.*?\]\((.+?)\)", val)
        return link_m.group(1) if link_m else val
    return ""


def extract_date(fm: dict, content: str) -> str:
    """Extract date from frontmatter or inline fields."""
    if "date" in fm:
        d = fm["date"]
        return str(d) if d else ""
    for field in ("Synthesized", "Researched", "Extracted"):
        val = extract_inline_field(content, field)
        if val:
            m = re.search(r"(\d{4}-\d{2}-\d{2})", val)
            return m.group(1) if m else val
    return ""


def format_tags(tags: list[str]) -> str:
    """Format tag list as backtick-quoted comma-separated string for INDEX.md."""
    if not tags:
        return ""
    return ", ".join(f"`{t}`" for t in sorted(tags))


def get_category(filepath: Path) -> str:
    return filepath.parent.name


def get_relative_synthesis_path(filepath: Path) -> str:
    rel = filepath.relative_to(RESEARCH_DIR)
    return f"`research/{rel}`"


def scan_synthesis_files() -> list[dict]:
    rows = []
    for md_file in sorted(RESEARCH_DIR.rglob("*.md")):
        if md_file.name in SKIP_FILES:
            continue
        if md_file.parent == RESEARCH_DIR:
            continue
        content = md_file.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(content)

        name = extract_h1(body if fm else content)
        if name == "Unknown":
            print(f"Warning: no H1 in {md_file.relative_to(RESEARCH_DIR.parent)}", file=sys.stderr)
        category = get_category(md_file)
        date_str = extract_date(fm, content)
        source = fm.get("source", "") or extract_source_url(content)
        tags = fm.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",")]
        synthesis_path = get_relative_synthesis_path(md_file)

        rows.append({
            "name": name,
            "category": category,
            "date": date_str,
            "source": source,
            "tags": tags,
            "synthesis": synthesis_path,
            "filepath": md_file,
        })

    rows.sort(key=lambda r: (r["date"] or "0000-00-00"), reverse=True)
    return rows


def _escape_pipes(s: str) -> str:
    return s.replace("|", "\\|")


def build_index(rows: list[dict]) -> str:
    lines = [
        "# Research Index\n",
        "| Name | Category | Date | Source | Tags | Synthesis |",
        "|------|----------|------|--------|------|-----------|",
    ]
    for row in rows:
        name = row["name"]
        cat = row["category"]
        d = row["date"]
        src = row["source"]
        tags_str = format_tags(row["tags"])
        synth = row["synthesis"]
        lines.append(f"| {_escape_pipes(name)} | {cat} | {d} | {_escape_pipes(src)} | {tags_str} | {synth} |")
    return "\n".join(lines) + "\n"


def main():
    dry_run = "--dry-run" in sys.argv
    rows = scan_synthesis_files()
    index_content = build_index(rows)

    if dry_run:
        print(f"Would write {len(rows)} rows to {INDEX_PATH}")
        print(index_content[:2000])
        return

    INDEX_PATH.write_text(index_content, encoding="utf-8")
    print(f"Rebuilt INDEX.md: {len(rows)} entries")

    missing = [r for r in rows if not r["tags"]]
    if missing:
        print(f"\nEntries missing tags ({len(missing)}):")
        for r in missing:
            print(f"  {r['filepath'].relative_to(RESEARCH_DIR.parent)}")


if __name__ == "__main__":
    main()
