"""Unit tests for src/trending_data.py — validation/rejection rules for the agent-supplied
`.trending-data.json` production ingestion path (docs/backlog.md Epic 5.3).

No package install step in this project (plain-script layout), so we add src/ to sys.path
directly rather than relying on an installed package (mirrors tests/test_diff_engine.py).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from trending_data import load_and_validate  # noqa: E402


def _repo(n: int, **overrides) -> dict:
    row = {
        "repo": f"owner/repo{n}",
        "stars": 100 + n,
        "language": "Python",
        "description": "a repo",
        "latest_release": None,
        "release_status": "skipped",
    }
    row.update(overrides)
    return row


def _payload(repos: list[dict], page_row_count: int | None = None, **overrides) -> dict:
    payload = {
        "schema_version": 1,
        "fetched_at": "2026-08-28T13:04:11Z",
        "source_url": "https://github.com/trending?since=daily",
        "page_row_count": page_row_count if page_row_count is not None else len(repos),
        "repos": repos,
    }
    payload.update(overrides)
    return payload


def _write(tmp_path: Path, payload: dict, name: str = "trending.json") -> Path:
    path = tmp_path / name
    path.write_text(json.dumps(payload))
    return path


def _valid_repos(count: int = 12) -> list[dict]:
    return [_repo(i) for i in range(count)]


def test_valid_input_passes_and_returns_right_shape(tmp_path):
    payload = _payload(_valid_repos())
    path = _write(tmp_path, payload)

    result = load_and_validate(path, {})

    assert len(result) == 12
    first = result[0]
    assert set(first.keys()) == {
        "repo",
        "stars",
        "language",
        "description",
        "latest_release",
        "release_status",
    }
    assert first["repo"] == "owner/repo0"
    assert first["stars"] == 100
    assert first["language"] == "Python"
    assert first["description"] == "a repo"
    assert first["latest_release"] is None
    assert first["release_status"] == "skipped"


def test_wrong_schema_version_rejected(tmp_path):
    payload = _payload(_valid_repos())
    payload["schema_version"] = 2
    path = _write(tmp_path, payload)

    with pytest.raises(ValueError, match="schema_version"):
        load_and_validate(path, {})


def test_fewer_than_ten_repos_rejected(tmp_path):
    payload = _payload(_valid_repos(9), page_row_count=9)
    path = _write(tmp_path, payload)

    with pytest.raises(ValueError, match="10"):
        load_and_validate(path, {})


def test_repo_name_failing_regex_rejected(tmp_path):
    repos = _valid_repos()
    repos[0]["repo"] = "not-a-valid-repo-name"
    payload = _payload(repos)
    path = _write(tmp_path, payload)

    with pytest.raises(ValueError, match="invalid repo name"):
        load_and_validate(path, {})


def test_negative_stars_rejected(tmp_path):
    repos = _valid_repos()
    repos[0]["stars"] = -5
    payload = _payload(repos)
    path = _write(tmp_path, payload)

    with pytest.raises(ValueError, match="stars"):
        load_and_validate(path, {})


def test_duplicate_repo_entries_deduplicated_not_rejected(tmp_path):
    repos = _valid_repos()
    duplicate = dict(repos[0])
    repos.append(duplicate)
    payload = _payload(repos, page_row_count=len(repos))
    path = _write(tmp_path, payload)

    result = load_and_validate(path, {})

    names = [r["repo"] for r in result]
    assert names.count("owner/repo0") == 1
    assert len(result) == 12  # the 13th (duplicate) row collapsed away


def test_found_with_unparseable_latest_release_rejected(tmp_path):
    repos = _valid_repos()
    repos[0]["release_status"] = "found"
    repos[0]["latest_release"] = "not-a-timestamp"
    payload = _payload(repos)
    path = _write(tmp_path, payload)

    with pytest.raises(ValueError, match="unparseable"):
        load_and_validate(path, {})


def test_found_with_valid_iso_timestamp_accepted(tmp_path):
    repos = _valid_repos()
    repos[0]["release_status"] = "found"
    repos[0]["latest_release"] = "2026-08-01T00:00:00+00:00"
    payload = _payload(repos)
    path = _write(tmp_path, payload)

    result = load_and_validate(path, {})

    assert result[0]["latest_release"] == "2026-08-01T00:00:00+00:00"
    assert result[0]["release_status"] == "found"


def test_found_with_trailing_z_timestamp_accepted(tmp_path):
    repos = _valid_repos()
    repos[0]["release_status"] = "found"
    repos[0]["latest_release"] = "2026-08-01T00:00:00Z"
    payload = _payload(repos)
    path = _write(tmp_path, payload)

    result = load_and_validate(path, {})

    assert result[0]["latest_release"] == "2026-08-01T00:00:00Z"
    assert result[0]["release_status"] == "found"


def test_skipped_carries_forward_prior_latest_release(tmp_path):
    repos = _valid_repos()
    repos[0]["release_status"] = "skipped"
    repos[0]["latest_release"] = None
    payload = _payload(repos)
    path = _write(tmp_path, payload)

    seen_state = {
        "owner/repo0": {
            "stars_at_check": 50,
            "latest_release_at_check": "2026-07-15T00:00:00Z",
        }
    }

    result = load_and_validate(path, seen_state)

    entry = next(r for r in result if r["repo"] == "owner/repo0")
    assert entry["latest_release"] == "2026-07-15T00:00:00Z"


def test_star_regression_substitutes_prior_value(tmp_path):
    repos = _valid_repos()
    repos[0]["stars"] = 10  # lower than the prior known value
    payload = _payload(repos)
    path = _write(tmp_path, payload)

    seen_state = {"owner/repo0": {"stars_at_check": 5000}}

    result = load_and_validate(path, seen_state)

    entry = next(r for r in result if r["repo"] == "owner/repo0")
    assert entry["stars"] == 5000


def test_page_row_count_mismatch_warns_by_default(tmp_path, capsys):
    repos = _valid_repos()
    payload = _payload(repos, page_row_count=len(repos) + 5)
    path = _write(tmp_path, payload)

    result = load_and_validate(path, {})

    assert len(result) == len(repos)
    captured = capsys.readouterr()
    assert "row-count mismatch" in captured.err


def test_page_row_count_mismatch_raises_under_strict(tmp_path):
    repos = _valid_repos()
    payload = _payload(repos, page_row_count=len(repos) + 5)
    path = _write(tmp_path, payload)

    with pytest.raises(ValueError, match="row-count mismatch"):
        load_and_validate(path, {}, strict=True)
