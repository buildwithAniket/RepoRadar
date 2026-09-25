"""Unit tests for src/build_ui_data.py.

Verifies deterministic digest data builder:
- Markdown parsing of every existing report (count-agnostic)
- Zero-repo date handling (2026-08-28, 2026-09-18, 2026-09-23)
- Fallback behavior for repos not in seen-repos.json
- Fallback behavior for missing language (must default to safe string for .toUpperCase())
- Star parsing variations (comma-separated, raw integer, k/m suffixes)
- Verdict and label normalizations (SELECT, REVIEW, PASS, emojis)
- JavaScript bundle generation and schema validity
- Node.js execution and require() verification
"""

import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "src"))

from build_ui_data import (
    build_ui_data,
    infer_language,
    normalize_verdict,
    parse_report_file,
    parse_stars,
)

REPO_BULLET_RE = re.compile(r"^- \*\*\[", re.MULTILINE)


def _discover_report_dates(reports_dir: Path) -> list:
    return sorted(p.stem for p in reports_dir.glob("*.md") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", p.stem))


def test_parse_all_existing_reports(tmp_path):
    """Verify every report in reports/ is discovered, parsed, and sorted, regardless of count."""
    reports_dir = REPO_ROOT / "reports"
    state_path = REPO_ROOT / "seen-repos.json"

    digests = build_ui_data(reports_dir=reports_dir, state_path=state_path, output_path=tmp_path / "digests.js")

    expected_dates = _discover_report_dates(reports_dir)
    assert expected_dates, "reports/ must contain at least one YYYY-MM-DD.md digest"

    actual_dates = list(digests.keys())
    assert actual_dates == expected_dates, f"Dates mismatch: {actual_dates} != {expected_dates}"

    # Each digest's repo count must match the repo bullets in its markdown source.
    for date in expected_dates:
        source = (reports_dir / f"{date}.md").read_text(encoding="utf-8")
        expected_repos = len(REPO_BULLET_RE.findall(source))
        assert len(digests[date]["repos"]) == expected_repos, f"{date}: repo count mismatch"
        assert digests[date]["evaluatedCount"] == expected_repos, f"{date}: evaluatedCount mismatch"


def test_zero_repo_dates_handling(tmp_path):
    """Verify zero-evaluation dates (2026-08-28, 2026-09-18, 2026-09-23)."""
    reports_dir = REPO_ROOT / "reports"
    state_path = REPO_ROOT / "seen-repos.json"
    digests = build_ui_data(reports_dir=reports_dir, state_path=state_path, output_path=tmp_path / "digests.js")

    zero_dates = {
        "2026-08-28": 19,
        "2026-09-18": 20,
        "2026-09-23": 8,
    }

    for date, expected_skipped in zero_dates.items():
        digest = digests[date]
        assert digest["date"] == date
        assert digest["evaluatedCount"] == 0
        assert len(digest["repos"]) == 0
        assert digest["skippedCount"] == expected_skipped
        assert digest["stats"] == {"fit": 0, "maybe": 0, "notFit": 0, "total": 0}
        assert digest["summary"]["evaluated"] == 0
        assert digest["summary"]["skipped"] == expected_skipped
        assert digest["summary"]["total"] == 0


def test_active_dates_statistics(tmp_path):
    """Verify active evaluation dates and their exact stats breakdowns."""
    reports_dir = REPO_ROOT / "reports"
    state_path = REPO_ROOT / "seen-repos.json"
    digests = build_ui_data(reports_dir=reports_dir, state_path=state_path, output_path=tmp_path / "digests.js")

    active_expectations = {
        "2026-08-29": {"eval": 9, "skip": 11, "fit": 4, "maybe": 2, "notFit": 3},
        "2026-09-03": {"eval": 18, "skip": 1, "fit": 10, "maybe": 4, "notFit": 4},
        "2026-09-15": {"eval": 19, "skip": 1, "fit": 8, "maybe": 5, "notFit": 6},
        "2026-09-17": {"eval": 13, "skip": 8, "fit": 7, "maybe": 3, "notFit": 3},
        "2026-09-22": {"eval": 8, "skip": 0, "fit": 4, "maybe": 2, "notFit": 2},
    }

    for date, exp in active_expectations.items():
        digest = digests[date]
        assert digest["evaluatedCount"] == exp["eval"], f"Evaluated count mismatch for {date}"
        assert digest["skippedCount"] == exp["skip"], f"Skipped count mismatch for {date}"
        assert digest["stats"]["fit"] == exp["fit"], f"Fit count mismatch for {date}"
        assert digest["stats"]["maybe"] == exp["maybe"], f"Maybe count mismatch for {date}"
        assert digest["stats"]["notFit"] == exp["notFit"], f"Not-fit count mismatch for {date}"
        assert digest["stats"]["total"] == exp["eval"]
        assert len(digest["repos"]) == exp["eval"]

        # Ensure every repo has valid fields
        for r in digest["repos"]:
            assert r["id"] and "/" in r["id"]
            assert r["owner"]
            assert r["name"]
            assert isinstance(r["stars"], int)
            assert isinstance(r["language"], str) and len(r["language"]) > 0
            assert r["language"].upper()  # Must not crash
            assert r["verdict"] in ("fit", "maybe", "not-fit")
            assert r["verdictLabel"] in ("OFFICIAL SELECTION", "UNDER REVIEW", "ARCHIVED / PASS")
            assert r["confidence"] in ("high", "medium", "low")
            assert r["pushedAt"] and len(r["pushedAt"]) == 10
            assert r["url"].startswith("https://github.com/")


def test_star_parsing_formats():
    """Verify parsing of various star number formats."""
    assert parse_stars("46,218") == 46218
    assert parse_stars("122157") == 122157
    assert parse_stars("0") == 0
    assert parse_stars("") == 0
    assert parse_stars(None) == 0
    assert parse_stars("  24,000 ") == 24000
    assert parse_stars("1.5k") == 1500
    assert parse_stars("10k") == 10000
    assert parse_stars("2.5M") == 2500000
    assert parse_stars("invalid_stars") == 0


def test_verdict_normalization():
    """Verify verdict headers and variations are normalized correctly."""
    # Emojis & Standard
    assert normalize_verdict("## 🟢 Fit") == "fit"
    assert normalize_verdict("## 🟡 Maybe") == "maybe"
    assert normalize_verdict("## 🔴 Not Fit") == "not-fit"

    # Keywords SELECT, REVIEW, PASS
    assert normalize_verdict("## SELECT") == "fit"
    assert normalize_verdict("## Official Selection") == "fit"
    assert normalize_verdict("## REVIEW") == "maybe"
    assert normalize_verdict("## Under Review") == "maybe"
    assert normalize_verdict("## PASS") == "not-fit"
    assert normalize_verdict("## Archived / Pass") == "not-fit"
    assert normalize_verdict("## Out of Competition") == "not-fit"


def test_fallback_when_repo_not_in_seen_repos(tmp_path):
    """Verify graceful fallback values when a repo in report is NOT present in seen-repos.json."""
    custom_report = tmp_path / "2026-10-01.md"
    custom_report.write_text(
        "# RepoRadar Daily Digest — 2026-10-01\n\n"
        "Scanned trending repositories: evaluated 1 (skipped 0 unchanged/filtered).\n\n"
        "## 🟢 Fit\n"
        "- **[custom-org/future-agent](https://github.com/custom-org/future-agent)** (5,432 stars) [new]: Synthetic evaluation test.\n"
    )

    empty_state = {}
    digest = parse_report_file(custom_report, empty_state)

    assert digest["evaluatedCount"] == 1
    assert len(digest["repos"]) == 1
    repo = digest["repos"][0]

    assert repo["id"] == "custom-org/future-agent"
    assert repo["owner"] == "custom-org"
    assert repo["name"] == "future-agent"
    assert repo["stars"] == 5432
    assert repo["pushedAt"] == "2026-10-01"
    assert repo["verdict"] == "fit"
    assert repo["verdictLabel"] == "OFFICIAL SELECTION"
    assert repo["confidence"] == "high"
    assert repo["reason"] == "Synthetic evaluation test."
    assert repo["url"] == "https://github.com/custom-org/future-agent"
    assert repo["topics"] == []
    # Language fallback
    assert repo["language"] in ("Python", "TypeScript", "Unknown")
    assert repo["language"].upper()


def test_fallback_when_language_is_missing():
    """Verify language fallback when no known lookup or keyword is matched."""
    # Unknown repo with neutral judgment
    lang = infer_language("xyz123/foobar999", "Some arbitrary generic project description.")
    assert lang == "Unknown"
    # Calling .upper() should evaluate cleanly without error
    assert lang.upper() == "UNKNOWN"

    # Known repos should return curated language
    assert infer_language("abhigyanpatwari/GitNexus") == "TypeScript"
    assert infer_language("NousResearch/hermes-agent") == "Python"
    assert infer_language("dani-garcia/vaultwarden") == "Rust"

    # Heuristic inference from keywords
    assert infer_language("my-org/neural-flow", "A new Python framework for agents.") == "Python"
    assert infer_language("my-org/web-runner", "Rust-based high speed executor.") == "Rust"


def test_seen_repos_metadata_join(tmp_path):
    """Verify metadata from seen-repos.json is correctly joined."""
    test_report = tmp_path / "2026-10-02.md"
    test_report.write_text(
        "# RepoRadar Daily Digest — 2026-10-02\n\n"
        "Scanned trending repositories: evaluated 1 (skipped 0 unchanged/filtered).\n\n"
        "## 🟡 Maybe\n"
        "- **[test-org/rich-repo](https://github.com/test-org/rich-repo)** (100 stars) [resurfaced]: Rich metadata test.\n"
    )

    state = {
        "test-org/rich-repo": {
            "stars_at_check": 9999,
            "latest_release_at_check": "2026-09-28T14:30:00Z",
            "language": "Go",
            "confidence": "high",
            "topics": ["ai", "agents", "golang"],
            "reason": "Stored historical reason.",
        }
    }

    digest = parse_report_file(test_report, state)
    repo = digest["repos"][0]

    assert repo["stars"] == 9999
    assert repo["pushedAt"] == "2026-09-28"
    assert repo["language"] == "Go"
    assert repo["confidence"] == "high"
    assert repo["topics"] == ["ai", "agents", "golang"]
    assert repo["classification"] == "resurfaced"


def test_javascript_bundle_generation(tmp_path):
    """Verify that build_ui_data creates a valid JavaScript bundle with expected wrapper."""
    out_file = tmp_path / "digests.js"
    build_ui_data(
        reports_dir=REPO_ROOT / "reports",
        state_path=REPO_ROOT / "seen-repos.json",
        output_path=out_file,
    )

    assert out_file.is_file()
    content = out_file.read_text(encoding="utf-8")

    assert "window.REPORADAR_DIGESTS = {" in content
    assert "if (typeof module !== 'undefined' && module.exports)" in content
    assert "module.exports = window.REPORADAR_DIGESTS;" in content
    assert "Object.defineProperty(window.REPORADAR_DIGESTS, 'dates'" in content
    assert "Object.defineProperty(window.REPORADAR_DIGESTS, 'latestDate'" in content
    assert "Object.defineProperty(window.REPORADAR_DIGESTS, 'latestActiveDate'" in content


def test_node_execution_of_bundle(tmp_path):
    """Verify Node.js can require a freshly built bundle and that it mirrors the Python digests."""
    digests_js = tmp_path / "digests.js"
    digests = build_ui_data(
        reports_dir=REPO_ROOT / "reports",
        state_path=REPO_ROOT / "seen-repos.json",
        output_path=digests_js,
    )
    assert digests_js.is_file()

    dates = sorted(digests)
    active_dates = [d for d in dates if digests[d]["evaluatedCount"] > 0]
    expected = {
        "count": len(digests),
        "latestDate": dates[-1],
        "latestActiveDate": active_dates[-1] if active_dates else None,
    }

    node_script = (
        f"const d = require({json.dumps(str(digests_js))});"
        f"const expected = {json.dumps(expected)};"
        "if (!d || typeof d !== 'object') process.exit(1);"
        "const keys = Object.keys(d);"
        "if (keys.length !== expected.count) process.exit(2);"
        "if (d.latestDate !== expected.latestDate) process.exit(3);"
        "if (expected.latestActiveDate && d.latestActiveDate !== expected.latestActiveDate) process.exit(4);"
        "console.log('NODE_OK');"
    )

    result = subprocess.run(
        ["node", "-e", node_script],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, f"Node execution failed: {result.stderr}"
    assert "NODE_OK" in result.stdout


def test_missing_state_file_resilience(tmp_path):
    """Verify build_ui_data handles non-existent seen-repos.json file gracefully."""
    empty_reports = tmp_path / "reports"
    empty_reports.mkdir()
    (empty_reports / "2026-08-28.md").write_text(
        "# RepoRadar Daily Digest — 2026-08-28\n\n"
        "Scanned trending repositories: evaluated 0 (skipped 5 unchanged/filtered).\n"
    )

    non_existent_state = tmp_path / "does_not_exist.json"
    out_file = tmp_path / "out.js"

    digests = build_ui_data(
        reports_dir=empty_reports,
        state_path=non_existent_state,
        output_path=out_file,
    )

    assert "2026-08-28" in digests
    assert digests["2026-08-28"]["skippedCount"] == 5
    assert out_file.is_file()


def test_cli_execution(tmp_path):
    """Verify that running src/build_ui_data.py as a CLI script succeeds with exit code 0."""
    out_file = tmp_path / "cli_digests.js"
    result = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "src" / "build_ui_data.py"),
            "--reports-dir",
            str(REPO_ROOT / "reports"),
            "--state-path",
            str(REPO_ROOT / "seen-repos.json"),
            "--output-path",
            str(out_file),
            "--log-level",
            "DEBUG",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"CLI execution failed: {result.stderr}"
    assert out_file.is_file()
    combined_output = result.stdout + result.stderr
    match = re.search(r"Successfully wrote (\d+) digests", combined_output)
    assert match, f"Missing success line in CLI output: {combined_output}"
    assert int(match.group(1)) == len(_discover_report_dates(REPO_ROOT / "reports"))
