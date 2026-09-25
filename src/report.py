"""Report renderer for RepoRadar V3 digests.

Turns a list of evaluated repos into a Markdown digest with 🟢 Fit / 🟡 Maybe / 🔴 Not Fit sections.
"""

from __future__ import annotations

from logger import log


def render_report(date: str, evaluated: list[dict], skipped: int) -> str:
    """Return a Markdown digest string."""
    fits = [e for e in evaluated if e["verdict"] == "fit"]
    maybes = [e for e in evaluated if e["verdict"] == "maybe"]
    not_fits = [e for e in evaluated if e["verdict"] == "not-fit"]

    log.info(
        "Report summary: %d fit, %d maybe, %d not-fit (skipped=%d)",
        len(fits),
        len(maybes),
        len(not_fits),
        skipped,
    )

    lines = [
        f"# RepoRadar Daily Digest — {date}",
        "",
        f"Scanned trending repositories: evaluated {len(evaluated)} (skipped {skipped} unchanged/filtered).",
        "",
    ]

    if fits:
        lines.append("## 🟢 Fit")
        for f in fits:
            lines.append(
                f"- **[{f['repo']}](https://github.com/{f['repo']})** "
                f"({f['stars']} stars) [{f['reason']}]: {f['judgment']}"
            )
        lines.append("")

    if maybes:
        lines.append("## 🟡 Maybe")
        for m in maybes:
            lines.append(
                f"- **[{m['repo']}](https://github.com/{m['repo']})** "
                f"({m['stars']} stars) [{m['reason']}]: {m['judgment']}"
            )
        lines.append("")

    if not_fits:
        lines.append("## 🔴 Not Fit")
        for n in not_fits:
            lines.append(
                f"- **[{n['repo']}](https://github.com/{n['repo']})** "
                f"({n['stars']} stars) [{n['reason']}]: {n['judgment']}"
            )
        lines.append("")

    return "\n".join(lines) + "\n"
