"""Persistent state management for RepoRadar V3.

Loads/saves seen-repos.json with optional TTL-based pruning to prevent
unbounded growth over time.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import TypedDict

STATE_FILE = Path("seen-repos.json")


# A single repo's state record.
class RepoState(TypedDict, total=False):
    first_seen: str
    last_checked: str
    stars_at_check: int
    latest_release_at_check: str | None
    verdict: str
    reason: str
    profile_checked_against: str


def load_state() -> dict[str, RepoState]:
    if STATE_FILE.is_file():
        try:
            with STATE_FILE.open("r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            from logger import log

            log.error("seen-repos.json is corrupt; starting with empty state")
            return {}
    return {}


def save_state(state: dict[str, RepoState]) -> None:
    with STATE_FILE.open("w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, sort_keys=True)
        f.write("\n")


def prune_state(
    state: dict[str, RepoState],
    *,
    max_age_days: int = 90,
    max_entries: int = 0,
) -> dict[str, RepoState]:
    """Return a pruned copy of *state*.

    - Drops entries whose ``last_checked`` is older than *max_age_days*.
    - If *max_entries* > 0, keeps only the newest *max_entries* by
      ``last_checked`` after the age filter.
    """
    from logger import log

    if max_age_days <= 0 and max_entries <= 0:
        return state

    today = date.today()
    cutoff = today - timedelta(days=max_age_days)

    # Age filter
    if max_age_days > 0:
        before = len(state)
        state = {k: v for k, v in state.items() if _parse_date(v.get("last_checked", "")) >= cutoff}
        pruned = before - len(state)
        if pruned:
            log.info("Pruned %d stale entries (older than %d days)", pruned, max_age_days)

    # Count cap
    if max_entries > 0 and len(state) > max_entries:
        before = len(state)
        # Sort by last_checked descending, keep newest max_entries
        ordered = sorted(
            state.items(),
            key=lambda kv: _parse_date(kv[1].get("last_checked", "1970-01-01")),
            reverse=True,
        )
        state = dict(ordered[:max_entries])
        pruned = before - len(state)
        log.info("Pruned %d entries to stay under max_entries=%d", pruned, max_entries)

    return state


def _parse_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except (ValueError, TypeError):
        return date(1970, 1, 1)
