"""Report renderer for RepoRadar V3 digests.

Turns a list of evaluated repos into a Markdown digest with 🟢 Fit / 🟡 Maybe / 🔴 Not Fit sections.
"""

from __future__ import annotations

from logger import log


def _use_case_lines(item: dict) -> list[str]:
    """Indented ✦ lines for a fit/maybe repo; build_ui_data.USE_CASE_PATTERN parses them back."""

    def one_line(value: object) -> str:
        return " ".join(str(value).split())

    use_cases = [uc for uc in item.get("use_cases") or [] if isinstance(uc, dict)][:2]
    if use_cases:
        return [
            f"  - ✦ **{one_line(uc.get('title', ''))}** · {one_line(uc.get('kind', ''))} · "
            f"{one_line(uc.get('effort', ''))} · {one_line(uc.get('focus', ''))}: "
            f"{one_line(uc.get('pitch', ''))} First step: {one_line(uc.get('first_step', ''))}"
            for uc in use_cases
        ]
    reason = item.get("skipped_reason")
    if isinstance(reason, str) and reason.strip():
        return [f"  - ✦ No strong use case: {one_line(reason)}"]
    return []


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
            lines.extend(_use_case_lines(f))
        lines.append("")

    if maybes:
        lines.append("## 🟡 Maybe")
        for m in maybes:
            lines.append(
                f"- **[{m['repo']}](https://github.com/{m['repo']})** "
                f"({m['stars']} stars) [{m['reason']}]: {m['judgment']}"
            )
            lines.extend(_use_case_lines(m))
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
