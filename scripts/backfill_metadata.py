#!/usr/bin/env python3
"""Backfill description and language metadata for existing entries in seen-repos.json.

This script:
1. Iterates through seen-repos.json entries that lack a "description" key
2. Fetches metadata via `gh api repos/<owner>/<repo> --jq '{description, language}'`
3. Truncates description to 300 chars + "..." matching scan.py's logic
4. Updates entries and saves state with the exact same serialization as state.py

Features:
- --dry-run flag to preview changes without saving
- Carries forward unchanged entries
- Prints warnings for non-zero exits (404, renamed, etc.)
- Asserts entry count is unchanged before saving
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from state import load_state, save_state  # noqa: E402

DESCRIPTION_MAX_LEN = 300
REPO_ROOT = Path(__file__).resolve().parent.parent
STATE_PATH = REPO_ROOT / "seen-repos.json"


def _truncate_description(description: str | None) -> str | None:
    """Truncate description to 300 chars + '...' matching scan.py's logic."""
    if description is None or len(description) <= DESCRIPTION_MAX_LEN:
        return description
    return description[:DESCRIPTION_MAX_LEN] + "..."


def _fetch_metadata(full_name: str) -> dict | None:
    """Fetch repo metadata via gh CLI. Returns {description, language} or None on error."""
    try:
        result = subprocess.run(
            ["gh", "api", f"repos/{full_name}", "--jq", "{description: .description, language: .language}"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            print(f"warning: skipping {full_name} (gh api returned {result.returncode})", file=sys.stderr)
            return None
        data = json.loads(result.stdout)
        return {
            "description": _truncate_description(data.get("description")),
            "language": data.get("language"),
        }
    except (json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        print(f"warning: skipping {full_name} ({exc})", file=sys.stderr)
        return None


def backfill(dry_run: bool = False) -> dict:
    """Backfill metadata and return stats: {total, with_description, with_language, failures}."""
    state = load_state(STATE_PATH)
    original_count = len(state)
    stats = {
        "total": original_count,
        "with_description": 0,
        "with_language": 0,
        "failures": [],
    }

    for full_name, entry in state.items():
        # Skip entries that already have description
        if "description" in entry:
            stats["with_description"] += 1
            if entry.get("language"):
                stats["with_language"] += 1
            continue

        # Fetch metadata
        metadata = _fetch_metadata(full_name)
        if metadata is None:
            stats["failures"].append(full_name)
            continue

        # Update entry
        entry["description"] = metadata["description"]
        entry["language"] = metadata["language"]
        stats["with_description"] += 1
        if entry.get("language"):
            stats["with_language"] += 1
        print(f"backfilled {full_name}")

    # Verify entry count unchanged
    assert len(state) == original_count, (
        f"entry count changed: {original_count} -> {len(state)}"
    )

    # Save if not dry-run
    if not dry_run:
        save_state(state, STATE_PATH)
        print(f"saved {len(state)} entries to {STATE_PATH}")
    else:
        print(f"[dry-run] would save {len(state)} entries to {STATE_PATH}")

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill description and language metadata for seen-repos.json"
    )
    parser.add_argument("--dry-run", action="store_true", help="preview changes without saving")
    args = parser.parse_args()

    stats = backfill(dry_run=args.dry_run)

    print()
    print(f"Results:")
    print(f"  Total repos: {stats['total']}")
    print(f"  With description: {stats['with_description']}")
    print(f"  With language: {stats['with_language']}")
    print(f"  Failures: {len(stats['failures'])}")
    if stats["failures"]:
        print(f"  Failed repos: {', '.join(stats['failures'])}")


if __name__ == "__main__":
    main()
