"""Tests for the Gemini model fallback chain in src/judge.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
for p in (REPO_ROOT, REPO_ROOT / "src"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import judge  # noqa: E402

VERDICTS = [{"repo": "a/b", "verdict": "fit", "judgment": "ok"}]


def _resp(status: int, body: dict | None = None, text: str = "") -> MagicMock:
    r = MagicMock()
    r.status_code = status
    r.text = text
    r.json.return_value = body or {}
    return r


def _ok() -> MagicMock:
    return _resp(200, {"candidates": [{"content": {"parts": [{"text": json.dumps(VERDICTS)}]}}]})


@pytest.fixture(autouse=True)
def no_sleep():
    with patch.object(judge.time, "sleep"):
        yield


def _post_by_model(outcomes: dict[str, MagicMock]):
    calls: list[str] = []

    def fake_post(url, **kwargs):
        model = url.split("/models/")[1].split(":")[0]
        calls.append(model)
        return outcomes[model]

    return fake_post, calls


def test_falls_through_on_503_to_next_model():
    post, calls = _post_by_model({"a": _resp(503, text="busy"), "b": _ok()})
    with patch("requests.post", side_effect=post):
        assert judge._judge_with_fallback("k", ["a", "b"], "p", attempts=2, timeout=5) == VERDICTS
    assert calls == ["a", "a", "b"]


def test_404_skips_model_without_retry():
    post, calls = _post_by_model({"a": _resp(404, text="nope"), "b": _ok()})
    with patch("requests.post", side_effect=post):
        judge._judge_with_fallback("k", ["a", "b"], "p", attempts=3, timeout=5)
    assert calls == ["a", "b"]


def test_all_models_fail_raises_naming_each_model():
    post, _ = _post_by_model({"a": _resp(503, text="busy"), "b": _resp(500, text="boom")})
    with patch("requests.post", side_effect=post):
        with pytest.raises(RuntimeError) as exc:
            judge._judge_with_fallback("k", ["a", "b"], "p", attempts=2, timeout=5)
    msg = str(exc.value)
    assert "a: HTTP 503" in msg and "b: HTTP 500" in msg
    assert "{" not in msg.split("\n")[0]


def test_invalid_json_moves_to_next_model():
    bad = _resp(200, {"candidates": [{"content": {"parts": [{"text": "not json"}]}}]})
    post, calls = _post_by_model({"a": bad, "b": _ok()})
    with patch("requests.post", side_effect=post):
        judge._judge_with_fallback("k", ["a", "b"], "p", attempts=2, timeout=5)
    assert calls == ["a", "b"]


def test_list_models_filters_non_text_and_non_generate():
    body = {
        "models": [
            {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-2.5-flash-preview-tts", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]},
            {"name": "models/gemini-2.5-flash-image", "supportedGenerationMethods": ["generateContent"]},
        ]
    }
    with patch("requests.get", return_value=_resp(200, body)):
        assert judge._list_gemini_models("k", 5) == ["gemini-2.5-flash"]


def test_list_models_failure_returns_none():
    with patch("requests.get", return_value=_resp(500)):
        assert judge._list_gemini_models("k", 5) is None


def test_chain_order_and_dropping_unavailable():
    chain = judge._build_model_chain(
        ["m-3.8-flash", "m-2.5-flash", "gone"],
        ["m-2.5-flash", "m-3.8-flash", "m-2.0-flash", "m-2.5-pro"],
        discover=True,
        preferred="env-model",
    )
    assert chain == ["env-model", "m-3.8-flash", "m-2.5-flash", "m-2.0-flash"]


def test_chain_uses_config_as_is_when_list_unavailable():
    assert judge._build_model_chain(["x", "y"], None, discover=True, preferred=None) == ["x", "y"]
