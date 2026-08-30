"""Load/save the public seen-repos operational state."""

from __future__ import annotations

import json
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "seen-repos.json"

_PUBLIC_KEYS = {
    "first_seen",
    "last_checked",
    "stars_at_check",
    "latest_release_at_check",
    "verdict",
    "profile_checked_against",
}


def load_state(path: Path = DEFAULT_PATH) -> dict:
    if not path.exists():
        return {}
    with path.open() as f:
        raw = json.load(f)
    # Defense in depth: old public state may contain profile-derived `reason` fields.
    # Strip unknown fields before the state can flow back into a future public commit.
    return {
        repo: {key: value for key, value in entry.items() if key in _PUBLIC_KEYS}
        for repo, entry in raw.items()
    }


def save_state(state: dict, path: Path = DEFAULT_PATH) -> None:
    sanitized = {
        repo: {key: value for key, value in entry.items() if key in _PUBLIC_KEYS}
        for repo, entry in state.items()
    }
    with path.open("w") as f:
        json.dump(sanitized, f, indent=2, sort_keys=True)
        f.write("\n")
