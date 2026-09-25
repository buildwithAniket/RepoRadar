"""Adversarial stress-test suite for Milestone 3: Pipeline Auto-Sync Hook in src/scan.py.

Empirically tests failure modes, edge cases, and architectural resilience:
1. build_ui_data exception propagation & recovery (disk full, permissions, memory, corrupted input).
2. Strict execution ordering (save_state -> report write -> build_ui_data -> email/git).
3. Dry-run safety guarantees (zero git commits, zero emails, data builder always executed).
4. Git subprocess failure resilience (missing git binary, non-zero return codes, clean working tree).
5. Target pathspecs validity against actual repository filesystem layout.
6. Real CLI subprocess execution with --dry-run.
"""

from __future__ import annotations

import argparse
import functools
import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "src"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import src.scan as scan


@pytest.fixture
def isolated_scan_env(tmp_path, monkeypatch):
    """Provide an isolated environment for scan.py cmd_finalize tests."""
    test_date = "2026-09-24"
    needs_eval = tmp_path / ".needs_evaluation.json"
    verdicts = tmp_path / "verdicts.json"
    reports_dir = tmp_path / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "date": test_date,
        "skipped": 1,
        "repos": [
            {
                "repo": "adversarial-org/stress-target",
                "stars": 9999,
                "reason": "new",
                "latest_release": "v9.9.9",
            }
        ],
    }
    verdict_data = [
        {
            "repo": "adversarial-org/stress-target",
            "verdict": "fit",
            "judgment": "Adversarial stress test selection.",
        }
    ]

    needs_eval.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    verdicts.write_text(json.dumps(verdict_data, indent=2), encoding="utf-8")

    fake_state = {}

    def mock_load():
        return dict(fake_state)

    def mock_save(s):
        fake_state.clear()
        fake_state.update(s)

    monkeypatch.setattr(scan, "NEEDS_EVALUATION", needs_eval)
    monkeypatch.setattr(scan, "REPORTS_DIR", reports_dir)
    monkeypatch.setattr(scan, "load_state", mock_load)
    monkeypatch.setattr(scan, "save_state", mock_save)
    # Point the real UI builder at this isolated environment so finalize never
    # reads the repo's reports/ or overwrites the committed ui/data/digests.js.
    ui_data_file = tmp_path / "ui" / "data" / "digests.js"
    ui_data_file.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(
        scan,
        "build_ui_data",
        functools.partial(
            scan.build_ui_data,
            reports_dir=reports_dir,
            state_path=tmp_path / "seen-repos.json",
            output_path=ui_data_file,
        ),
    )

    args = argparse.Namespace(
        verdicts=str(verdicts),
        profile="profile.md",
        dry_run=True,
    )

    return {
        "date": test_date,
        "needs_eval": needs_eval,
        "verdicts": verdicts,
        "reports_dir": reports_dir,
        "args": args,
        "state": fake_state,
        "tmp_path": tmp_path,
    }


@pytest.mark.parametrize(
    "exception_to_raise",
    [
        PermissionError("EACCES: Permission denied writing ui/data/digests.js"),
        OSError(28, "No space left on device"),
        MemoryError("Out of memory during digest serialization"),
        ValueError("Malformed internal data structure"),
        TypeError("Unsupported type encountered during serialization"),
        FileNotFoundError("Target directory does not exist"),
        RuntimeError("Unexpected build_ui_data crash"),
    ],
)
def test_build_ui_data_exceptions_caught_and_handled(isolated_scan_env, exception_to_raise):
    """Verify cmd_finalize survives any unexpected exception from build_ui_data without crashing."""
    args = isolated_scan_env["args"]
    args.dry_run = True

    with (
        patch("src.scan.build_ui_data", side_effect=exception_to_raise) as mock_build,
        patch.object(scan.log, "error") as mock_log_error,
    ):

        # Must not raise exception
        scan.cmd_finalize(args)

        mock_build.assert_called_once()
        mock_log_error.assert_called_once()
        err_msg = mock_log_error.call_args[0][0]
        assert "Failed to build UI data bundle" in err_msg


