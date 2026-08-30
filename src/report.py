"""Render reports/YYYY-MM-DD.md and the email-ready digest string from finalized verdicts."""

from __future__ import annotations

SECTION_TITLES = {
    "new": "New today",
    "resurfaced": "Resurfaced (major change)",
    "profile-changed": "Profile changed — re-evaluated",
}

VERDICT_BADGES = {
    "fit": "✅ Fit",
    "maybe": "🤔 Maybe",
    "not-fit": "❌ Not fit",
}


def render_report(date: str, evaluated: list[dict], skipped: int) -> str:
    """evaluated: [{"repo", "stars", "reason", "verdict", "judgment"}, ...]."""
    lines = [f"# RepoRadar — {date}", ""]

    if not evaluated:
        lines.append("No new, resurfaced, or profile-changed repos today.")
        lines.append("")
    else:
        by_reason: dict[str, list[dict]] = {}
        for entry in evaluated:
            by_reason.setdefault(entry["reason"], []).append(entry)

        for reason, title in SECTION_TITLES.items():
            entries = by_reason.get(reason)
            if not entries:
                continue
            lines.append(f"## {title}")
            lines.append("")
            for entry in entries:
                lines.extend(_render_entry(entry))

    skip_word = "repo" if skipped == 1 else "repos"
    lines.append("---")
    lines.append("")
    lines.append(f"_{skipped} {skip_word} skipped (no material change since last check)._")
    lines.append("")

    return "\n".join(lines)


def _render_entry(entry: dict) -> list[str]:
    full_name = entry["repo"]
    stars = entry.get("stars", 0)
    badge = VERDICT_BADGES.get(entry.get("verdict"), str(entry.get("verdict")))
    judgment = entry.get("judgment", "")
    return [
        f"### [{full_name}](https://github.com/{full_name}) — ⭐ {stars} — {badge}",
        "",
        judgment,
        "",
    ]


def render_email_digest(date: str, evaluated: list[dict], skipped: int) -> str:
    return render_report(date, evaluated, skipped)
