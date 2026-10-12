"""Prompt eval for the judge step (src/judge.py).

Runs a prompt version over dataset.json, grades every output, and writes a
JSON result plus a one-screen summary. Compare versions by running each and
diffing the summaries.

    python evals/judge/run_eval.py --prompt v1 --runs 3

Graders:
  code   - JSON parses, every repo answered once, valid verdict, no names or
           pronouns, judgment length. Cheap and exact.
  label  - verdict is in the case's acceptable set (accuracy), and identical
           across runs (consistency).
  model  - a second LLM call lists claims in each judgment that the input data
           does not support (grounding). Catches what regexes cannot.

Needs GEMINI_API_KEY. Each run makes ceil(cases / batch) judge calls plus the
same number of grader calls.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import random
import re
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(HERE))

from prompts import PROMPTS  # noqa: E402

from judge import _call_with_fallback, _load_env_file  # noqa: E402

VERDICTS = {"fit", "maybe", "not-fit"}
# Owner name from profile.md plus second-person / third-person references.
IDENTITY_RE = re.compile(r"\b(aniket|you|your|yours|he|him|his|she|her|hers|the user'?s?)\b", re.I)
MAX_WORDS = 90

GRADER_PROMPT = """You are checking AI-written repository judgments for unsupported claims.

For each item you get INPUT (everything the writer knew about the repository) and JUDGMENT (what it wrote).
A claim is unsupported when it states a fact about the repository (features, tests, docs, quality, maturity,
popularity, purpose) that INPUT does not state or directly imply. Comparisons to the interest profile are not
claims about the repository; ignore them. Hedged guesses ("the name suggests") are allowed.

Items:
{items}

Return ONLY a JSON array, one entry per item, in the same order:
[{{"id": "<id>", "unsupported_claims": ["<quoted claim>", ...]}}]
Use an empty list when every claim is supported."""


def batches(cases: list[dict], size: int, seed: int) -> list[list[dict]]:
    """Fixed shuffled batches so each call mixes categories, like a real day's scan."""
    order = cases[:]
    random.Random(seed).shuffle(order)
    return [order[i : i + size] for i in range(0, len(order), size)]


def code_checks(batch: list[dict], output) -> dict:
    """Format-level checks for one judge call."""
    expected = [c["input"]["repo"] for c in batch]
    if not isinstance(output, list):
        return {"parse_ok": False, "coverage_ok": False, "by_repo": {}}
    by_repo: dict[str, dict] = {}
    dupes = 0
    for item in output:
        if not isinstance(item, dict):
            continue
        repo = item.get("repo")
        if repo in by_repo:
            dupes += 1
        by_repo[repo] = item
    coverage_ok = set(by_repo) == set(expected) and dupes == 0
    return {"parse_ok": True, "coverage_ok": coverage_ok, "by_repo": by_repo}


def judgment_checks(item: dict | None) -> dict:
    if not item:
        return {"answered": False}
    verdict = item.get("verdict")
    text = item.get("judgment") or ""
    leaks = sorted({m.lower() for m in IDENTITY_RE.findall(text)})
    words = len(text.split())
    return {
        "answered": True,
        "verdict": verdict,
        "judgment": text,
        "schema_ok": verdict in VERDICTS and bool(text),
        "identity_leaks": leaks,
        "words": words,
        "concise_ok": words <= MAX_WORDS and "\n" not in text.strip(),
    }


def grade_grounding(
    key: str, model: str, batch: list[dict], rows: dict[str, dict], attempts: int, timeout: int
) -> dict[str, list]:
    items = []
    for c in batch:
        row = rows[c["id"]]
        if row.get("answered"):
            items.append({"id": c["id"], "INPUT": c["input"], "JUDGMENT": row["judgment"]})
    if not items:
        return {}
    prompt = GRADER_PROMPT.format(items=json.dumps(items, indent=2, ensure_ascii=False))
    out = _call_with_fallback(key, [model], prompt, attempts, timeout, label="Grading", require_nonempty=False)
    return {o.get("id"): o.get("unsupported_claims") or [] for o in out if isinstance(o, dict)}


