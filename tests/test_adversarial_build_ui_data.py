"""Adversarial Stress Test Suite for src/build_ui_data.py (Milestone 1 Challenge).

Empirically challenges:
1. Star parsing with extreme values (inf, -inf, 1e500, NaN, suffixes, negative numbers).
2. Corrupted or partial seen-repos.json (null entries, primitives, arrays, bad types).
3. Section header edge cases, substring traps (Unfit, Profit), non-standard verdicts.
4. Varied report line formatting, unicode, markdown variants, missing fields.
5. Summary line placement and inconsistencies.
6. Schema contract conformance (pushedAt 10-char format, non-empty fields).
7. JavaScript bundle validity under adversarial payloads via Node.js execution.
8. Directory filtering and scale performance.
"""

import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "src"))

from build_ui_data import (
    build_ui_data,
    generate_js_content,
    infer_language,
    load_seen_repos,
    normalize_verdict,
    parse_report_file,
    parse_stars,
)

# ---------------------------------------------------------------------------
# 1. Star Parsing Stress Tests (Extreme Values, Non-integers, Overflows)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw_input,expected",
    [
        ("46,218", 46218),
        ("122157", 122157),
        ("0", 0),
        ("", 0),
        (None, 0),
        ("   ", 0),
        ("1.5k", 1500),
        ("10k", 10000),
        ("2.5M", 2500000),
        ("invalid", 0),
        ("nan", 0),
        ("none", 0),
        ("null", 0),
        ("???", 0),
        ("1.2.3", 0),
    ],
)
def test_parse_stars_benign_variations(raw_input, expected):
    """Verify parse_stars handles typical strings, blanks, and suffixes cleanly."""
    assert parse_stars(raw_input) == expected


def test_parse_stars_infinity_overflow_crash():
    """VULNERABILITY PROBE: parse_stars crashes on inf/infinity with OverflowError.

    float('inf') succeeds, but int(float('inf')) raises OverflowError which is
    not caught by `except ValueError:`.
    """
    for inf_val in ["inf", "-inf", "infinity", "+infinity", "1e500", "infk", "infinitym"]:
        try:
            val = parse_stars(inf_val)
            assert val == 0, f"Expected 0 for {inf_val}, got {val}"
        except OverflowError as e:
            pytest.fail(f"parse_stars('{inf_val}') crashed with unhandled OverflowError: {e}")


# ---------------------------------------------------------------------------
# 2. Corrupted and Partial seen-repos.json Stress Tests
# ---------------------------------------------------------------------------


def test_corrupted_seen_repos_null_entry_crash(tmp_path):
    """VULNERABILITY PROBE: A null entry in seen-repos.json crashes parse_report_file.

    When seen-repos.json has {"owner/repo": null}, seen_repos.get(repo_id, {})
    returns None, causing seen_entry.get(...) to raise AttributeError.
    """
    report_file = tmp_path / "2026-10-10.md"
    report_file.write_text("- **[test-org/null-repo](https://github.com/test-org/null-repo)** (100 stars): Reason.\n")

    corrupted_state = {"test-org/null-repo": None}
    try:
        digest = parse_report_file(report_file, corrupted_state)
        assert len(digest["repos"]) == 1
        assert digest["repos"][0]["stars"] == 100
    except AttributeError as e:
        pytest.fail(f"parse_report_file crashed on null seen_entry: {e}")


@pytest.mark.parametrize("bad_val", ["corrupted_string", 12345, [1, 2, 3], True])
def test_corrupted_seen_repos_primitive_entry_crash(tmp_path, bad_val):
    """VULNERABILITY PROBE: Primitive values as seen-repos entries crash with AttributeError."""
    report_file = tmp_path / "2026-10-10.md"
    report_file.write_text("- **[test-org/bad-val](https://github.com/test-org/bad-val)** (50 stars): Reason.\n")

    corrupted_state = {"test-org/bad-val": bad_val}
    try:
        digest = parse_report_file(report_file, corrupted_state)
        assert len(digest["repos"]) == 1
    except (AttributeError, TypeError) as e:
        pytest.fail(f"parse_report_file crashed on entry type {type(bad_val).__name__}: {e}")


