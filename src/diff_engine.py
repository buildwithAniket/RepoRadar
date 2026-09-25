"""Deterministic diff engine for RepoRadar V3.

Classifies trending repos into one of:
- ``new``           — never seen before
- ``resurfaced``    — star jump ≥ 2× prior OR new release since last check
- ``profile-changed`` — prior verdict was not-fit/maybe but profile.md changed
- ``skip``          — no meaningful change

The pipeline only sends repos classified as ``new``, ``resurfaced``, or
``profile-changed`` to the LLM judge step.
"""

from __future__ import annotations

from logger import log

STAR_JUMP_MULTIPLIER = 2


def classify_repo(
    full_name: str,
    current_stars: int,
    current_latest_release: str | None,
    prior_entry: dict | None,
    profile_mtime: str,
) -> str:
    """Return the classification reason for *full_name*."""
    if prior_entry is None:
        log.debug("New repo: %s", full_name)
        return "new"

    prior_verdict = prior_entry.get("verdict", "")
    prior_checked = prior_entry.get("profile_checked_against", "")

    if prior_verdict in ("not-fit", "maybe") and profile_mtime > prior_checked:
        log.debug("Profile-changed: %s (was %s, profile updated)", full_name, prior_verdict)
        return "profile-changed"

    if _has_major_change(current_stars, current_latest_release, prior_entry):
        log.debug("Resurfaced: %s", full_name)
        return "resurfaced"

    log.debug("Skipped: %s (no meaningful change)", full_name)
    return "skip"


def _has_major_change(
    current_stars: int,
    current_latest_release: str | None,
    prior_entry: dict,
) -> bool:
    prior_stars = prior_entry.get("stars_at_check", 0)

    # Star jump: from zero to something, or ≥ 2× prior
    star_jump = (prior_stars == 0 and current_stars > 0) or (
        prior_stars > 0 and current_stars >= prior_stars * STAR_JUMP_MULTIPLIER
    )

    prior_release = prior_entry.get("latest_release_at_check")
    new_release = current_latest_release is not None and (
        prior_release is None or current_latest_release > prior_release
    )

    return star_jump or new_release


def split_by_classification(
    trending: list[dict],
    state: dict[str, dict],
    profile_mtime: str,
) -> tuple[list[dict], int]:
    """Split trending repos into "needs evaluation" and "skipped" counts."""
    needs_evaluation: list[dict] = []
    skipped = 0

    for repo in trending:
        full_name = repo["repo"]
        prior = state.get(full_name)
        reason = classify_repo(
            full_name,
            repo["stars"],
            repo.get("latest_release"),
            prior,
            profile_mtime,
        )
        if reason == "skip":
            skipped += 1
            continue
        needs_evaluation.append({**repo, "reason": reason, "prior": prior})

    return needs_evaluation, skipped
