"""Use-case suggestion step for RepoRadar.

For repos judged "fit" or "maybe" in verdicts.json, asks Gemini for up to two
concrete use cases grounded in the repo's README and the profile, and writes
them to use_cases.json.

Every suggestion is validated in code: quotes must appear in the README, the
first step must name a command/file/API from the README, and the focus must be
one of the profile's labels. Anything that fails is dropped rather than shown.
This step is best-effort: on any failure it writes an empty result and never
blocks the pipeline.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable
from pathlib import Path

import judge

_KINDS = {"integrate", "build", "automate", "learn"}
_EFFORTS = {"hour", "weekend", "project"}
_FIELDS = ("title", "kind", "focus", "pitch", "evidence", "first_step", "effort")
_MAX_ITEMS = 2
_MIN_EVIDENCE_CHARS = 12
_ELIGIBLE_VERDICTS = {"fit", "maybe"}


def extract_profile_labels(profile_text: str) -> list[str]:
    """Every ``**bold**`` span in the profile, without whitespace or a trailing colon."""
    labels = []
    for span in re.findall(r"\*\*(.+?)\*\*", profile_text):
        label = span.strip().rstrip(":").strip()
        if label:
            labels.append(label)
    return labels


def _norm(text: str) -> str:
    """Compare text as rendered: models quote READMEs without their markdown/HTML."""
    text = re.sub(r"<[^>]+>", " ", text)  # HTML tags
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)  # links/images -> their text
    text = re.sub(r"[*_`#>]", "", text)  # emphasis, code, heading, quote markers
    return re.sub(r"\s+", " ", text.lower()).strip()


def _check_item(item: object, readme_n: str, labels: list[str], used_kinds: set[str]) -> tuple[dict | None, str]:
    if not isinstance(item, dict):
        return None, "item is not an object"
    clean: dict[str, str] = {}
    for field in _FIELDS:
        val = item.get(field)
        if not isinstance(val, str) or not val.strip():
            return None, f"field '{field}' missing or empty"
        clean[field] = val.strip()
    if clean["kind"] not in _KINDS:
        return None, f"kind '{clean['kind']}' not allowed"
    if clean["effort"] not in _EFFORTS:
        return None, f"effort '{clean['effort']}' not allowed"
    evidence_n = _norm(clean["evidence"])
    if len(evidence_n) < _MIN_EVIDENCE_CHARS or evidence_n not in readme_n:
        return None, "evidence is not a quote from the README"
    tokens = re.findall(r"`([^`]+)`", clean["first_step"])
    # A call's arguments often span lines in the README, so match it by name.
    tokens += [t.split("(", 1)[0] for t in tokens if "(" in t]
    if not any(_norm(t) and _norm(t) in readme_n for t in tokens):
        return None, "first_step names no command/file/API found in the README"
    wanted = clean["focus"].rstrip(":").strip().lower()
    canonical = next((lab for lab in labels if lab.lower() == wanted), None)
    if canonical is None:
        return None, f"focus '{clean['focus']}' is not a profile label"
    clean["focus"] = canonical
    if clean["kind"] in used_kinds:
        return None, f"kind '{clean['kind']}' duplicates another suggestion"
    return clean, ""


def validate_use_cases(raw: object, readme: str, profile_labels: list[str]) -> tuple[list[dict], list[str]]:
    """Return (kept, drop_reasons) for the model's response."""
    if not isinstance(raw, dict) or not isinstance(raw.get("use_cases"), list):
        return [], ["malformed response"]
    readme_n = _norm(readme)
    kept: list[dict] = []
    reasons: list[str] = []
    for item in raw["use_cases"][:_MAX_ITEMS]:
        clean, reason = _check_item(item, readme_n, profile_labels, {k["kind"] for k in kept})
        if clean:
            kept.append(clean)
        else:
            reasons.append(reason)
    return kept, reasons


