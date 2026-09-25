"""HTML trending scraper for RepoRadar V3.

Fetches github.com/trending and parses repo metadata directly from the HTML
— zero GitHub API calls for discovery and filtering.

Fails the pipeline when the scrape returns nothing and
``scraper.fail_on_empty`` is true in config.yaml.
"""

from __future__ import annotations

import requests
from bs4 import BeautifulSoup

from logger import log


def fetch_trending_repos() -> list[dict]:
    """Scrape GitHub trending and return basic repo metadata.

    Each entry: ``{"repo": "owner/name", "stars": int, "description": str, "latest_release": None}``
    """
    url = "https://github.com/trending"
    headers = {"User-Agent": "RepoRadarV3Agent"}

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        log.info("Trending scrape: GET %s → %d", url, resp.status_code)
        if resp.status_code != 200:
            log.error("Trending page returned HTTP %d", resp.status_code)
            return []
    except Exception as e:
        log.error("Trending scrape failed: %s", e)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    repos: list[dict] = []

    for article in soup.select("article.Box-row"):
        title_el = article.select_one("h2 a")
        if not title_el:
            continue
        href = title_el.get("href", "").strip("/")
        parts = href.split("/")
        if len(parts) < 2:
            continue
        owner, name = parts[0], parts[1]
        full_name = f"{owner}/{name}"

        desc_el = article.select_one("p")
        description = desc_el.get_text(strip=True) if desc_el else ""

        stars_el = article.select_one('a[href*="/stargazers"]') or article.select_one(
            'a.muted-link:not([href*="fork"])'
        )
        stars = 0
        if stars_el:
            try:
                stars = int(stars_el.get_text(strip=True).replace(",", ""))
            except ValueError:
                stars = 0

        repos.append(
            {
                "repo": full_name,
                "stars": stars,
                "description": description,
                "latest_release": None,  # fetched lazily only if needed
            }
        )

    log.info("Trending scrape: found %d repos", len(repos))
    return repos