def test_corrupted_seen_repos_nan_and_inf_stars(tmp_path):
    """VULNERABILITY PROBE: NaN or Infinity stars_at_check in seen-repos crash with ValueError/OverflowError.

    In Python, isinstance(float('nan'), (int, float)) is True and nan <= 0 is False.
    Calling int(float('nan')) raises ValueError.
    """
    report_file = tmp_path / "2026-10-10.md"
    report_file.write_text("- **[test-org/nan-repo](https://github.com/test-org/nan-repo)** (42 stars): Reason.\n")

    state_nan = {"test-org/nan-repo": {"stars_at_check": float("nan")}}
    try:
        digest = parse_report_file(report_file, state_nan)
        assert digest["repos"][0]["stars"] in (42, 0)
    except ValueError as e:
        pytest.fail(f"parse_report_file crashed on stars_at_check=NaN with ValueError: {e}")

    state_inf = {"test-org/nan-repo": {"stars_at_check": float("inf")}}
    try:
        digest = parse_report_file(report_file, state_inf)
        assert digest["repos"][0]["stars"] in (42, 0)
    except OverflowError as e:
        pytest.fail(f"parse_report_file crashed on stars_at_check=Infinity with OverflowError: {e}")


def test_corrupted_seen_repos_non_string_verdict_crash(tmp_path):
    """VULNERABILITY PROBE: Non-string verdict in seen_entry crashes when current_verdict is None.

    If no section header precedes the repo, verdict defaults to seen_entry.get('verdict').
    If verdict is [1, 2], checking 'if verdict not in VERDICT_MAP' raises TypeError (unhashable).
    If verdict is 123, normalize_verdict(123) raises AttributeError: 'int' object has no attribute 'lower'.
    """
    report_file = tmp_path / "2026-10-10.md"
    report_file.write_text("- **[test-org/no-hdr](https://github.com/test-org/no-hdr)** (10 stars): Reason.\n")

    for bad_verdict in [123, ["fit"], {"v": "fit"}, True]:
        state = {"test-org/no-hdr": {"verdict": bad_verdict}}
        try:
            digest = parse_report_file(report_file, state)
            assert digest["repos"][0]["verdict"] in ("fit", "maybe", "not-fit")
        except (AttributeError, TypeError) as e:
            pytest.fail(f"parse_report_file crashed on verdict={bad_verdict!r} with {type(e).__name__}: {e}")


def test_malformed_seen_repos_files(tmp_path):
    """Verify load_seen_repos handles invalid JSON syntax, empty files, and non-dict JSON root."""
    empty_file = tmp_path / "empty.json"
    empty_file.write_text("")
    assert load_seen_repos(empty_file) == {}

    malformed_json = tmp_path / "broken.json"
    malformed_json.write_text('{"unterminated": ')
    assert load_seen_repos(malformed_json) == {}

    array_json = tmp_path / "array.json"
    array_json.write_text('[{"repo": 1}]')
    assert load_seen_repos(array_json) == {}

    primitive_json = tmp_path / "primitive.json"
    primitive_json.write_text('"hello string"')
    assert load_seen_repos(primitive_json) == {}


# ---------------------------------------------------------------------------
# 3. Section Header Parsing & Substring Traps
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "header,expected_verdict",
    [
        ("## 🟢 Fit", "fit"),
        ("## 🟡 Maybe", "maybe"),
        ("## 🔴 Not Fit", "not-fit"),
        ("## SELECT", "fit"),
        ("## REVIEW", "maybe"),
        ("## PASS", "not-fit"),
        ("## Official Selection", "fit"),
        ("## Under Review", "maybe"),
        ("## Archived / Pass", "not-fit"),
        ("## Out of Competition", "not-fit"),
        ("### 🟢 Level 3 Fit Header", "fit"),
        ("## [CRITIC'S CHOICE]", "fit"),
        ("## Arbitrary Unknown Section", "maybe"),
    ],
)
def test_normalize_verdict_standard_and_variants(header, expected_verdict):
    """Verify verdict normalization across standard and alternative headings."""
    assert normalize_verdict(header) == expected_verdict


def test_normalize_verdict_substring_false_positives():
    """VULNERABILITY PROBE: Substring matching causes false 'fit' verdicts for 'Unfit' / 'Profit' / 'Benefits'.

    'fit' in 'unfit' -> returns 'fit' instead of 'not-fit'!
    'fit' in 'profit' -> returns 'fit' instead of 'maybe'!
    """
    verdict_unfit = normalize_verdict("## Unfit Candidates")
    assert verdict_unfit != "fit", f"'## Unfit Candidates' falsely normalized to '{verdict_unfit}'"


# ---------------------------------------------------------------------------
# 4. Report Line Parsing, Variations & Unicode Handling
# ---------------------------------------------------------------------------


