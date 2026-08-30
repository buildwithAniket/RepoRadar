"""Parse + validate the agent-supplied `.trending-data.json` — the production ingestion path.

See `docs/design.md`'s "Known constraint: cloud sandbox network egress" section for why this
module exists: the cloud sandbox's egress proxy blocks direct GitHub API access for arbitrary
repos, so production Phase 1 is agent-mediated (the cloud agent `WebFetch`es
`github.com/trending` itself and writes the result as JSON per the schema documented in
`docs/design.md`'s ".trending-data.json" section). This module is the trust boundary between
that untrusted, LLM-authored JSON and the rest of the deterministic pipeline.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

REPO_NAME_RE = re.compile(r"^[\w.-]+/[\w.-]+$")
MIN_REPOS = 10
CARRY_FORWARD_STATUSES = ("skipped", "failed")


def load_and_validate(path: str | Path, seen_state: dict, strict: bool = False) -> list[dict]:
    """Parse and validate the agent-supplied trending JSON at `path`.

    `seen_state` is `state.load_state()`'s return value — used to carry forward
    `latest_release_at_check` for skipped/failed release lookups and to guard against star-count
    regressions (a lower reading than what's already on file is more likely a scrape error than
    a real decrease, since stars are monotonic in practice).

    Returns a list of sanitized repo dicts: {"repo", "stars", "language", "description",
    "latest_release", "release_status"} — the subset downstream code needs. `schema_version`,
    `fetched_at`, `source_url`, and per-row `page_row_count` are dropped.

    Raises ValueError (with a clear message) on any hard validation failure:
    - `schema_version` != 1
    - `repos` missing/not a list/fewer than 10 entries
    - a `repo` value failing the `^[\\w.-]+/[\\w.-]+$` regex
    - a `stars` value that isn't a non-negative int
    - `release_status == "found"` with a `latest_release` that doesn't parse as ISO 8601
    - a `page_row_count` mismatch when `strict=True` (otherwise this only warns to stderr)

    Duplicate `repo` entries are de-duplicated (first occurrence wins), not rejected. A star
    regression against `seen_state` is silently corrected (prior value substituted), not
    rejected.
    """
    with Path(path).open() as f:
        data = json.load(f)

    if not isinstance(data, dict):
        raise ValueError("trending-data root must be a JSON object")

    if data.get("schema_version") != 1:
        raise ValueError(f"unsupported schema_version: {data.get('schema_version')!r}")

    raw_repos = data.get("repos")
    if not isinstance(raw_repos, list):
        raise ValueError("'repos' must be a list")
    if len(raw_repos) < MIN_REPOS:
        raise ValueError(f"'repos' has only {len(raw_repos)} entries, need >= {MIN_REPOS}")

    validated = []
    for row in raw_repos:
        if not isinstance(row, dict):
            raise ValueError(f"repo entry is not an object: {row!r}")

        full_name = row.get("repo")
        if not isinstance(full_name, str) or not REPO_NAME_RE.match(full_name):
            raise ValueError(f"invalid repo name: {full_name!r}")

        stars = row.get("stars")
        if not isinstance(stars, int) or isinstance(stars, bool) or stars < 0:
            raise ValueError(f"{full_name}: invalid stars value {stars!r}")

        release_status = row.get("release_status")
        latest_release = row.get("latest_release")
        if release_status == "found":
            if not isinstance(latest_release, str):
                raise ValueError(
                    f"{full_name}: release_status 'found' requires a latest_release string"
                )
            try:
                datetime.fromisoformat(latest_release.replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError(
                    f"{full_name}: unparseable latest_release {latest_release!r}"
                ) from exc
        elif release_status in CARRY_FORWARD_STATUSES:
            # An unknown/skipped lookup must carry forward whatever was last known, never be
            # presented as "no release" (that's release_status == "none", a distinct case
            # meaning the repo confirmed has zero releases).
            prior = seen_state.get(full_name, {})
            latest_release = prior.get("latest_release_at_check")

        prior_entry = seen_state.get(full_name)
        if prior_entry is not None and stars < prior_entry.get("stars_at_check", 0):
            stars = prior_entry["stars_at_check"]

        validated.append(
            {
                "repo": full_name,
                "stars": stars,
                "language": row.get("language"),
                "description": row.get("description"),
                "latest_release": latest_release,
                "release_status": release_status,
            }
        )

    # Row-count tripwire: compare against the raw parsed list length, before dedup drops
    # anything. If page_row_count is absent, there's nothing to check against.
    raw_len = len(raw_repos)
    page_row_count = data.get("page_row_count", raw_len)
    if raw_len != page_row_count:
        message = (
            f"row-count mismatch: parsed {raw_len} repo(s) but page_row_count claims "
            f"{page_row_count}"
        )
        if strict:
            raise ValueError(message)
        print(f"warning: {message}", file=sys.stderr)

    deduped = []
    seen_names = set()
    for row in validated:
        if row["repo"] in seen_names:
            continue
        seen_names.add(row["repo"])
        deduped.append(row)

    return deduped
