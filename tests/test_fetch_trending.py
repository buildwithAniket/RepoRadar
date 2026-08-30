"""Tests for fetch_trending's scrape-first, search-API-fallback behavior."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from fetch_trending import fetch_trending_repos  # noqa: E402

SAMPLE_TRENDING_HTML = """
<html><body>
<article class="Box-row"><h2><a href="/octo/first">octo / first</a></h2></article>
<article class="Box-row"><h2><a href="/octo/second">octo / second</a></h2></article>
</body></html>
"""


def _mock_response(status_code: int = 200, json_data: dict | None = None, text: str = ""):
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.json.return_value = json_data or {}
    if status_code >= 400:
        resp.raise_for_status.side_effect = requests.exceptions.HTTPError(
            f"{status_code} error", response=resp
        )
    else:
        resp.raise_for_status.side_effect = None
    return resp


def test_scrapes_trending_page_when_reachable():
    session = MagicMock()
    session.get.return_value = _mock_response(text=SAMPLE_TRENDING_HTML)

    assert fetch_trending_repos(session) == ["octo/first", "octo/second"]
    session.get.assert_called_once()
    assert session.get.call_args[0][0] == "https://github.com/trending"


def test_falls_back_to_search_api_on_blocked_scrape():
    session = MagicMock()
    blocked = _mock_response(status_code=403)
    fallback = _mock_response(
        json_data={"items": [{"full_name": "octo/from-search"}, {"full_name": "octo/other"}]}
    )
    session.get.side_effect = [blocked, fallback]

    result = fetch_trending_repos(session)

    assert result == ["octo/from-search", "octo/other"]
    assert session.get.call_count == 2
    assert "api.github.com/search/repositories" in session.get.call_args_list[1][0][0]