def test_unicode_and_special_characters_in_digest(tmp_path):
    """Verify full unicode support: Japanese, Chinese, Cyrillic, Emoji, script tags."""
    report_file = tmp_path / "2026-11-01.md"
    report_file.write_text(
        "# RepoRadar Daily Digest — 2026-11-01\n\n"
        "Scanned trending repositories: evaluated 2 (skipped 0 unchanged/filtered).\n\n"
        "## 🟢 Fit\n"
        "- **[开源组织/智能体-🚀](https://github.com/开源组织/智能体-🚀)** (1,234 stars) [new]: 全功能智能体平台 🎯。\n"
        "## 🟡 Maybe\n"
        '- **[cyrillic-org/проект](https://github.com/cyrillic-org/проект)** (50 stars): Тестовое описание с "кавычками" & </script><script>alert(1)</script>.\n',
        encoding="utf-8",
    )

    digest = parse_report_file(report_file, {})
    assert digest["evaluatedCount"] == 2
    assert len(digest["repos"]) == 2

    r1 = digest["repos"][0]
    assert r1["id"] == "开源组织/智能体-🚀"
    assert r1["owner"] == "开源组织"
    assert r1["name"] == "智能体-🚀"
    assert r1["stars"] == 1234
    assert r1["verdict"] == "fit"
    assert "全功能智能体平台" in r1["reason"]

    r2 = digest["repos"][1]
    assert r2["id"] == "cyrillic-org/проект"
    assert r2["owner"] == "cyrillic-org"
    assert r2["name"] == "проект"
    assert r2["stars"] == 50
    assert r2["verdict"] == "maybe"
    assert "</script>" in r2["reason"]

    # Verify bundle generation and Node.js execution with unicode and script tags
    digests = {"2026-11-01": digest}
    out_js = tmp_path / "digests_unicode.js"
    out_js.write_text(generate_js_content(digests), encoding="utf-8")

    node_cmd = [
        "node",
        "-e",
        f"const d = require('{out_js.resolve()}');"
        "if (d['2026-11-01'].repos[0].name !== '智能体-🚀') process.exit(1);"
        "if (!d['2026-11-01'].repos[1].reason.includes('</script>')) process.exit(2);"
        "console.log('NODE_UNICODE_OK');",
    ]
    res = subprocess.run(node_cmd, capture_output=True, text=True, check=False)
    assert res.returncode == 0, f"Node.js execution failed: {res.stderr}"
    assert "NODE_UNICODE_OK" in res.stdout


def test_empty_candidate_list_and_zero_byte_report(tmp_path):
    """Verify builder handles 0-byte reports and reports with headers but zero repos."""
    reports_dir = tmp_path / "reports"
    reports_dir.mkdir()

    # File 1: Completely empty 0-byte file
    (reports_dir / "2026-10-01.md").write_text("")

    # File 2: Headers only, no repos
    (reports_dir / "2026-10-02.md").write_text(
        "# RepoRadar Daily Digest — 2026-10-02\n\n"
        "Scanned trending repositories: evaluated 0 (skipped 15 unchanged/filtered).\n\n"
        "## 🟢 Fit\n\n"
        "## 🟡 Maybe\n\n"
        "## 🔴 Not Fit\n"
    )

    out_js = tmp_path / "digests_empty.js"
    digests = build_ui_data(
        reports_dir=reports_dir,
        state_path=tmp_path / "seen-repos.json",
        output_path=out_js,
    )

    assert "2026-10-01" in digests
    assert digests["2026-10-01"]["evaluatedCount"] == 0
    assert digests["2026-10-01"]["repos"] == []

    assert "2026-10-02" in digests
    assert digests["2026-10-02"]["evaluatedCount"] == 0
    assert digests["2026-10-02"]["skippedCount"] == 15
    assert digests["2026-10-02"]["repos"] == []


def test_repo_line_missing_stars_or_tags(tmp_path):
    """Verify parser parses repo lines that omit star count or classification tag."""
    report_file = tmp_path / "2026-10-05.md"
    report_file.write_text(
        "# RepoRadar Daily Digest — 2026-10-05\n\n"
        "## 🟢 Fit\n"
        "- **[org/no-stars](https://github.com/org/no-stars)**: Project without star count.\n"
        "- **[org/no-tag](https://github.com/org/no-tag)** (250 stars): Project without tag.\n"
        "- **[org/neither](https://github.com/org/neither)**: Project without both.\n"
    )

    digest = parse_report_file(report_file, {})
    assert len(digest["repos"]) == 3

    r0 = digest["repos"][0]
    assert r0["id"] == "org/no-stars"
    assert r0["stars"] == 0
    assert r0["classification"] == "new"

    r1 = digest["repos"][1]
    assert r1["id"] == "org/no-tag"
    assert r1["stars"] == 250
    assert r1["classification"] == "new"

    r2 = digest["repos"][2]
    assert r2["id"] == "org/neither"
    assert r2["stars"] == 0
    assert r2["classification"] == "new"


