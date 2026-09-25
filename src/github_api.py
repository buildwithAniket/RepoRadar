"""GitHub API helpers for RepoRadar V3.

Minimal, read-only calls:
- Repository metadata (stars, description)
- Latest release published_at

Uses lazy fetching — only called for repos that passed the diff engine.
"""

from __future__ import annotations

from typing import TypedDict

import requests

GH_BASE = "https://api.github.com"
UA = "RepoRadarV3Agent"


class RepoMeta(TypedDict):
    stars: int
    description: str


def _headers() -> dict[str, str]:
    return {"User-Agent": UA, "Accept": "application/vnd.github+json"}


def get_repo_metadata(full_name: str) -> RepoMeta:
    """Return ``stars`` and ``description`` for *full_name* (owner/name)."""
    from logger import log

    url = f"{GH_BASE}/repos/{full_name}"
    try:
        resp = requests.get(url, headers=_headers(), timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            meta: RepoMeta = {
                "stars": data.get("stargazers_count", 0),
                "description": (data.get("description") or "").strip(),
            }
            log.debug("API metadata for %s: %d★", full_name, meta["stars"])
            return meta
        log.warning("GitHub API returned %d for %s", resp.status_code, full_name)
    except Exception as e:
        log.error("GitHub API metadata failed for %s: %s", full_name, e)
    return RepoMeta(stars=0, description="")


def get_latest_release(full_name: str) -> str | None:
    """Return the ``published_at`` timestamp of the latest release, or None."""
    from logger import log

    url = f"{GH_BASE}/repos/{full_name}/releases/latest"
    try:
        resp = requests.get(url, headers=_headers(), timeout=10)
        if resp.status_code == 200:
            published = resp.json().get("published_at")
            log.debug("API release for %s: %s", full_name, published)
            return published
        if resp.status_code == 404:
            log.debug("No releases for %s", full_name)
            return None
        log.warning("GitHub API releases returned %d for %s", resp.status_code, full_name)
    except Exception as e:
        log.error("GitHub API release failed for %s: %s", full_name, e)
    return None
