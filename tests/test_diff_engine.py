"""Unit tests for src/diff_engine.py — every FR3 classification branch (docs/backlog.md Epic 3.1).

No package install step in this project (plain-script layout), so we add src/ to sys.path
directly rather than relying on an installed package.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from diff_engine import classify_repo, split_by_classification  # noqa: E402

TODAY = "2026-08-27"


def test_new_repo_with_no_prior_entry_is_new():
    assert (
        classify_repo(
            "owner/repo",
            current_stars=100,
            current_latest_release=None,
            prior_entry=None,
            profile_mtime="2026-08-15T00:00:00Z",
            today=TODAY,
        )
        == "new"
    )


def test_unchanged_repo_is_skip():
    prior = {
        "stars_at_check": 100,
        "latest_release_at_check": "2026-08-01T00:00:00Z",
        "verdict": "fit",
        "profile_checked_against": "2026-08-20",
    }
    result = classify_repo(
        "owner/repo",
        current_stars=100,
        current_latest_release="2026-08-01T00:00:00Z",
        prior_entry=prior,
        # profile untouched since last check
        profile_mtime="2026-08-15T00:00:00Z",
        today=TODAY,
    )
    assert result == "skip"


def test_resurfaced_via_star_jump():
    prior = {
        "stars_at_check": 100,
        "latest_release_at_check": "2026-08-01T00:00:00Z",
        "verdict": "not-fit",
        "profile_checked_against": "2026-08-20",
    }
    result = classify_repo(
        "owner/repo",
        current_stars=200,  # exactly 2x prior -> qualifies as a star jump
        current_latest_release="2026-08-01T00:00:00Z",  # release unchanged
        prior_entry=prior,
        # profile not touched since the prior check, so this can't be profile-changed
        profile_mtime="2026-08-15T00:00:00Z",
        today=TODAY,
    )
    assert result == "resurfaced"


def test_resurfaced_via_new_release():
    prior = {
        "stars_at_check": 100,
        "latest_release_at_check": "2026-08-01T00:00:00Z",
        "verdict": "not-fit",
        "profile_checked_against": "2026-08-20",
    }
    result = classify_repo(
        "owner/repo",
        current_stars=100,  # stars unchanged
        current_latest_release="2026-08-10T00:00:00Z",  # newer than prior
        prior_entry=prior,
        profile_mtime="2026-08-15T00:00:00Z",
        today=TODAY,
    )
    assert result == "resurfaced"


def test_profile_changed_when_prior_verdict_not_fit_and_profile_edited_since():
    prior = {
        "stars_at_check": 100,
        "latest_release_at_check": "2026-08-01T00:00:00Z",
        "verdict": "not-fit",
        "profile_checked_against": "2026-08-20",
    }
    result = classify_repo(
        "owner/repo",
        current_stars=100,  # no star jump
        current_latest_release="2026-08-01T00:00:00Z",  # no new release
        prior_entry=prior,
        profile_mtime="2026-08-25T00:00:00Z",  # after profile_checked_against
        today=TODAY,
    )
    assert result == "profile-changed"


def test_profile_changed_when_prior_verdict_maybe_and_profile_edited_since():
    prior = {
        "stars_at_check": 100,
        "latest_release_at_check": "2026-08-01T00:00:00Z",
        "verdict": "maybe",
        "profile_checked_against": "2026-08-20",
    }
    result = classify_repo(
        "owner/repo",
        current_stars=100,
        current_latest_release="2026-08-01T00:00:00Z",
        prior_entry=prior,
        profile_mtime="2026-08-25T00:00:00Z",
        today=TODAY,
    )
    assert result == "profile-changed"


def test_profile_change_ignored_when_prior_verdict_was_fit():
    """Negative case: profile edited after the check, but we already liked this repo — don't
    re-litigate a `fit` verdict just because the profile changed. Must still be `skip`.
    """
    prior = {
        "stars_at_check": 100,
        "latest_release_at_check": "2026-08-01T00:00:00Z",
        "verdict": "fit",
        "profile_checked_against": "2026-08-20",
    }
    result = classify_repo(
        "owner/repo",
        current_stars=100,  # no star jump
        current_latest_release="2026-08-01T00:00:00Z",  # no new release
        prior_entry=prior,
        profile_mtime="2026-08-25T00:00:00Z",  # after profile_checked_against
        today=TODAY,
    )
    assert result == "skip"


def test_split_by_classification_counts_and_list():
    trending = [
        {"repo": "org/brand-new", "stars": 50, "latest_release": None},
        {"repo": "org/unchanged", "stars": 100, "latest_release": "2026-08-01T00:00:00Z"},
        {"repo": "org/star-jumped", "stars": 500, "latest_release": "2026-08-01T00:00:00Z"},
        {"repo": "org/released", "stars": 100, "latest_release": "2026-08-15T00:00:00Z"},
        {"repo": "org/reprofiled", "stars": 100, "latest_release": "2026-08-01T00:00:00Z"},
        {"repo": "org/already-fit", "stars": 100, "latest_release": "2026-08-01T00:00:00Z"},
    ]
    state = {
        "org/unchanged": {
            "stars_at_check": 100,
            "latest_release_at_check": "2026-08-01T00:00:00Z",
            "verdict": "fit",
            "profile_checked_against": "2026-08-20",
        },
        "org/star-jumped": {
            "stars_at_check": 100,
            "latest_release_at_check": "2026-08-01T00:00:00Z",
            # verdict "fit" so this can only be resurfaced, never profile-changed, isolating
            # the star-jump branch even though profile_mtime is also after profile_checked_against
            "verdict": "fit",
            "profile_checked_against": "2026-08-20",
        },
        "org/released": {
            "stars_at_check": 100,
            "latest_release_at_check": "2026-08-01T00:00:00Z",
            # verdict "fit" so this can only be resurfaced, never profile-changed — isolates
            # the new-release branch
            "verdict": "fit",
            "profile_checked_against": "2026-08-20",
        },
        "org/reprofiled": {
            "stars_at_check": 100,
            "latest_release_at_check": "2026-08-01T00:00:00Z",
            "verdict": "maybe",
            "profile_checked_against": "2026-08-20",
        },
        "org/already-fit": {
            "stars_at_check": 100,
            "latest_release_at_check": "2026-08-01T00:00:00Z",
            "verdict": "fit",
            "profile_checked_against": "2026-08-20",
        },
    }
    # after unchanged/star-jumped/released prior checks, but before reprofiled/already-fit ones
    profile_mtime = "2026-08-25T00:00:00Z"

    needs_evaluation, skipped_count = split_by_classification(trending, state, profile_mtime, TODAY)

    assert skipped_count == 2  # org/unchanged, org/already-fit
    reasons_by_repo = {entry["repo"]: entry["reason"] for entry in needs_evaluation}
    assert reasons_by_repo == {
        "org/brand-new": "new",
        "org/star-jumped": "resurfaced",
        "org/released": "resurfaced",
        "org/reprofiled": "profile-changed",
    }
    assert len(needs_evaluation) == 4
    # each entry carries the original fields plus reason/prior
    brand_new_entry = next(e for e in needs_evaluation if e["repo"] == "org/brand-new")
    assert brand_new_entry["prior"] is None
    assert brand_new_entry["stars"] == 50
