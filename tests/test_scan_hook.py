"""Unit and integration tests for Pipeline Auto-Sync Hook in src/scan.py.

Verifies Milestone 3 requirements:
1. cmd_finalize invokes build_ui_data() after saving state and writing report markdown.
2. ui/data/digests.js is regenerated on disk.
3. git add command includes "ui/data/digests.js" alongside "seen-repos.json" and "reports/".
4. --dry-run CLI flag skips email dispatch and git commit/push while still executing build_ui_data().
5. Normal finalize (without --dry-run) dispatches email and executes git commit with atomic staging.
6. Error handling: exceptions during build_ui_data are logged without terminating ungracefully.
"""

from __future__ import annotations

import argparse
import functools
import json
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
def mock_pipeline_data(tmp_path, monkeypatch):
    """Set up temporary payload, verdicts, and isolated paths for safe finalize execution."""
    test_date = "2026-09-24"
    needs_eval_file = tmp_path / ".needs_evaluation.json"
    verdicts_file = tmp_path / "verdicts.json"
    reports_dir = tmp_path / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "date": test_date,
        "skipped": 2,
        "repos": [
            {
                "repo": "a24-cinema/celluloid-engine",
                "stars": 4200,
                "reason": "new",
                "latest_release": "v1.0.0",
            },
            {
                "repo": "filmstrip/turntable-3d",
                "stars": 1500,
                "reason": "resurfaced",
                "latest_release": "v2.1.0",
            },
        ],
    }
    verdicts = [
        {
            "repo": "a24-cinema/celluloid-engine",
            "verdict": "fit",
            "judgment": "Essential 35mm grain renderer.",
        },
        {
            "repo": "filmstrip/turntable-3d",
            "verdict": "maybe",
            "judgment": "Interesting turntable geometry.",
        },
    ]

    needs_eval_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    verdicts_file.write_text(json.dumps(verdicts, indent=2), encoding="utf-8")

    fake_state = {}

    def mock_load_state():
        return dict(fake_state)

    def mock_save_state(s):
        fake_state.clear()
        fake_state.update(s)

    monkeypatch.setattr(scan, "NEEDS_EVALUATION", needs_eval_file)
    monkeypatch.setattr(scan, "REPORTS_DIR", reports_dir)
    monkeypatch.setattr(scan, "load_state", mock_load_state)
    monkeypatch.setattr(scan, "save_state", mock_save_state)
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
        verdicts=str(verdicts_file),
        profile="profile.md",
        dry_run=False,
    )

    return {
        "date": test_date,
        "needs_eval_file": needs_eval_file,
        "verdicts_file": verdicts_file,
        "reports_dir": reports_dir,
        "args": args,
        "state": fake_state,
        "ui_data_file": ui_data_file,
    }


def test_cmd_finalize_invokes_build_ui_data(mock_pipeline_data):
    """Test that cmd_finalize calls build_ui_data() and logs confirmation."""
    args = mock_pipeline_data["args"]

    with (
        patch("src.scan.build_ui_data") as mock_build,
        patch("src.scan.send_digest_email"),
        patch("subprocess.run"),
        patch.object(scan.log, "info") as mock_log_info,
    ):

        scan.cmd_finalize(args)

        # build_ui_data must be invoked
        mock_build.assert_called_once_with()

        # Check log message
        log_messages = [call_args[0][0] for call_args in mock_log_info.call_args_list]
        assert any("UI data bundle regenerated at ui/data/digests.js" in msg for msg in log_messages)


def test_cmd_finalize_git_add_includes_digests_js(mock_pipeline_data):
    """Test that git add in cmd_finalize explicitly stages ui/data/digests.js."""
    args = mock_pipeline_data["args"]

    with patch("src.scan.build_ui_data"), patch("src.scan.send_digest_email"), patch("subprocess.run") as mock_run:

        scan.cmd_finalize(args)

        # Inspect all subprocess.run calls
        run_cmds = [call_args[0][0] for call_args in mock_run.call_args_list]

        # Verify git add call exists and contains required targets
        git_add_calls = [cmd for cmd in run_cmds if cmd[:2] == ["git", "add"]]
        assert len(git_add_calls) == 1, f"Expected 1 git add call, found: {git_add_calls}"

        git_add_args = git_add_calls[0]
        assert "seen-repos.json" in git_add_args
        assert "reports/" in git_add_args
        assert "ui/data/digests.js" in git_add_args
        assert git_add_args == ["git", "add", "seen-repos.json", "reports/", "ui/data/digests.js"]

        # Verify git commit call exists
        git_commit_calls = [cmd for cmd in run_cmds if cmd[:2] == ["git", "commit"]]
        assert len(git_commit_calls) == 1
        assert mock_pipeline_data["date"] in git_commit_calls[0][3]


