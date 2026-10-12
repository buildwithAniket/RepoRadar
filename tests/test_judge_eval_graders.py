"""Offline tests for the code graders in evals/judge (no API calls)."""

import json
import sys
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parents[1] / "evals" / "judge"
sys.path.insert(0, str(EVAL_DIR))

import run_eval
from prompts import PROMPTS

BATCH = [{"input": {"repo": "a/x"}}, {"input": {"repo": "b/y"}}]


def test_code_checks_full_coverage():
    out = [{"repo": "a/x", "verdict": "fit", "judgment": "ok"}, {"repo": "b/y", "verdict": "maybe", "judgment": "ok"}]
    checks = run_eval.code_checks(BATCH, out)
    assert checks["parse_ok"] and checks["coverage_ok"]


def test_code_checks_missing_and_duplicate():
    assert not run_eval.code_checks(BATCH, [{"repo": "a/x"}])["coverage_ok"]
    assert not run_eval.code_checks(BATCH, [{"repo": "a/x"}, {"repo": "a/x"}, {"repo": "b/y"}])["coverage_ok"]


def test_code_checks_non_list():
    assert run_eval.code_checks(BATCH, {"repo": "a/x"}) == {"parse_ok": False, "coverage_ok": False, "by_repo": {}}


def test_judgment_checks_flags_identity_and_schema():
    row = run_eval.judgment_checks({"verdict": "great", "judgment": "Strong fit for your agent interests."})
    assert row["identity_leaks"] == ["your"]
    assert not row["schema_ok"]


def test_judgment_checks_clean():
    row = run_eval.judgment_checks({"verdict": "fit", "judgment": "Matches the profile's agent focus area."})
    assert row["schema_ok"] and row["concise_ok"] and row["identity_leaks"] == []


def test_judgment_checks_missing():
    assert run_eval.judgment_checks(None) == {"answered": False}


def test_consistency_ignores_api_failures():
    base = {"tags": [], "schema_ok": True, "identity_leaks": [], "concise_ok": True, "acceptable_ok": True}
    results = [
        {**base, "id": "c1", "answered": True, "verdict": "fit", "exact_ok": True},
        {**base, "id": "c1", "answered": True, "verdict": "fit", "exact_ok": True},
        {"id": "c2", "answered": False},
        {**base, "id": "c2", "answered": True, "verdict": "maybe", "exact_ok": True},
    ]
    assert run_eval.summarize(results, runs=2)["consistency_across_runs"] == 1.0


def test_dataset_labels_are_valid_and_unique():
    cases = json.loads((EVAL_DIR / "dataset.json").read_text())["cases"]
    assert len({c["id"] for c in cases}) == len(cases)
    assert len({c["input"]["repo"] for c in cases}) == len(cases)
    for c in cases:
        assert c["expected"] in c["acceptable"]
        assert set(c["acceptable"]) <= run_eval.VERDICTS


def test_every_prompt_embeds_profile_and_repos():
    repos = [{"repo": "a/x", "stars": 1, "description": "d", "prior": None}]
    for name, build in PROMPTS.items():
        text = build("PROFILE-MARKER", repos)
        assert "PROFILE-MARKER" in text and '"a/x"' in text, name
