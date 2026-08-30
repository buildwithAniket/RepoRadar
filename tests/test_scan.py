"""Regression tests for src/scan.py's `_profile_mtime()` — must read git history, not
filesystem mtime (docs/design.md's "Known bug fixed alongside this redesign",
docs/backlog.md Epic 5.3), and must read whatever profile.md path it's given, since profile.md
lives in a separate private repo, not this one (docs/design.md's "Private profile" section).

No package install step in this project (plain-script layout), so we add src/ to sys.path
directly rather than relying on an installed package (mirrors tests/test_diff_engine.py).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import scan  # noqa: E402

FAKE_PROFILE_PATH = Path("/some/sibling/RepoRadar-private/profile.md")


def test_profile_mtime_uses_git_log_not_filesystem_mtime():
    """Even though profile.md's filesystem mtime is always "today" after a fresh clone (git sets
    working-tree mtimes to checkout time, not the file's real last-edit date - see NFR3),
    `_profile_mtime()` must return git's last-commit date instead of touching the filesystem.
    """
    fake_result = MagicMock()
    fake_result.stdout = "2020-01-15\n"
    with patch("scan.subprocess.run", return_value=fake_result) as mock_run:
        result = scan._profile_mtime(FAKE_PROFILE_PATH)

    assert result == "2020-01-15"
    args, kwargs = mock_run.call_args
    assert args[0] == ["git", "log", "-1", "--format=%cs", "--", "profile.md"]
    assert kwargs["cwd"] == FAKE_PROFILE_PATH.parent


def test_profile_mtime_falls_back_to_today_when_git_unavailable():
    with patch("scan.subprocess.run", side_effect=FileNotFoundError("no git")):
        result = scan._profile_mtime(FAKE_PROFILE_PATH)

    assert result == scan._today()


def test_profile_mtime_falls_back_to_today_when_git_command_fails():
    with patch(
        "scan.subprocess.run",
        side_effect=subprocess.CalledProcessError(1, "git"),
    ):
        result = scan._profile_mtime(FAKE_PROFILE_PATH)

    assert result == scan._today()


def test_profile_mtime_falls_back_to_today_when_git_returns_empty_output():
    """profile.md was never committed yet (e.g. still staged/untracked) - `git log` succeeds but
    prints nothing. Must not crash, and must not silently return an empty string.
    """
    fake_result = MagicMock()
    fake_result.stdout = ""
    with patch("scan.subprocess.run", return_value=fake_result):
        result = scan._profile_mtime(FAKE_PROFILE_PATH)

    assert result == scan._today()


def test_profile_mtime_against_real_repo_matches_git_log_directly():
    """When the RepoRadar-private sibling repo is actually checked out locally (the normal dev
    setup), cross-check against calling git directly - proves scan.py's actual subprocess
    invocation is correct end-to-end, not just the mocked plumbing above. Skipped when the
    sibling repo isn't present (e.g. a checkout of this repo alone, with no private profile).
    """
    if not scan.DEFAULT_PROFILE_PATH.is_file():
        import pytest

        pytest.skip("RepoRadar-private sibling repo not checked out locally")

    expected = subprocess.run(
        ["git", "log", "-1", "--format=%cs", "--", "profile.md"],
        cwd=scan.DEFAULT_PROFILE_PATH.parent,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()

    assert scan._profile_mtime(scan.DEFAULT_PROFILE_PATH) == expected