# ---------------------------------------------------------------------------
# 5. Schema Contract & Fallback Predictability Stress Tests
# ---------------------------------------------------------------------------


def test_pushed_at_date_format_contract(tmp_path):
    """VULNERABILITY PROBE: pushedAt must adhere to <YYYY-MM-DD> (10 chars).

    When latest_release_at_check is absent but last_checked contains an ISO timestamp
    (e.g. '2026-09-28T14:30:00Z'), pushedAt is output as 20 characters instead of 10.
    """
    report_file = tmp_path / "2026-10-08.md"
    report_file.write_text("- **[org/iso-repo](https://github.com/org/iso-repo)** (10 stars): Test.\n")

    state = {
        "org/iso-repo": {
            "last_checked": "2026-09-28T14:30:00Z",
        }
    }
    digest = parse_report_file(report_file, state)
    pushed_at = digest["repos"][0]["pushedAt"]
    assert (
        len(pushed_at) == 10
    ), f"pushedAt contract violation: expected 10 chars (YYYY-MM-DD), got '{pushed_at}' ({len(pushed_at)} chars)"


def test_language_fallback_never_none_or_empty():
    """Verify language is never None or empty string under arbitrary garbage inputs."""
    for bad_input in ["", "   ", "???", "xyz/123", "!@#$%^&*()"]:
        lang = infer_language(bad_input, default="")
        assert lang and isinstance(lang, str), f"infer_language failed for '{bad_input}'"
        assert lang.upper()  # Must never raise AttributeError


def test_empty_reports_directory_generates_valid_empty_js_bundle(tmp_path):
    """Verify build_ui_data on an empty directory generates syntactically valid JS."""
    empty_reports = tmp_path / "empty_reports"
    empty_reports.mkdir()
    out_js = tmp_path / "empty_digests.js"

    digests = build_ui_data(
        reports_dir=empty_reports,
        state_path=tmp_path / "non_existent.json",
        output_path=out_js,
    )

    assert digests == {}
    assert out_js.is_file()

    # Node.js execution verification
    node_cmd = [
        "node",
        "-e",
        f"const d = require('{out_js.resolve()}');"
        "if (typeof d !== 'object') process.exit(1);"
        "if (Object.keys(d).length !== 0) process.exit(2);"
        "console.log('NODE_EMPTY_OK');",
    ]
    res = subprocess.run(node_cmd, capture_output=True, text=True, check=False)
    assert res.returncode == 0, f"Node failed on empty digests bundle: {res.stderr}"
    assert "NODE_EMPTY_OK" in res.stdout


# ---------------------------------------------------------------------------
# 6. Non-matching Files & High Scale Report Stress Tests
# ---------------------------------------------------------------------------


def test_directory_filtering_ignores_non_conforming_filenames(tmp_path):
    """Verify build_ui_data strictly ignores non-YYYY-MM-DD.md files in reports directory."""
    rep_dir = tmp_path / "reports"
    rep_dir.mkdir()

    (rep_dir / "2026-08-28.md").write_text("# RepoRadar Daily Digest — 2026-08-28\n")
    (rep_dir / "2026-08-28.md.bak").write_text("# Backup\n")
    (rep_dir / "README.md").write_text("# Readme\n")
    (rep_dir / "summary.json").write_text("{}\n")
    (rep_dir / ".hidden-2026-08-28.md").write_text("# Hidden\n")

    out_js = tmp_path / "filter_digests.js"
    digests = build_ui_data(
        reports_dir=rep_dir,
        state_path=tmp_path / "seen.json",
        output_path=out_js,
    )

    assert list(digests.keys()) == ["2026-08-28"]


def test_scale_large_report_execution_time(tmp_path):
    """Stress test parser performance on a large report with 500 repositories."""
    import time

    rep_file = tmp_path / "2026-12-31.md"
    lines = ["# RepoRadar Daily Digest — 2026-12-31\n\n## 🟢 Fit\n"]
    for i in range(500):
        lines.append(
            f"- **[scale-org/repo-{i}](https://github.com/scale-org/repo-{i})** ({i*10} stars) [new]: Synthetic stress test repo number {i}.\n"
        )
    rep_file.write_text("".join(lines))

    start_time = time.perf_counter()
    digest = parse_report_file(rep_file, {})
    elapsed = time.perf_counter() - start_time

    assert digest["evaluatedCount"] == 500
    assert len(digest["repos"]) == 500
    assert elapsed < 1.0, f"Parsing 500 repos took too long: {elapsed:.2f}s"
