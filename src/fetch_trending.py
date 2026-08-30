"""Fetch today's trending-ish GitHub repos.

Primary path scrapes github.com/trending (the real thing). GitHub's edge has been observed to
403 requests from shared cloud/datacenter egress IPs — like the daily cloud routine's sandbox —
even with browser-like headers, while the identical request succeeds from a residential IP. Since
this pipeline is meant to run unattended from exactly such an IP, an HTTPError falls back to the
official Search API (repos pushed in the last day, sorted by stars): less precise than GitHub's
real trending algorithm (no access to star velocity), but stable and never edge-blocked.
"""

from __future__ import annotations

import datetime as dt

import requests
from bs4 import BeautifulSoup

TRENDING_URL = "https://github.com/trending"
SEARCH_URL = "https://api.github.com/search/repositories"
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
API_HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "RepoRadar/1.0"}


def fetch_trending_repos(session: requests.Session | None = None) -> list[str]:
    """Return today's trending repos as ["owner/repo", ...].

    Falls back to a Search API approximation if the trending page itself is blocked — see the
    module docstring.
    """
    session = session or requests.Session()
    try:
        return _scrape_trending_page(session)
    except requests.exceptions.HTTPError:
        return _search_api_fallback(session)


def _scrape_trending_page(session: requests.Session) -> list[str]:
    resp = session.get(
        TRENDING_URL, params={"since": "daily"}, timeout=15, headers=BROWSER_HEADERS
    )
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    repos = []
    for article in soup.select("article.Box-row"):
        link = article.select_one("h2 a")
        if link is None or not link.get("href"):
            continue
        full_name = link["href"].strip("/")
        if full_name.count("/") == 1:
            repos.append(full_name)
    return repos


def _search_api_fallback(session: requests.Session, limit: int = 25) -> list[str]:
    since = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    resp = session.get(
        SEARCH_URL,
        params={"q": f"pushed:>{since}", "sort": "stars", "order": "desc", "per_page": limit},
        headers=API_HEADERS,
        timeout=15,
    )
    resp.raise_for_status()
    return [item["full_name"] for item in resp.json().get("items", [])]
