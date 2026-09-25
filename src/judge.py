"""LLM-as-judge step for RepoRadar V3.

Evaluates repos from .needs_evaluation.json against the user's profile
and writes structured verdicts to verdicts.json.

FAILS LOUDLY when no LLM API key is configured or all retries are exhausted,
rather than silently producing mock "fit" verdicts.
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


def _call_gemini(gemini_key: str, gemini_model: str, prompt: str, attempt: int) -> list[Verdict] | str | None:
    """Try a single Gemini call.

    Returns:
        - list[Verdict] on success
        - "RETRY" when rate-limited and should be retried
        - None on non-retryable failure
    """
    import requests

    from logger import log

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2},
    }
    try:
        resp = requests.post(url, json=body, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            content = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = _parse_llm_response(content)
            return json.loads(parsed)
        elif resp.status_code == 429:
            wait_time = 2 ** (attempt + 1)
            log.warning("Gemini rate limited (429). Retrying in %ds...", wait_time)
            time.sleep(wait_time)
            return "RETRY"
        else:
            log.error("Gemini API error (%d): %s", resp.status_code, resp.text[:300])
            return None
    except Exception as e:
        log.error("Gemini API exception: %s", e)
        time.sleep(2)
        return None


def _call_openai(openai_key: str, prompt: str, attempt: int) -> list[Verdict] | str | None:
    """Try a single OpenAI call.

    Returns:
        - list[Verdict] on success
        - "RETRY" when rate-limited and should be retried
        - None on non-retryable failure
    """
    import requests

    from logger import log

    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=body,
            timeout=30,
        )
        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"]
            parsed = _parse_llm_response(content)
            return json.loads(parsed)
        elif resp.status_code == 429:
            wait_time = 2 ** (attempt + 1)
            log.warning("OpenAI rate limited (429). Retrying in %ds...", wait_time)
            time.sleep(wait_time)
            return "RETRY"
        else:
            log.error("OpenAI API error (%d): %s", resp.status_code, resp.text[:300])
            return None
    except Exception as e:
        log.error("OpenAI exception: %s", e)
        time.sleep(2)
        return None


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
    API key is available or all retry attempts are exhausted, so the caller
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

    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    openai_key = os.environ.get("OPENAI_API_KEY")

    if not gemini_key and not openai_key:
        raise RuntimeError(
            "No LLM API key configured. Set GEMINI_API_KEY / GOOGLE_API_KEY "
            "or OPENAI_API_KEY in your environment or .env file."
        )

    prompt = f"""You are an expert AI engineering scout evaluating GitHub repositories for Aniket.
Profile criteria & Interests:
{profile_text}

Repositories to evaluate:
{json.dumps(repos, indent=2)}

Return a JSON array where each entry has:
- "repo": "owner/name"
- "verdict": one of "fit", "maybe", "not-fit"
- "judgment": one concise paragraph explaining why it is or isn't relevant to Aniket based on his profile.
Return ONLY valid JSON array without extra markdown formatting."""

    max_retries = 3
    verdicts: list[Verdict] | None = None

    for attempt in range(max_retries):
        log.info("LLM judgment attempt %d/%d...", attempt + 1, max_retries)

        if gemini_key and not openai_key:
            result = _call_gemini(gemini_key, gemini_model, prompt, attempt)
        elif openai_key and not gemini_key:
            result = _call_openai(openai_key, prompt, attempt)
        elif gemini_key:
            # Gemini preferred, OpenAI fallback on failure
            result = _call_gemini(gemini_key, gemini_model, prompt, attempt)
            if result == "RETRY":
                continue
            if isinstance(result, list):
                verdicts = result
                break
            # Non-retryable Gemini failure → try OpenAI
            log.info("Gemini failed; falling back to OpenAI...")
            if openai_key:
                result = _call_openai(openai_key, prompt, attempt)
            else:
                break
        else:
            # Only OpenAI available
            result = _call_openai(openai_key, prompt, attempt)

        if result == "RETRY":
            continue
        if isinstance(result, list):
            verdicts = result
            break
        # result is None (non-retryable error) → try next attempt or fallback

    if not verdicts:
        raise RuntimeError(
            "LLM judgment failed after {max_retries} attempts. "
            "Check your API key, network connectivity, and rate limits."
        )

    Path(output_path).write_text(json.dumps(verdicts, indent=2))
    log.info("Wrote %d verdicts to %s", len(verdicts), output_path)
    return verdicts
