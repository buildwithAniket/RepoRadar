"""CLI orchestrator for RepoRadar V3.

Three-stage pipeline:
  prepare  → fetch trending, diff, lazy-release-fetch, write .needs_evaluation.json
  judge    → LLM verdict via Gemini/OpenAI → verdicts.json
  finalize → merge verdicts into state, render report, email, git commit

Robustness: structured logging, config-driven state pruning, fail-fast on
missing scrape data, and RuntimeError propagation from the judge step.
"""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from diff_engine import split_by_classification
from github_api import get_latest_release
from judge import judge_repositories
from mailer import send_digest_email
from report import render_report
from scraper import fetch_trending_repos
from state import load_state, prune_state, save_state

try:
    from build_ui_data import build_ui_data
except ImportError:
    from src.build_ui_data import build_ui_data

NEEDS_EVALUATION = REPO_ROOT / ".needs_evaluation.json"
REPORTS_DIR = REPO_ROOT / "reports"

log = __import__("logger", fromlist=["log"]).log


def _load_config() -> dict:
    import yaml

    config_path = REPO_ROOT / "config.yaml"
    if config_path.is_file():
        with config_path.open("r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def _profile_mtime(profile_path: Path, today: str) -> str:
    if profile_path.exists():
        mtime = datetime.datetime.fromtimestamp(profile_path.stat().st_mtime).date()
        return mtime.isoformat()
    return today


def cmd_prepare(args: argparse.Namespace) -> None:
    today = datetime.date.today().isoformat()
    profile_path = Path(args.profile)
    profile_mtime = _profile_mtime(profile_path, today)
    config = _load_config()

    state = load_state()

    if args.repo:
        # Single-repo mode for testing
        from github_api import get_repo_metadata

        meta = get_repo_metadata(args.repo)
        release = get_latest_release(args.repo)
        trending = [
            {
                "repo": args.repo,
                "stars": meta["stars"],
                "latest_release": release,
                "description": meta["description"],
            }
        ]
        log.info("Single-repo mode: %s", args.repo)
    else:
        trending = fetch_trending_repos()

    if not trending:
        fail_on_empty = (config.get("scraper", {}) or {}).get("fail_on_empty", True)
        if fail_on_empty:
            log.error(
                "Trending scrape returned 0 repos. "
                "If this is expected (e.g. network issue), set scraper.fail_on_empty: false in config.yaml"
            )
            raise RuntimeError("Trending scrape returned no repositories")
        log.warning("Trending scrape returned 0 repos; continuing with empty list (fail_on_empty=false)")

    needs_evaluation, skipped = split_by_classification(trending, state, profile_mtime)
    log.info(
        "Diff engine: %d repo(s) need evaluation, %d skipped",
        len(needs_evaluation),
        skipped,
    )

    # Lazy fetch: only call the API for repos that pass the diff
    pending_release = [e for e in needs_evaluation if not e.get("latest_release")]
    if pending_release:
        log.info("Lazy-fetching latest release for %d repo(s)...", len(pending_release))
        for entry in pending_release:
            entry["latest_release"] = get_latest_release(entry["repo"])

    payload = {"date": today, "skipped": skipped, "repos": needs_evaluation}
    NEEDS_EVALUATION.write_text(json.dumps(payload, indent=2))
    log.info(
        "Prepare complete: %d evaluated, %d skipped. Written to .needs_evaluation.json", len(needs_evaluation), skipped
    )


def cmd_judge(args: argparse.Namespace) -> None:
    log.info("Starting LLM judgment (profile=%s, output=%s)", args.profile, args.out)
    try:
        judge_repositories(
            needs_evaluation_path=str(NEEDS_EVALUATION),
            profile_path=args.profile,
            output_path=args.out,
        )
        log.info("LLM judgment completed successfully.")
    except RuntimeError as e:
        log.error("LLM judgment failed: %s", e)
        raise


def cmd_finalize(args: argparse.Namespace) -> None:
    if not NEEDS_EVALUATION.exists():
        log.error(".needs_evaluation.json not found. Run `prepare` first.")
        return

    payload = json.loads(NEEDS_EVALUATION.read_text())
    verdicts_path = Path(args.verdicts)
    if not verdicts_path.exists():
        log.error("Verdicts file %s not found. Run `judge` first.", verdicts_path)
        return

    verdicts = json.loads(verdicts_path.read_text())
    verdicts_by_repo = {v["repo"]: v for v in verdicts}
    state = load_state()

    evaluated: list[dict] = []
    for entry in payload["repos"]:
        full_name = entry["repo"]
        v = verdicts_by_repo.get(full_name)
        if not v:
            log.warning("No verdict for %s; skipping", full_name)
            continue

        prior = entry.get("prior")
        first_seen = prior["first_seen"] if prior else payload["date"]

        state[full_name] = {
            "first_seen": first_seen,
            "last_checked": payload["date"],
            "stars_at_check": entry["stars"],
            "latest_release_at_check": entry.get("latest_release"),
            "verdict": v["verdict"],
            "reason": v["judgment"],
            "profile_checked_against": payload["date"],
        }
        evaluated.append(
            {
                "repo": full_name,
                "stars": entry["stars"],
                "reason": entry["reason"],
                "verdict": v["verdict"],
                "judgment": v["judgment"],
            }
        )

    # Prune stale state entries based on config
    config = _load_config()
    state_cfg = (config.get("state", {}) or {}) or {}
    max_age = state_cfg.get("prune_after_days", 90)
    max_entries = state_cfg.get("max_entries", 0)
    if max_age > 0 or max_entries > 0:
        state = prune_state(state, max_age_days=max_age, max_entries=max_entries)
        log.info("State pruned: %d entries retained", len(state))

    report = render_report(payload["date"], evaluated, payload["skipped"])
    save_state(state)

    REPORTS_DIR.mkdir(exist_ok=True)
    report_path = REPORTS_DIR / f"{payload['date']}.md"
    report_path.write_text(report)
    NEEDS_EVALUATION.unlink(missing_ok=True)

    log.info("Report written to %s", report_path)
    log.info("\n%s", report.rstrip())

    # Auto-regenerate UI data bundle
    try:
        build_ui_data()
        log.info("UI data bundle regenerated at ui/data/digests.js")
    except Exception as e:
        log.error("Failed to build UI data bundle: %s", e)

    dry_run = getattr(args, "dry_run", False)

    # Email digest
    if not dry_run:
        send_digest_email(f"RepoRadar Digest — {payload['date']}", report)
    else:
        log.info("[DRY-RUN] Email delivery skipped.")

    # Git commit and push
    if not dry_run:
        try:
            subprocess.run(
                ["git", "add", "seen-repos.json", "reports/", "ui/data/digests.js"],
                check=True,
                cwd=REPO_ROOT,
            )
            subprocess.run(
                ["git", "commit", "-m", f"RepoRadar digest for {payload['date']}"],
                check=True,
                cwd=REPO_ROOT,
            )
            log.info("Git commit created for %s", payload["date"])
        except Exception as e:
            log.warning("Git commit skipped/failed: %s", e)
    else:
        log.info("[DRY-RUN] Git commit skipped. Staging targets: seen-repos.json, reports/, ui/data/digests.js")


def main() -> None:
    parser = argparse.ArgumentParser(description="RepoRadar V3 Pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prep = subparsers.add_parser("prepare", help="Fetch trending, diff, lazy-fetch releases")
    prep.add_argument("--profile", default="profile.md")
    prep.add_argument("--repo", default=None, help="Single repo mode (owner/name)")

    j_parser = subparsers.add_parser("judge", help="LLM judgment → verdicts.json")
    j_parser.add_argument("--profile", default="profile.md")
    j_parser.add_argument("--out", default="verdicts.json")

    fin = subparsers.add_parser("finalize", help="Merge verdicts, report, email, commit")
    fin.add_argument("--verdicts", default="verdicts.json")
    fin.add_argument("--profile", default="profile.md")
    fin.add_argument(
        "--dry-run",
        action="store_true",
        help="Execute without sending email or creating git commit",
    )

    args = parser.parse_args()

    try:
        if args.command == "prepare":
            cmd_prepare(args)
        elif args.command == "judge":
            cmd_judge(args)
        elif args.command == "finalize":
            cmd_finalize(args)
    except Exception as e:
        log.error("Pipeline failed: %s", e)
        raise SystemExit(1) from e


if __name__ == "__main__":
    main()