def test_strict_pipeline_execution_order(isolated_scan_env):
    """Verify strict chronological sequence: save_state -> write report -> build_ui_data -> email -> git."""
    args = isolated_scan_env["args"]
    args.dry_run = False

    events = []

    def record_event(name):
        def _wrapper(*a, **kw):
            events.append(name)

        return _wrapper

    # Spy on write_text of report file
    original_write_text = Path.write_text

    def spy_write_text(self, *a, **kw):
        if str(self).endswith("2026-09-24.md"):
            events.append("write_report_markdown")
        return original_write_text(self, *a, **kw)

    with (
        patch.object(scan, "save_state", side_effect=record_event("save_state")),
        patch.object(Path, "write_text", side_effect=spy_write_text, autospec=True),
        patch("src.scan.build_ui_data", side_effect=record_event("build_ui_data")),
        patch("src.scan.send_digest_email", side_effect=record_event("send_digest_email")),
        patch("subprocess.run", side_effect=record_event("subprocess_run")),
    ):

        scan.cmd_finalize(args)

    assert "save_state" in events
    assert "write_report_markdown" in events
    assert "build_ui_data" in events
    assert "send_digest_email" in events
    assert "subprocess_run" in events

    idx_state = events.index("save_state")
    idx_report = events.index("write_report_markdown")
    idx_build = events.index("build_ui_data")
    idx_email = events.index("send_digest_email")
    idx_subp = events.index("subprocess_run")

    # save_state and report write must precede build_ui_data so builder reads fresh data
    assert idx_state < idx_build, "save_state must be called before build_ui_data"
    assert idx_report < idx_build, "report file must be written before build_ui_data"
    # build_ui_data must precede email and git commit
    assert idx_build < idx_email, "build_ui_data must be called before sending email"
    assert idx_build < idx_subp, "build_ui_data must be called before git commit"


@pytest.mark.parametrize(
    "subp_error",
    [
        subprocess.CalledProcessError(1, ["git", "add"], stderr="fatal: not a git repository"),
        subprocess.CalledProcessError(1, ["git", "commit"], stderr="nothing to commit"),
        FileNotFoundError("[Errno 2] No such file or directory: 'git'"),
        PermissionError("[Errno 13] Permission denied: 'git'"),
    ],
)
def test_git_staging_failure_does_not_crash_finalize(isolated_scan_env, subp_error):
    """Verify git failure in non-dry-run mode logs a warning instead of halting the process."""
    args = isolated_scan_env["args"]
    args.dry_run = False

    with (
        patch("src.scan.build_ui_data"),
        patch("src.scan.send_digest_email"),
        patch("subprocess.run", side_effect=subp_error),
        patch.object(scan.log, "warning") as mock_log_warn,
    ):

        # Should not raise exception
        scan.cmd_finalize(args)

        mock_log_warn.assert_called_once()
        warn_msg = mock_log_warn.call_args[0][0]
        assert "Git commit skipped/failed:" in warn_msg


def test_dry_run_flag_prevents_side_effects_even_with_dirty_state(isolated_scan_env):
    """Verify --dry-run guarantees zero calls to git or email dispatch."""
    args = isolated_scan_env["args"]
    args.dry_run = True

    with (
        patch("src.scan.build_ui_data") as mock_build,
        patch("src.scan.send_digest_email") as mock_email,
        patch("subprocess.run") as mock_subp,
        patch.object(scan.log, "info") as mock_log_info,
    ):

        scan.cmd_finalize(args)

        mock_build.assert_called_once()
        mock_email.assert_not_called()
        mock_subp.assert_not_called()

        info_calls = [c[0][0] for c in mock_log_info.call_args_list]
        assert any("[DRY-RUN] Email delivery skipped." in msg for msg in info_calls)
        assert any("[DRY-RUN] Git commit skipped." in msg for msg in info_calls)


