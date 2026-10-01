"""Tests for the ideate subcommand and finalize's use-case attachment in src/scan.py."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
for p in (REPO_ROOT, REPO_ROOT / "src"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import src.scan as scan  # noqa: E402


@pytest.fixture
def env(tmp_path, monkeypatch):
    needs = tmp_path / ".needs_evaluation.json"
    needs.write_text(
        json.dumps(
            {
                "date": "2026-09-24",
                "skipped": 0,
                "repos": [
                    {"repo": "a/one", "stars": 1, "reason": "new", "latest_release": None},
                    {"repo": "a/two", "stars": 2, "reason": "new", "latest_release": None},
                ],
            }
        )
    )
    verdicts = tmp_path / "verdicts.json"
    verdicts.write_text(json.dumps([{"repo": r, "verdict": "fit", "judgment": "j"} for r in ("a/one", "a/two")]))
    state: dict = {}
    reports = tmp_path / "reports"
    reports.mkdir()
    captured: dict = {}

    def fake_render(date, evaluated, skipped):
        captured["evaluated"] = evaluated
        return "report"

    monkeypatch.setattr(scan, "NEEDS_EVALUATION", needs)
    monkeypatch.setattr(scan, "REPORTS_DIR", reports)
    monkeypatch.setattr(scan, "load_state", lambda: dict(state))
    monkeypatch.setattr(scan, "save_state", lambda s: (state.clear(), state.update(s)))
    monkeypatch.setattr(scan, "render_report", fake_render)
    monkeypatch.setattr(scan, "build_ui_data", lambda: None)
    args = argparse.Namespace(
        verdicts=str(verdicts), profile="profile.md", dry_run=True, use_cases=str(tmp_path / "use_cases.json")
    )
    return {"args": args, "state": state, "captured": captured, "uc": tmp_path / "use_cases.json"}


def test_finalize_attaches_use_cases(env):
    env["uc"].write_text(json.dumps([{"repo": "a/one", "use_cases": [{"title": "T"}], "skipped_reason": ""}]))
    scan.cmd_finalize(env["args"])
    one, two = env["captured"]["evaluated"]
    assert one["use_cases"] == [{"title": "T"}] and one["skipped_reason"] == ""
    assert "use_cases" not in two
    assert "use_cases" not in env["state"]["a/one"]


def test_finalize_without_file_unchanged(env):
    scan.cmd_finalize(env["args"])
    assert all("use_cases" not in e for e in env["captured"]["evaluated"])


def test_finalize_tolerates_missing_attr_and_bad_json(env):
    env["uc"].write_text("not json")
    scan.cmd_finalize(env["args"])
    del env["args"].use_cases
    scan.cmd_finalize(env["args"])  # NEEDS_EVALUATION was unlinked, returns early; must not raise


def test_ideate_subcommand_defaults():
    with patch.object(sys, "argv", ["scan.py", "ideate"]), patch("src.scan.cmd_ideate") as cmd:
        scan.main()
    a = cmd.call_args[0][0]
    assert (a.profile, a.verdicts, a.out) == ("profile.md", "verdicts.json", "use_cases.json")


def test_cmd_ideate_calls_ideate_repositories(env):
    args = argparse.Namespace(profile="p.md", verdicts="v.json", out="o.json")
    with patch("src.scan.ideate_repositories") as ir:
        scan.cmd_ideate(args)
    ir.assert_called_once_with(
        needs_evaluation_path=str(scan.NEEDS_EVALUATION),
        verdicts_path="v.json",
        profile_path="p.md",
        output_path="o.json",
    )


def test_finalize_parser_default_use_cases():
    with patch.object(sys, "argv", ["scan.py", "finalize"]), patch("src.scan.cmd_finalize") as cmd:
        scan.main()
    assert cmd.call_args[0][0].use_cases == "use_cases.json"
