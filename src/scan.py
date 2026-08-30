"""CLI wiring: `prepare` fetches + classifies trending repos, `finalize` merges judged verdicts."""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from diff_engine import split_by_classification  # noqa: E402
from fetch_trending import fetch_trending_repos  # noqa: E402
from github_api import get_latest_release, get_repo_metadata  # noqa: E402
from report import render_report  # noqa: E402
from state import load_state, save_state  # noqa: E402
from trending_data import load_and_validate  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
NEEDS_EVALUATION_PATH = REPO_ROOT / ".needs_evaluation.json"
REPORTS_DIR = REPO_ROOT / "reports"
DEFAULT_PROFILE_PATH = REPO_ROOT.parent / "RepoRadar-private" / "profile.md"
DESCRIPTION_MAX_LEN = 300


def _today() -> str:
    return datetime.date.today().isoformat()


def _profile_mtime(profile_path: Path) -> str:
    """Return profile.md's last-changed date per git history."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", profile_path.name],
            cwd=profile_path.parent,
            capture_output=True,
            text=True,
            check=True,
        )
        output = result.stdout.strip()
        if output:
            return output
    except (subprocess.CalledProcessError, OSError):
        pass
    return datetime.date.today().isoformat()


def _truncate_description(description: str | None) -> str | None:
    if description is None or len(description) <= DESCRIPTION_MAX_LEN:
        return description
    return description[:DESCRIPTION_MAX_LEN] + "..."


def cmd_prepare(args: argparse.Namespace) -> None:
    try:
        today = _today()
        state = load_state()
        profile_path = Path(args.profile_path) if args.profile_path else DEFAULT_PROFILE_PATH
        if not profile_path.is_file():
            raise FileNotFoundError(
                f"profile.md not found at {profile_path} — is the RepoRadar-private repo checked out as a sibling directory?"
            )

        if args.trending_data:
            trending = load_and_validate(args.trending_data, state, strict=args.strict)
        else:
            repo_names = fetch_trending_repos()
            trending = []
            for full_name in repo_names:
                try:
                    metadata = get_repo_metadata(full_name)
                    latest_release = get_latest_release(full_name)
                except Exception as exc:  # noqa: BLE001
                    print(f"warning: skipping {full_name} ({exc})", file=sys.stderr)
                    continue
                trending.append({
                    "repo": full_name,
                    "stars": metadata["stars"],
                    "latest_release": latest_release,
                    "description": metadata["description"],
                })

        for repo in trending:
            repo["description"] = _truncate_description(repo.get("description"))

        needs_evaluation, skipped = split_by_classification(
            trending, state, _profile_mtime(profile_path), today
        )
        payload = {"date": today, "skipped": skipped, "repos": needs_evaluation}
        with NEEDS_EVALUATION_PATH.open("w") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
            f.write("\n")
        print(f"prepare: fetched {len(trending)} trending repo(s), {len(needs_evaluation)} need evaluation, {skipped} skipped.")
    except (ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)


def _public_verdict(verdict: str) -> str:
    """Return a fixed public-safe explanation; never expose the LLM's private judgment."""
    return {
        "fit": "This repository was classified as a strong match.",
        "maybe": "This repository was classified as worth a second look.",
        "not-fit": "This repository was classified as outside the current focus.",
    }.get(verdict, "This repository was classified by RepoRadar.")


def cmd_finalize(args: argparse.Namespace) -> None:
    try:
        with NEEDS_EVALUATION_PATH.open() as f:
            needs_evaluation = json.load(f)
        with Path(args.verdicts).open() as f:
            verdicts = json.load(f)
        verdicts_by_repo = {v["repo"]: v for v in verdicts}
        date = needs_evaluation["date"]
        skipped = needs_evaluation["skipped"]
        state = load_state()
        evaluated = []

        for entry in needs_evaluation["repos"]:
            full_name = entry["repo"]
            verdict_entry = verdicts_by_repo.get(full_name)
            if verdict_entry is None:
                print(f"warning: no verdict for {full_name}, skipping", file=sys.stderr)
                continue
            verdict = verdict_entry["verdict"]
            prior = entry.get("prior")
            first_seen = prior["first_seen"] if prior else date

            # Public state contains only operational metadata and the verdict. The LLM judgment
            # can contain private-profile reasoning and must never be persisted here.
            state[full_name] = {
                "first_seen": first_seen,
                "last_checked": date,
                "stars_at_check": entry["stars"],
                "latest_release_at_check": entry.get("latest_release"),
                "verdict": verdict,
                "profile_checked_against": date,
            }

            evaluated.append({
                "repo": full_name,
                "stars": entry["stars"],
                "reason": entry["reason"],
                "verdict": verdict,
                "judgment": _public_verdict(verdict),
            })

        report = render_report(date, evaluated, skipped)
        save_state(state)
        REPORTS_DIR.mkdir(exist_ok=True)
        (REPORTS_DIR / f"{date}.md").write_text(report)
        NEEDS_EVALUATION_PATH.unlink(missing_ok=True)
        print(report)
    except (ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="RepoRadar scan pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare", help="fetch + classify today's trending repos")
    prepare_parser.add_argument("--trending-data", dest="trending_data", default=None)
    prepare_parser.add_argument("--strict", action="store_true")
    prepare_parser.add_argument("--profile-path", dest="profile_path", default=None)
    finalize_parser = subparsers.add_parser("finalize", help="merge verdicts and write the report")
    finalize_parser.add_argument("--verdicts", required=True, help="path to verdicts.json")
    args = parser.parse_args()
    if args.command == "prepare":
        cmd_prepare(args)
    elif args.command == "finalize":
        cmd_finalize(args)


if __name__ == "__main__":
    main()