def test_missing_dry_run_attribute_defaults_safely(isolated_scan_env):
    """Verify args namespace missing dry_run attribute safely defaults to False."""
    args = argparse.Namespace(
        verdicts=str(isolated_scan_env["verdicts"]),
        profile="profile.md",
    )
    # Notice args has NO dry_run attribute

    with (
        patch("src.scan.build_ui_data") as mock_build,
        patch("src.scan.send_digest_email") as mock_email,
        patch("subprocess.run") as mock_subp,
    ):

        scan.cmd_finalize(args)

        mock_build.assert_called_once()
        mock_email.assert_called_once()
        assert mock_subp.call_count == 2


def test_git_staging_target_paths_exist_on_filesystem():
    """Verify that all three target paths in git add exist relative to REPO_ROOT."""
    seen_repos = REPO_ROOT / "seen-repos.json"
    reports_dir = REPO_ROOT / "reports"
    digests_js = REPO_ROOT / "ui" / "data" / "digests.js"

    assert seen_repos.exists(), f"Missing seen-repos.json at {seen_repos}"
    assert reports_dir.is_dir(), f"Missing reports/ directory at {reports_dir}"
    assert digests_js.exists(), f"Missing ui/data/digests.js at {digests_js}"

    # Verify dry-run git add against the real repo
    result = subprocess.run(
        ["git", "add", "--dry-run", "seen-repos.json", "reports/", "ui/data/digests.js"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"git add --dry-run failed with error: {result.stderr}"


def test_missing_verdicts_file_fails_gracefully(isolated_scan_env):
    """Verify missing verdicts file logs error and returns early without invoking build_ui_data."""
    args = isolated_scan_env["args"]
    args.verdicts = str(isolated_scan_env["tmp_path"] / "nonexistent_verdicts.json")

    with patch("src.scan.build_ui_data") as mock_build, patch.object(scan.log, "error") as mock_log_error:

        scan.cmd_finalize(args)

        mock_build.assert_not_called()
        mock_log_error.assert_called_once()
        assert "Verdicts file" in mock_log_error.call_args[0][0]


def test_cli_finalize_subprocess_help_flag():
    """Verify that `python3 src/scan.py finalize --help` displays the --dry-run option."""
    proc = subprocess.run(
        [sys.executable, "src/scan.py", "finalize", "--help"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0
    assert "--dry-run" in proc.stdout
    assert "Execute without sending email or creating git commit" in proc.stdout


def test_cli_finalize_subprocess_missing_input_exits_cleanly(tmp_path):
    """Verify `python3 src/scan.py finalize --dry-run` logs error cleanly when .needs_evaluation.json is absent."""
    # Ensure .needs_evaluation.json does not exist
    needs_eval = REPO_ROOT / ".needs_evaluation.json"
    assert not needs_eval.exists()

    proc = subprocess.run(
        [sys.executable, "src/scan.py", "finalize", "--dry-run"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0
    combined = proc.stdout + proc.stderr
    assert ".needs_evaluation.json not found" in combined


def test_cmd_finalize_with_corrupted_report_in_directory(isolated_scan_env, monkeypatch):
    """Stress-test: corrupted markdown file in reports directory does not crash finalize."""
    reports_dir = isolated_scan_env["reports_dir"]
    # Write a malformed markdown file matching the date pattern
    corrupted_report = reports_dir / "2026-01-01.md"
    corrupted_report.write_text("NOT A VALID REPORT\n\x00\x01\x02\n# ??? No tables or verdicts", encoding="utf-8")

    out_file = isolated_scan_env["tmp_path"] / "ui" / "data" / "digests.js"

    args = isolated_scan_env["args"]
    args.dry_run = True

    with patch("src.scan.send_digest_email"), patch("subprocess.run"):
        # cmd_finalize runs real build_ui_data
        scan.cmd_finalize(args)

    # Finalize must succeed without crashing, and still bundle the valid report.
    content = out_file.read_text(encoding="utf-8")
    assert isolated_scan_env["date"] in content
    assert "adversarial-org/stress-target" in content
