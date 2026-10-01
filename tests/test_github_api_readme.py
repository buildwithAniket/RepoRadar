"""Tests for github_api.get_readme_excerpt (raw.githubusercontent.com, no token)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parent.parent
for p in (REPO_ROOT, REPO_ROOT / "src"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import github_api  # noqa: E402


def _resp(status: int, text: str = "") -> MagicMock:
    r = MagicMock()
    r.status_code = status
    r.text = text
    return r


def test_first_file_hit():
    with patch("requests.get", return_value=_resp(200, "# Hello")) as g:
        assert github_api.get_readme_excerpt("a/b") == "# Hello"
    assert g.call_count == 1
    assert g.call_args[0][0] == "https://raw.githubusercontent.com/a/b/HEAD/README.md"
    assert g.call_args[1]["timeout"] == 10


def test_falls_back_to_second_name():
    with patch("requests.get", side_effect=[_resp(404), _resp(200, "lower")]) as g:
        assert github_api.get_readme_excerpt("a/b") == "lower"
    assert g.call_args[0][0].endswith("/HEAD/readme.md")


def test_all_fail_returns_empty():
    with patch("requests.get", return_value=_resp(404)) as g:
        assert github_api.get_readme_excerpt("a/b") == ""
    assert g.call_count == 4


def test_truncates():
    with patch("requests.get", return_value=_resp(200, "x" * 100)):
        assert github_api.get_readme_excerpt("a/b", max_chars=10) == "x" * 10


def test_exception_tries_next():
    with patch("requests.get", side_effect=[RuntimeError("boom"), _resp(200, "ok")]):
        assert github_api.get_readme_excerpt("a/b") == "ok"