def test_cmd_finalize_dry_run_skips_email_and_git(mock_pipeline_data):
    """Test that --dry-run executes state save, report render, and build_ui_data, but skips email and git."""
    args = mock_pipeline_data["args"]
    args.dry_run = True

    with (
        patch("src.scan.build_ui_data") as mock_build,
        patch("src.scan.send_digest_email") as mock_email,
        patch("subprocess.run") as mock_run,
        patch.object(scan.log, "info") as mock_log_info,
    ):

        scan.cmd_finalize(args)

        # build_ui_data MUST still be called
        mock_build.assert_called_once_with()

        # Email dispatch MUST be skipped
        mock_email.assert_not_called()

        # Git subprocesses MUST be skipped
        mock_run.assert_not_called()

        # Verify dry-run log notices
        log_messages = [call_args[0][0] for call_args in mock_log_info.call_args_list]
        assert any("[DRY-RUN] Email delivery skipped." in msg for msg in log_messages)
        assert any("[DRY-RUN] Git commit skipped." in msg for msg in log_messages)

        # Report markdown file must have been written
        written_report = mock_pipeline_data["reports_dir"] / f"{mock_pipeline_data['date']}.md"
        assert written_report.exists()
        assert "a24-cinema/celluloid-engine" in written_report.read_text(encoding="utf-8")


def test_cmd_finalize_normal_run_sends_email_and_commits(mock_pipeline_data):
    """Test that normal run (dry_run=False) sends email and executes git commit."""
    args = mock_pipeline_data["args"]
    args.dry_run = False

    with (
        patch("src.scan.build_ui_data"),
        patch("src.scan.send_digest_email") as mock_email,
        patch("subprocess.run") as mock_run,
    ):

        scan.cmd_finalize(args)

        # Email dispatch must occur with appropriate subject
        mock_email.assert_called_once()
        subject, body = mock_email.call_args[0]
        assert mock_pipeline_data["date"] in subject
        assert "a24-cinema/celluloid-engine" in body

        # Git commit must occur
        assert mock_run.call_count == 2  # git add + git commit


def test_cmd_finalize_build_ui_data_error_resilience(mock_pipeline_data):
    """Test that exceptions raised inside build_ui_data are caught and logged."""
    args = mock_pipeline_data["args"]
    args.dry_run = True

    with (
        patch("src.scan.build_ui_data", side_effect=RuntimeError("Data build synthesis failure")),
        patch.object(scan.log, "error") as mock_log_error,
    ):

        # Should not crash with unhandled exception
        scan.cmd_finalize(args)

        mock_log_error.assert_called_once()
        err_msg = mock_log_error.call_args[0][0]
        assert "Failed to build UI data bundle" in err_msg


def test_cmd_finalize_missing_prerequisites(tmp_path, monkeypatch):
    """Test that cmd_finalize exits early if .needs_evaluation.json is missing."""
    non_existent = tmp_path / "does_not_exist.json"
    monkeypatch.setattr(scan, "NEEDS_EVALUATION", non_existent)

    args = argparse.Namespace(verdicts=str(tmp_path / "verdicts.json"), dry_run=True)

    with patch("src.scan.build_ui_data") as mock_build, patch.object(scan.log, "error") as mock_log_error:

        scan.cmd_finalize(args)
        mock_build.assert_not_called()
        mock_log_error.assert_called_once()
        assert ".needs_evaluation.json not found" in mock_log_error.call_args[0][0]


def test_cli_finalize_parser_dry_run_flag():
    """Verify argparse configuration in scan.py supports --dry-run on finalize subcommand."""
    # Test with --dry-run
    test_argv_dry = ["scan.py", "finalize", "--dry-run"]
    with patch.object(sys, "argv", test_argv_dry), patch("src.scan.cmd_finalize") as mock_cmd_fin:
        scan.main()
        mock_cmd_fin.assert_called_once()
        passed_args = mock_cmd_fin.call_args[0][0]
        assert passed_args.dry_run is True
        assert passed_args.command == "finalize"

    # Test without --dry-run (default False)
    test_argv_no_dry = ["scan.py", "finalize"]
    with patch.object(sys, "argv", test_argv_no_dry), patch("src.scan.cmd_finalize") as mock_cmd_fin:
        scan.main()
        mock_cmd_fin.assert_called_once()
        passed_args = mock_cmd_fin.call_args[0][0]
        assert passed_args.dry_run is False


def test_cmd_finalize_real_bundle_regeneration(mock_pipeline_data):
    """End-to-end integration test: run cmd_finalize without mocking build_ui_data.

    Verifies that ui/data/digests.js is genuinely updated and contains valid JS syntax.
    """
    args = mock_pipeline_data["args"]
    args.dry_run = True

    # Run cmd_finalize with real build_ui_data
    with patch("src.scan.send_digest_email"), patch("subprocess.run"):
        scan.cmd_finalize(args)

    ui_data_file = mock_pipeline_data["ui_data_file"]
    assert ui_data_file.exists()
    content = ui_data_file.read_text(encoding="utf-8")
    assert "window.REPORADAR_DIGESTS" in content
    assert "module.exports = window.REPORADAR_DIGESTS" in content
    # The bundle must be built from the report finalize just wrote.
    assert mock_pipeline_data["date"] in content
    assert "a24-cinema/celluloid-engine" in content
