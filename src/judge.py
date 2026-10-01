"""LLM-as-judge step for RepoRadar V3.

Evaluates repos from .needs_evaluation.json against the user's profile
and writes structured verdicts to verdicts.json.

Tries a chain of Gemini models (config.yaml ``judge.gemini_models``) in order,
moving on when a model is overloaded or unavailable. FAILS LOUDLY when no API
key is configured or every model fails, rather than fabricating verdicts.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import TypedDict

# --------------------------------------------------------------------------- #
# Types
# --------------------------------------------------------------------------- #


class Verdict(TypedDict):
    repo: str
    verdict: str
    judgment: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _load_env_file() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                key, val = key.strip(), val.strip()
                if key and val and key not in os.environ:
                    os.environ[key] = val


def _parse_llm_response(text: str) -> str:
    """Extract the JSON payload from an LLM response that may be wrapped
    in markdown code fences."""
    if "```json" in text:
        return text.split("```json", 1)[1].split("```", 1)[0].strip()
    if "```" in text:
        return text.split("```", 1)[1].split("```", 1)[0].strip()
    return text.strip()


_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
_TRANSIENT_STATUS = {429, 500, 502, 503, 504}
# Model-name fragments that are not general text generators.
_NON_TEXT_MARKERS = ("tts", "image", "embedding", "live", "audio", "aqa", "imagen", "veo", "robotics", "computer-use")
_DEFAULT_JUDGE_CONFIG = {
    "gemini_models": ["gemini-3.5-flash-lite"],
    "discover_models": True,
    "attempts_per_model": 2,
    "timeout_seconds": 60,
}


class GeminiCallError(Exception):
    """A failed Gemini call. ``transient`` means the same model may succeed on retry."""

    def __init__(self, message: str, *, transient: bool) -> None:
        super().__init__(message)
        self.transient = transient


def _load_judge_config() -> dict:
    import yaml

    cfg = dict(_DEFAULT_JUDGE_CONFIG)
    config_path = Path(__file__).resolve().parent.parent / "config.yaml"
    if config_path.is_file():
        with open(config_path) as f:
            cfg.update((yaml.safe_load(f) or {}).get("judge") or {})
    return cfg


def _list_gemini_models(gemini_key: str, timeout: int) -> list[str] | None:
    """Return text-generation model names available to this key, or None if the
    list call fails. Note: this reports what exists, not current load/health."""
    import requests

    from logger import log

    names: list[str] = []
    page_token = ""
    try:
        while True:
            params = {"key": gemini_key, "pageSize": 1000}
            if page_token:
                params["pageToken"] = page_token
            resp = requests.get(f"{_GEMINI_BASE}/models", params=params, timeout=timeout)
            if resp.status_code != 200:
                log.warning("Gemini model list failed (%d); using configured models as-is.", resp.status_code)
                return None
            data = resp.json()
            for m in data.get("models", []):
                name = m.get("name", "").removeprefix("models/")
                if "generateContent" in m.get("supportedGenerationMethods", []) and not any(
                    marker in name for marker in _NON_TEXT_MARKERS
                ):
                    names.append(name)
            page_token = data.get("nextPageToken", "")
            if not page_token:
                return names
    except Exception as e:
        log.warning("Gemini model list failed (%s); using configured models as-is.", e)
        return None


def _version_key(name: str) -> tuple:
    import re

    return tuple(int(n) for n in re.findall(r"\d+", name))


def _build_model_chain(
    configured: list[str], available: list[str] | None, discover: bool, preferred: str | None
) -> list[str]:
    """Preferred env model, then configured order, then (optionally) other
    discovered flash models, newest first."""
    from logger import log

    chain: list[str] = []

    def add(name: str) -> None:
        if name and name not in chain:
            chain.append(name)

    if preferred:
        add(preferred)
    for name in configured:
        if available is not None and name not in available:
            log.warning("Configured Gemini model %s not in model list; skipping.", name)
            continue
        add(name)
    if discover and available:
        for name in sorted((n for n in available if "flash" in n), key=_version_key, reverse=True):
            add(name)
    return chain


def _call_gemini(gemini_key: str, gemini_model: str, prompt: str, timeout: int) -> list[Verdict]:
    """Single Gemini call. Returns verdicts or raises ``GeminiCallError``."""
    import requests

    url = f"{_GEMINI_BASE}/models/{gemini_model}:generateContent?key={gemini_key}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2},
    }
    try:
        resp = requests.post(url, json=body, timeout=timeout)
    except requests.RequestException as e:
        raise GeminiCallError(f"request error: {e}", transient=True) from e

    if resp.status_code != 200:
        raise GeminiCallError(
            f"HTTP {resp.status_code}: {resp.text[:200]}",
            transient=resp.status_code in _TRANSIENT_STATUS,
        )
    try:
        content = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(_parse_llm_response(content))
    except (KeyError, IndexError, ValueError) as e:
        raise GeminiCallError(f"unparseable response: {e}", transient=False) from e


def _call_with_fallback(
    gemini_key: str,
    chain: list[str],
    prompt: str,
    attempts: int,
    timeout: int,
    *,
    label: str = "Judging",
    require_nonempty: bool = True,
):
    """Try each model in *chain* (retrying transient errors) and return the parsed JSON.

    With ``require_nonempty`` an empty result counts as a failure; otherwise an
    empty list/dict is a valid answer. Raises ``RuntimeError`` when all models fail.
    """
    from logger import log

    failures: list[str] = []
    for model in chain:
        for attempt in range(attempts):
            log.info("%s with %s (attempt %d/%d)...", label, model, attempt + 1, attempts)
            try:
                result = _call_gemini(gemini_key, model, prompt, timeout)
            except GeminiCallError as e:
                log.warning("%s failed: %s", model, e)
                if not e.transient:
                    failures.append(f"{model}: {e}")
                    break
                if attempt + 1 < attempts:
                    time.sleep(2 ** (attempt + 1))
                else:
                    failures.append(f"{model}: {e}")
                continue
            if result or not require_nonempty:
                log.info("%s done with %s.", label, model)
                return result
            failures.append(f"{model}: empty verdicts")
            break
    raise RuntimeError("LLM judgment failed on every Gemini model:\n  " + "\n  ".join(failures))


def _judge_with_fallback(gemini_key: str, chain: list[str], prompt: str, attempts: int, timeout: int) -> list[Verdict]:
    return _call_with_fallback(gemini_key, chain, prompt, attempts, timeout)


def _resolve_gemini_chain(gemini_key: str) -> tuple[list[str], dict]:
    """Load judge config, discover models and build the chain. Returns (chain, cfg)."""
    from logger import log

    cfg = _load_judge_config()
    timeout = int(cfg["timeout_seconds"])
    available = _list_gemini_models(gemini_key, timeout) if cfg["discover_models"] else None
    chain = _build_model_chain(
        cfg["gemini_models"], available, bool(cfg["discover_models"]), os.environ.get("GEMINI_MODEL") or None
    )
    if not chain:
        raise RuntimeError("No Gemini models to try. Check judge.gemini_models in config.yaml.")
    log.info("Gemini model chain: %s", ", ".join(chain))
    return chain, cfg


# --------------------------------------------------------------------------- #
# Main entry point
# --------------------------------------------------------------------------- #


def judge_repositories(
    *,
    needs_evaluation_path: str = ".needs_evaluation.json",
    profile_path: str = "profile.md",
    output_path: str = "verdicts.json",
) -> list[Verdict]:
    """Run LLM judgment on the repos from *needs_evaluation_path*.

    Returns the parsed verdicts list. Raises ``RuntimeError`` when no LLM
    API key is available or every model in the chain fails, so the caller
    (scan.py finalize) does not silently proceed with fabricated verdicts.
    """
    from logger import log

    _load_env_file()

    needs_file = Path(needs_evaluation_path)
    if not needs_file.exists():
        raise FileNotFoundError(f"{needs_evaluation_path} not found. Run `prepare` first.")

    payload = json.loads(needs_file.read_text())
    repos = payload.get("repos", [])
    if not repos:
        log.info("No repositories to evaluate.")
        Path(output_path).write_text("[]")
        return []

    profile_text = Path(profile_path).read_text() if Path(profile_path).exists() else ""

    # Show the model only factual history from the prior check. The prior
    # verdict and judgment text would anchor it to its earlier answer.
    prompt_repos = []
    for entry in repos:
        prior = entry.get("prior")
        facts = {k: prior[k] for k in ("first_seen", "stars_at_check") if k in prior} if prior else None
        prompt_repos.append({**entry, "prior": facts})

    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not gemini_key:
        raise RuntimeError(
            "No LLM API key configured. Set GEMINI_API_KEY / GOOGLE_API_KEY in your environment or .env file."
        )

    chain, cfg = _resolve_gemini_chain(gemini_key)
    timeout = int(cfg["timeout_seconds"])

    # Judgments are published in public reports, so the prompt never names the
    # profile owner and tells the model not to either.
    prompt = f"""You are an expert AI engineering scout evaluating GitHub repositories against an interest profile.
Profile criteria & Interests:
{profile_text}

Repositories to evaluate:
{json.dumps(prompt_repos, indent=2)}

Return a JSON array where each entry has:
- "repo": "owner/name"
- "verdict": one of "fit", "maybe", "not-fit"
- "judgment": one concise paragraph explaining why it is or isn't relevant to the profile.
In judgments, refer to "the profile" and its focus areas. Never use a person's name, pronouns, or possessives like "his" or "the user's".
Return ONLY valid JSON array without extra markdown formatting."""

    verdicts = _judge_with_fallback(gemini_key, chain, prompt, int(cfg["attempts_per_model"]), timeout)

    Path(output_path).write_text(json.dumps(verdicts, indent=2))
    log.info("Wrote %d verdicts to %s", len(verdicts), output_path)
    return verdicts