def build_prompt(entry: dict, verdict: dict, readme: str, profile_text: str, profile_labels: list[str]) -> str:
    # Reports are public, so the prompt never names the profile owner and tells
    # the model not to either.
    labels = "\n".join(f"- {label}" for label in profile_labels)
    return f"""You are an engineering scout suggesting concrete use cases for one GitHub repository.

Profile:
{profile_text}

Allowed focus labels:
{labels}

Repository: {entry.get("repo", "")}
Description: {entry.get("description", "")}
Verdict: {verdict.get("verdict", "")}
Judgment (do not restate it): {verdict.get("judgment", "")}

README excerpt (between the markers):
<<<README
{readme}
README>>>

Rules:
- Return 0 to 2 use cases. Return fewer or none rather than a weak one; a use case is weak if it would apply to any repo in the same category.
- If you return two, they must have different kinds.
- "evidence" is a quote copied word for word from the README excerpt.
- "first_step" is one concrete action that names at least one command, file or API in backticks that appears in the README.
- "focus" is copied exactly from the allowed focus labels.
- Never invent features that are not in the README or description.
- Refer to "the profile". Never use a person's name, pronouns, or possessives like "the user's".

Fields of each use case:
- "title": 3-8 words, starting with a verb
- "kind": one of "integrate", "build", "automate", "learn"
- "focus": see above
- "pitch": 1-2 sentences on what changes and why it matters to that focus
- "evidence": see above
- "first_step": see above
- "effort": one of "hour", "weekend", "project"

Output ONLY a JSON object, no markdown:
{{"use_cases": [...], "skipped_reason": "<one line, required when use_cases is empty, else empty string>"}}"""


def _write(output_path: str, results: list[dict]) -> None:
    Path(output_path).write_text(json.dumps(results, indent=2) if results else "[]")


def ideate_repositories(
    *,
    needs_evaluation_path: str = ".needs_evaluation.json",
    verdicts_path: str = "verdicts.json",
    profile_path: str = "profile.md",
    output_path: str = "use_cases.json",
    readme_fetcher: Callable[[str], str] | None = None,
) -> list[dict]:
    """Suggest use cases for fit/maybe repos and write them to *output_path*.

    Never raises for missing keys or LLM failures; writes ``[]`` or per-repo
    ``skipped_reason`` instead, so a failure here cannot block the pipeline.
    """
    from logger import log

    if readme_fetcher is None:
        from github_api import get_readme_excerpt

        readme_fetcher = get_readme_excerpt

    judge._load_env_file()
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        log.warning("No Gemini API key configured; skipping use-case suggestions.")
        _write(output_path, [])
        return []

    needs = Path(needs_evaluation_path)
    repos = json.loads(needs.read_text()).get("repos", []) if needs.exists() else []
    vpath = Path(verdicts_path)
    verdicts = {v["repo"]: v for v in json.loads(vpath.read_text())} if vpath.exists() else {}
    eligible = [
        (e, verdicts[e["repo"]]) for e in repos if verdicts.get(e["repo"], {}).get("verdict") in _ELIGIBLE_VERDICTS
    ]
    if not eligible:
        log.info("No fit/maybe repositories to ideate on.")
        _write(output_path, [])
        return []

    try:
        chain, cfg = judge._resolve_gemini_chain(key)
    except RuntimeError as e:
        log.warning("Use-case suggestions skipped: %s", e)
        _write(output_path, [])
        return []

    profile_text = Path(profile_path).read_text() if Path(profile_path).exists() else ""
    labels = extract_profile_labels(profile_text)
    attempts, timeout = int(cfg["attempts_per_model"]), int(cfg["timeout_seconds"])

    results: list[dict] = []
    for entry, verdict in eligible:
        repo = entry["repo"]
        readme = readme_fetcher(repo)
        if not readme:
            results.append({"repo": repo, "use_cases": [], "skipped_reason": "README not found"})
            continue
        prompt = build_prompt(entry, verdict, readme, profile_text, labels)
        try:
            raw = judge._call_with_fallback(
                key, chain, prompt, attempts, timeout, label=f"Ideating {repo}", require_nonempty=False
            )
        except RuntimeError as e:
            log.warning("Ideation failed for %s: %s", repo, e)
            results.append({"repo": repo, "use_cases": [], "skipped_reason": "LLM call failed"})
            continue
        kept, reasons = validate_use_cases(raw, readme, labels)
        for reason in reasons:
            log.info("Dropped suggestion for %s: %s", repo, reason)
        skipped = ""
        if not kept:
            model_reason = raw.get("skipped_reason") if isinstance(raw, dict) else None
            skipped = (
                model_reason.strip()
                if isinstance(model_reason, str) and model_reason.strip()
                else ("No suggestion passed quality checks")
            )
        results.append({"repo": repo, "use_cases": kept, "skipped_reason": skipped})

    _write(output_path, results)
    total = sum(len(r["use_cases"]) for r in results)
    log.info("Wrote %d use case(s) for %d repo(s) to %s", total, len(results), output_path)
    return results
