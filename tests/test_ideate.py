"""Tests for src/ideate.py (use-case suggestions)."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
for p in (REPO_ROOT, REPO_ROOT / "src"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import ideate  # noqa: E402
import judge  # noqa: E402

README = "# Tool\n\nRun `tool sync --all` to mirror\nyour   repos.  Supports a plugin API for hooks."
LABELS = ["AI Agents & LLM Orchestration", "Developer Productivity & Tooling"]
PROFILE = "1. **AI Agents & LLM Orchestration:** x\n2. **Developer Productivity & Tooling:** y\n"


def uc(**over) -> dict:
    d = {
        "title": "Automate repo mirroring",
        "kind": "automate",
        "focus": "developer productivity & tooling",
        "pitch": "Keeps mirrors fresh.",
        "evidence": "mirror your repos. Supports a plugin",
        "first_step": "Run `tool sync --all` in CI.",
        "effort": "hour",
    }
    d.update(over)
    return d


def validate(items, labels=LABELS):
    return ideate.validate_use_cases({"use_cases": items}, README, labels)


# ---- labels ---------------------------------------------------------------


def test_labels_extraction():
    text = "1. **AI Agents & LLM Orchestration:** foo\n1. **RepoRadar** (this repository)\n"
    assert ideate.extract_profile_labels(text) == ["AI Agents & LLM Orchestration", "RepoRadar"]


def test_labels_from_real_profile():
    labels = ideate.extract_profile_labels((REPO_ROOT / "profile.md").read_text())
    assert "AI Agents & LLM Orchestration" in labels
    assert "Developer Productivity & Tooling" in labels
    assert "RepoRadar" in labels


# ---- validate -------------------------------------------------------------


def test_valid_item_kept_with_canonical_focus():
    kept, reasons = validate([uc()])
    assert reasons == []
    assert kept[0]["focus"] == "Developer Productivity & Tooling"
    assert set(kept[0]) == {"title", "kind", "focus", "pitch", "evidence", "first_step", "effort"}


@pytest.mark.parametrize("raw", [None, [], "x", {"use_cases": "no"}, {"other": []}])
def test_malformed(raw):
    assert ideate.validate_use_cases(raw, README, LABELS) == ([], ["malformed response"])


def test_empty_list_is_fine():
    assert ideate.validate_use_cases({"use_cases": []}, README, LABELS) == ([], [])


@pytest.mark.parametrize("field", ["title", "kind", "focus", "pitch", "evidence", "first_step", "effort"])
@pytest.mark.parametrize("bad", [None, "", "   ", 5])
def test_field_missing_or_bad(field, bad):
    kept, reasons = validate([uc(**{field: bad})])
    assert kept == [] and len(reasons) == 1


def test_missing_key():
    item = uc()
    del item["pitch"]
    kept, reasons = validate([item])
    assert kept == [] and "pitch" in reasons[0]


def test_non_dict_item():
    kept, reasons = validate(["nope"])
    assert kept == [] and len(reasons) == 1


def test_bad_kind_and_effort():
    assert validate([uc(kind="rewrite")])[0] == []
    assert validate([uc(effort="week")])[0] == []
    assert validate([uc(kind="learn", effort="project")])[0] != []


def test_evidence_must_be_in_readme_whitespace_and_case_insensitive():
    assert validate([uc(evidence="MIRROR   your\nrepos.")])[0] != []
    assert validate([uc(evidence="Mirror YOUR repos. supports a plugin API")])[0] != []


def test_evidence_not_in_readme():
    kept, reasons = validate([uc(evidence="this sentence is not in the readme at all")])
    assert kept == [] and "evidence" in reasons[0]


def test_evidence_too_short():
    kept, reasons = validate([uc(evidence="plugin API")])
    assert kept == [] and "evidence" in reasons[0]


def test_first_step_needs_backtick_token_in_readme():
    assert validate([uc(first_step="Run it in CI.")])[0] == []
    assert validate([uc(first_step="Run `other --cmd` now")])[0] == []
    assert validate([uc(first_step="Run `other` then `TOOL  sync --all`")])[0] != []


def test_focus_must_match_label():
    kept, reasons = validate([uc(focus="Quantum Basket Weaving")])
    assert kept == [] and "focus" in reasons[0]
    assert validate([uc(focus="AI Agents & LLM Orchestration:")])[0][0]["focus"] == LABELS[0]


def test_duplicate_kind_dropped():
    kept, reasons = validate([uc(), uc(title="Other idea")])
    assert len(kept) == 1 and "kind" in reasons[0]


def test_two_distinct_kinds_kept():
    kept, _ = validate([uc(), uc(kind="learn")])
    assert [k["kind"] for k in kept] == ["automate", "learn"]


def test_cap_at_two_items():
    kept, reasons = validate([uc(kind="build"), uc(kind="learn"), uc(kind="integrate")])
    assert [k["kind"] for k in kept] == ["build", "learn"]
    assert reasons == []


# ---- prompt ---------------------------------------------------------------


def test_prompt_contents():
    entry = {"repo": "a/b", "description": "A tool"}
    verdict = {"verdict": "fit", "judgment": "Solid fit."}
    prompt = ideate.build_prompt(entry, verdict, README, PROFILE, LABELS)
    for needle in ("a/b", "A tool", "fit", "Solid fit.", README, PROFILE, *LABELS, "use_cases", "skipped_reason"):
        assert needle in prompt
    assert "Never use a person's name" in prompt
    assert "the user's" in prompt  # named only as something to avoid
    assert "word for word" in prompt


# ---- ideate_repositories --------------------------------------------------


@pytest.fixture
def files(tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.setattr(judge, "_load_env_file", lambda: None)
    needs = tmp_path / "needs.json"
    needs.write_text(
        json.dumps(
            {
                "repos": [
                    {"repo": "a/fit", "description": "d1"},
                    {"repo": "a/maybe", "description": "d2"},
                    {"repo": "a/nope", "description": "d3"},
                ]
            }
        )
    )
    verdicts = tmp_path / "verdicts.json"
    verdicts.write_text(
        json.dumps(
            [
                {"repo": "a/fit", "verdict": "fit", "judgment": "j"},
                {"repo": "a/maybe", "verdict": "maybe", "judgment": "j"},
                {"repo": "a/nope", "verdict": "not-fit", "judgment": "j"},
            ]
        )
    )
    profile = tmp_path / "profile.md"
    profile.write_text(PROFILE)
    out = tmp_path / "use_cases.json"
    return {
        "needs_evaluation_path": str(needs),
        "verdicts_path": str(verdicts),
        "profile_path": str(profile),
        "output_path": str(out),
    }


def run(files, fetcher=lambda r: README, llm=None, chain_err=None):
    chain = patch.object(
        judge,
        "_resolve_gemini_chain",
        side_effect=chain_err,
        return_value=(["m"], {"attempts_per_model": 1, "timeout_seconds": 5}),
    )
    call = patch.object(judge, "_call_with_fallback", **llm) if llm else patch.object(judge, "_call_with_fallback")
    with chain, call as c:
        return ideate.ideate_repositories(**files, readme_fetcher=fetcher), c


def test_no_key_writes_empty(files, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    out, _ = run(files)
    assert out == []
    assert Path(files["output_path"]).read_text() == "[]"


def test_chain_failure_writes_empty(files):
    out, _ = run(files, chain_err=RuntimeError("no models"))
    assert out == [] and Path(files["output_path"]).read_text() == "[]"


def test_not_fit_filtered(files):
    out, c = run(files, llm={"return_value": {"use_cases": [], "skipped_reason": "meh"}})
    assert [r["repo"] for r in out] == ["a/fit", "a/maybe"]
    assert c.call_args.kwargs["require_nonempty"] is False
    assert out[0]["skipped_reason"] == "meh"


def test_no_eligible_repos(files):
    Path(files["verdicts_path"]).write_text("[]")
    out, c = run(files)
    assert out == [] and c.call_count == 0
    assert Path(files["output_path"]).read_text() == "[]"


def test_readme_missing(files):
    out, c = run(files, fetcher=lambda r: "")
    assert out[0] == {"repo": "a/fit", "use_cases": [], "skipped_reason": "README not found"}
    assert c.call_count == 0


def test_llm_failure(files):
    out, _ = run(files, llm={"side_effect": RuntimeError("down")})
    assert out[0]["skipped_reason"] == "LLM call failed" and out[0]["use_cases"] == []


def test_all_dropped_default_reason(files):
    out, _ = run(files, llm={"return_value": {"use_cases": [uc(kind="bogus")], "skipped_reason": ""}})
    assert out[0]["skipped_reason"] == "No suggestion passed quality checks"


def test_happy_path_writes_file(files):
    out, _ = run(files, llm={"return_value": {"use_cases": [uc()], "skipped_reason": ""}})
    assert out[0]["use_cases"][0]["focus"] == "Developer Productivity & Tooling"
    assert out[0]["skipped_reason"] == ""
    assert json.loads(Path(files["output_path"]).read_text()) == out


# ---- markdown-insensitive matching (from the 2026-10-01 dry run) ---------

MD_README = (
    "### [Integrate PageIndex with your own agent →](https://docs.pageindex.ai/sdk/agents)\n\n"
    "Drop **PageIndex** tools into the `OpenAI Agents SDK` or any other framework.\n"
    "<p align='center'>Run <code>pageindex serve</code></p>"
)


def test_evidence_quoted_as_rendered_text_matches_markdown_source():
    item = uc(
        evidence="Integrate PageIndex with your own agent → Drop PageIndex tools into the OpenAI Agents SDK",
        first_step="Call the `OpenAI Agents SDK` integration.",
    )
    kept, reasons = ideate.validate_use_cases({"use_cases": [item]}, MD_README, LABELS)
    assert kept and not reasons


def test_first_step_token_matches_inside_html_and_markdown():
    item = uc(evidence="Drop PageIndex tools into the OpenAI Agents SDK", first_step="Run `pageindex serve`.")
    kept, _ = ideate.validate_use_cases({"use_cases": [item]}, MD_README, LABELS)
    assert kept


def test_link_url_is_not_quotable_evidence():
    item = uc(evidence="https://docs.pageindex.ai/sdk/agents", first_step="Run `pageindex serve`.")
    kept, reasons = ideate.validate_use_cases({"use_cases": [item]}, MD_README, LABELS)
    assert kept == [] and "evidence" in reasons[0]


def test_first_step_call_matches_on_function_name_when_args_span_lines():
    readme = 'Quickstart:\n\nclient = PageIndexClient(\n    index="luna",   # comment\n)\nDrop PageIndex tools into any framework.'
    item = uc(evidence="Drop PageIndex tools into any framework", first_step='Call `PageIndexClient(index="luna")`.')
    assert ideate.validate_use_cases({"use_cases": [item]}, readme, LABELS)[0]


def test_first_step_call_with_unknown_function_name_still_rejected():
    readme = "Drop PageIndex tools into any framework. Uses PageIndexClient."
    item = uc(evidence="Drop PageIndex tools into any framework", first_step="Call `MadeUpClient(x=1)`.")
    assert ideate.validate_use_cases({"use_cases": [item]}, readme, LABELS)[0] == []
