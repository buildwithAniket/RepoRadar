"""Tests for the generalised retry helper ``judge._call_with_fallback``."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
for p in (REPO_ROOT, REPO_ROOT / "src"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import judge  # noqa: E402


def _gemini(text: str) -> MagicMock:
    r = MagicMock()
    r.status_code = 200
    r.json.return_value = {"candidates": [{"content": {"parts": [{"text": text}]}}]}
    return r


@pytest.fixture(autouse=True)
def no_sleep():
    with patch.object(judge.time, "sleep"):
        yield


def test_empty_dict_accepted_when_not_required():
    with patch("requests.post", return_value=_gemini("{}")):
        assert judge._call_with_fallback("k", ["m1"], "p", 1, 5, require_nonempty=False) == {}


def test_empty_dict_rejected_by_default():
    with patch("requests.post", return_value=_gemini("{}")), pytest.raises(RuntimeError):
        judge._call_with_fallback("k", ["m1"], "p", 1, 5)


def test_resolve_chain_raises_when_empty():
    cfg = {"gemini_models": [], "discover_models": False, "timeout_seconds": 5}
    with patch.object(judge, "_load_judge_config", return_value=cfg), pytest.raises(RuntimeError):
        judge._resolve_gemini_chain("k")
