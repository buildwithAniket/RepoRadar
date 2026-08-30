"""Deterministic redundancy rules: decide which trending repos need a fresh LLM judgment.

Kept dependency-free and pure so it's unit-testable without network access.
"""

from __future__ import annotations

STAR_JUMP_MULTIPLIER = 2


def classify_repo(
    full_name: str,
    current_stars: int,
    current_latest_release: str | None,
    prior_entry: dict | None,
    profile_mtime: str,
    today: str,
) -> str:
    """Return one of "new", "profile-changed", "resurfaced", "skip".

    Release timestamps are ISO 8601 strings (or None) and compared lexicographically, which
    is valid for that format. `full_name` and `today` are unused by the logic itself but kept
    in the signature for callers/tests to pass context explicitly.
    """
    del full_name, today  # not needed for the classification itself

    if prior_entry is None:
        return "new"

    prior_verdict = prior_entry.get("verdict")
    if prior_verdict in ("not-fit", "maybe") and profile_mtime > prior_entry.get(
        "profile_checked_against", ""
    ):
        return "profile-changed"

    if _has_major_change(current_stars, current_latest_release, prior_entry):
        return "resurfaced"

    return "skip"


def _has_major_change(
    current_stars: int, current_latest_release: str | None, prior_entry: dict
) -> bool:
    prior_stars = prior_entry.get("stars_at_check", 0)
    star_jump = (prior_stars == 0 and current_stars > 0) or (
        prior_stars > 0 and current_stars >= prior_stars * STAR_JUMP_MULTIPLIER
    )

    prior_release = prior_entry.get("latest_release_at_check")
    new_release = current_latest_release is not None and (
        prior_release is None or current_latest_release > prior_release
    )

    return star_jump or new_release


def split_by_classification(
    trending: list[dict], state: dict, profile_mtime: str, today: str
) -> tuple[list[dict], int]:
    """trending: [{"repo": full_name, "stars": int, "latest_release": str|None, ...}, ...]

    Returns (needs_evaluation, skipped_count). Each needs_evaluation entry is the input dict
    augmented with "reason" and "prior" (the previous seen-repos.json entry, or None).
    """
    needs_evaluation = []
    skipped = 0
    for repo in trending:
        prior = state.get(repo["repo"])
        reason = classify_repo(
            repo["repo"], repo["stars"], repo.get("latest_release"), prior, profile_mtime, today
        )
        if reason == "skip":
            skipped += 1
            continue
        needs_evaluation.append({**repo, "reason": reason, "prior": prior})
    return needs_evaluation, skipped