def summarize(results: list[dict], runs: int) -> dict:
    rows = [r for r in results if r.get("answered")]
    total = len(results)

    def rate(pred, pool=rows):
        return round(sum(1 for r in pool if pred(r)) / max(len(pool), 1), 3)

    per_case: dict[str, list] = {}
    for r in results:
        per_case.setdefault(r["id"], []).append(r.get("verdict"))
    # Only cases answered in every run count; a missing answer is an API failure, not inconsistency.
    complete = [v for v in per_case.values() if None not in v]
    consistent = sum(1 for v in complete if len(set(v)) == 1)

    by_tag: dict[str, list] = {}
    for r in rows:
        for t in r["tags"]:
            by_tag.setdefault(t, []).append(r["acceptable_ok"])

    return {
        "judgments": total,
        "answered_rate": round(len(rows) / max(total, 1), 3),
        "accuracy_acceptable": rate(lambda r: r["acceptable_ok"]),
        "accuracy_exact": rate(lambda r: r["exact_ok"]),
        "consistency_across_runs": round(consistent / max(len(complete), 1), 3) if runs > 1 else None,
        "schema_ok": rate(lambda r: r["schema_ok"]),
        "identity_leak_rate": rate(lambda r: bool(r["identity_leaks"])),
        "concise_ok": rate(lambda r: r["concise_ok"]),
        "grounded_rate": rate(
            lambda r: r.get("unsupported_claims") == [], [r for r in rows if "unsupported_claims" in r]
        ),
        "accuracy_by_tag": {t: round(sum(v) / len(v), 3) for t, v in sorted(by_tag.items())},
        "verdict_mix": dict(Counter(r["verdict"] for r in rows)),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prompt", default="v1", choices=sorted(PROMPTS))
    ap.add_argument("--runs", type=int, default=3, help="repeat the whole dataset to measure consistency")
    ap.add_argument("--batch", type=int, default=6, help="repos per judge call (production sends a day's scan)")
    ap.add_argument("--model", default=os.environ.get("EVAL_JUDGE_MODEL", "gemini-3.5-flash"))
    ap.add_argument("--grader-model", default=os.environ.get("EVAL_GRADER_MODEL", "gemini-3.5-flash"))
    ap.add_argument("--no-grader", action="store_true", help="skip the LLM grounding grader")
    ap.add_argument("--dataset", default=str(HERE / "dataset.json"))
    ap.add_argument("--profile", default=str(ROOT / "profile.md"))
    ap.add_argument("--timeout", type=int, default=90)
    ap.add_argument("--sleep", type=float, default=6, help="seconds between API calls (free-tier rate limits)")
    ap.add_argument("--attempts", type=int, default=3, help="tries per call for 429/5xx before giving up")
    args = ap.parse_args()

    _load_env_file()
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        sys.exit("Set GEMINI_API_KEY to run the eval.")

    cases = json.loads(Path(args.dataset).read_text())["cases"]
    profile = Path(args.profile).read_text()
    build = PROMPTS[args.prompt]
    results: list[dict] = []

    for run in range(args.runs):
        for b_idx, batch in enumerate(batches(cases, args.batch, seed=run)):
            label = f"[{args.prompt} run {run + 1}/{args.runs} batch {b_idx + 1}]"
            time.sleep(args.sleep)
            prompt = build(profile, [c["input"] for c in batch])
            try:
                output = _call_with_fallback(key, [args.model], prompt, args.attempts, args.timeout, label=label)
            except RuntimeError as e:
                print(f"{label} judge call failed: {e}", file=sys.stderr)
                output = None
            checks = code_checks(batch, output)
            rows = {}
            for c in batch:
                row = judgment_checks(checks["by_repo"].get(c["input"]["repo"]))
                row.update(
                    id=c["id"],
                    run=run,
                    tags=c["tags"],
                    expected=c["expected"],
                    coverage_ok=checks["coverage_ok"],
                )
                if row["answered"]:
                    row["acceptable_ok"] = row["verdict"] in c["acceptable"]
                    row["exact_ok"] = row["verdict"] == c["expected"]
                rows[c["id"]] = row
            if not args.no_grader and output:
                time.sleep(args.sleep)
                try:
                    claims = grade_grounding(key, args.grader_model, batch, rows, args.attempts, args.timeout)
                    for cid, found in claims.items():
                        if cid in rows:
                            rows[cid]["unsupported_claims"] = found
                except RuntimeError as e:
                    print(f"{label} grader failed: {e}", file=sys.stderr)
            results.extend(rows.values())

    summary = summarize(results, args.runs)
    if summary["answered_rate"] < 1:
        print(
            f"WARNING: only {summary['answered_rate']:.0%} of judgments came back; scores are partial.", file=sys.stderr
        )
    meta = {
        "prompt": args.prompt,
        "model": args.model,
        "grader_model": None if args.no_grader else args.grader_model,
        "runs": args.runs,
        "batch": args.batch,
        "cases": len(cases),
        "at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{args.prompt}.json"
    out_path.write_text(
        json.dumps({"meta": meta, "summary": summary, "results": results}, indent=2, ensure_ascii=False)
    )

    print(json.dumps({"meta": meta, "summary": summary}, indent=2))
    print("\nFailures:")
    for r in results:
        problems = []
        if not r.get("answered"):
            problems.append("missing")
        else:
            if not r["acceptable_ok"]:
                problems.append(f"verdict={r['verdict']} expected={r['expected']}")
            if r["identity_leaks"]:
                problems.append(f"leak={r['identity_leaks']}")
            if not r["concise_ok"]:
                problems.append(f"words={r['words']}")
            if r.get("unsupported_claims"):
                problems.append(f"unsupported={r['unsupported_claims']}")
        if problems:
            print(f"  run{r['run'] + 1} {r['id']}: " + "; ".join(problems))
    print(f"\nWrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
