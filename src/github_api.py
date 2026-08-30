"""Unauthenticated GitHub REST API lookups for repo metadata.

~25 trending repos/day x <=2 calls each stays well under the 60 req/hr unauthenticated limit.
"""

from __future__ import annotations

import requests

API_ROOT = "https://api.github.com"
_HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "RepoRadar/1.0"}


def get_repo_metadata(full_name: str, session: requests.Session | None = None) -> dict:
    """Return {"stars": int, "pushed_at": str|None, "description": str|None}."""
    session = session or requests.Session()
    resp = session.get(f"{API_ROOT}/repos/{full_name}", headers=_HEADERS, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return {
        "stars": data.get("stargazers_count", 0),
        "pushed_at": data.get("pushed_at"),
        "description": data.get("description"),
    }


def get_latest_release(full_name: str, session: requests.Session | None = None) -> str | None:
    """Return the latest release's published_at timestamp, or None if there are no releases."""
    session = session or requests.Session()
    resp = session.get(f"{API_ROOT}/repos/{full_name}/releases/latest", headers=_HEADERS, timeout=15)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json().get("published_at")
