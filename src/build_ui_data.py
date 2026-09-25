"""Deterministic Digest Data Builder for RepoRadar V3.

Pure Python 3 standard library script.
Scans reports/*.md, parses daily digests, joins with seen-repos.json,
and generates ui/data/digests.js for offline UI and Node test execution.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger("build_ui_data")

REPO_ROOT = Path(__file__).resolve().parent.parent

# Curated languages for known repos in RepoRadar digests
KNOWN_LANGUAGES: Dict[str, str] = {
    "abhigyanpatwari/GitNexus": "TypeScript",
    "tashfeenahmed/freellmapi": "Python",
    "ChromeDevTools/chrome-devtools-mcp": "TypeScript",
    "livekit/agents": "Python",
    "cursor/plugins": "TypeScript",
    "tailscale/tailcat": "Go",
    "abi/screenshot-to-code": "Python",
    "NationalSecurityAgency/ghidra": "Java",
    "swoole/typephp": "C++",
    "DietrichGebert/ponytail": "Rust",
    "NousResearch/hermes-agent": "Python",
    "superlinked/sie": "Python",
    "pacifio/atlas": "TypeScript",
    "Imbad0202/academic-research-skills": "Markdown",
    "affaan-m/ECC": "TypeScript",
    "vercel-labs/portless": "Rust",
    "JuliusBrussee/caveman": "TypeScript",
    "mattpocock/skills": "TypeScript",
    "Gitlawb/openclaude": "TypeScript",
    "google-research/timesfm": "Python",
    "debpalash/VoiceStudio": "Python",
    "blader/humanizer": "Python",
    "firecrawl/pdf-inspector": "TypeScript",
    "fmtlib/fmt": "C++",
    "sngyai/Sequoia-X": "Python",
    "zyronon/TypeWords": "TypeScript",
    "protocolbuffers/protobuf": "C++",
    "JustVugg/colibri": "C",
    "alibaba/open-code-review": "Python",
    "Panniantong/Agent-Reach": "Python",
    "asgeirtj/system_prompts_leaks": "Markdown",
    "rlaope/oh-my-hermes": "Python",
    "TauricResearch/TradingAgents": "Python",
    "tech-leads-club/agent-skills": "TypeScript",
    "SnailSploit/Claude-Red": "Python",
    "666ghj/MiroFish": "Python",
    "dani-garcia/vaultwarden": "Rust",
    "huggingface/transformers": "Python",
    "ever-co/ever-gauzy": "TypeScript",
    "Crosstalk-Solutions/project-nomad": "Go",
    "multimodal-art-projection/YuE": "Python",
    "localsend/localsend": "Dart",
    "ruvnet/RuView": "Rust",
    "OpenBMB/VoxCPM": "Python",
    "reconurge/flowsint": "Go",
    "peetzweg/opendisplay": "C++",
    "cloudflare/security-audit-skill": "TypeScript",
    "anthropics/knowledge-work-plugins": "TypeScript",
    "anthropics/claude-code": "TypeScript",
    "alphaXiv/OpenResearch": "TypeScript",
    "Tencent/WeKnora": "Go",
    "addyosmani/agent-skills": "TypeScript",
    "cline/cline": "TypeScript",
    "jamiepine/voicebox": "TypeScript",
    "ankitects/anki": "Rust",
    "supabase/supabase": "TypeScript",
    "abue-ammar/tinycast": "Swift",
    "Lakr233/vphone-cli": "Go",
    "roboflow/supervision": "Python",
    "agent-substrate/substrate": "TypeScript",
    "dream-num/univer": "TypeScript",
    "davila7/claude-code-templates": "Markdown",
    "google/ax": "Python",
    "anthropics/financial-services": "TypeScript",
    "superdesigndev/treg": "TypeScript",
    "mvt-project/mvt": "Python",
    "browser-use/video-use": "Python",
}

VERDICT_MAP: Dict[str, Dict[str, str]] = {
    "fit": {"label": "OFFICIAL SELECTION", "confidence": "high"},
    "maybe": {"label": "UNDER REVIEW", "confidence": "medium"},
    "not-fit": {"label": "ARCHIVED / PASS", "confidence": "low"},
}

REPO_LINE_PATTERN = re.compile(
    r"^-\s+\*\*\[(?P<id>[^\]]+)\]\((?P<url>[^\)]+)\)\*\*"
    r"(?:\s+\((?P<stars>[^\)]+?)\s+stars?\))?"
    r"(?:\s+\[(?P<tag>[^\]]+)\])?:\s*(?P<reason>.*)$"
)


def parse_stars(stars_raw: Optional[Union[str, int, float]]) -> int:
    """Robustly parse star counts from string or numeric (raw integer, comma-separated, or suffixed)."""
    if stars_raw is None:
        return 0
    if isinstance(stars_raw, (int, float)):
        try:
            if math.isnan(stars_raw) or math.isinf(stars_raw) or stars_raw <= 0:
                return 0
            return max(0, int(stars_raw))
        except (ValueError, OverflowError):
            return 0
    s = str(stars_raw).replace(",", "").strip().lower()
    if not s:
        return 0
    multiplier = 1.0
    if s.endswith("k"):
        multiplier = 1000.0
        s = s[:-1]
    elif s.endswith("m"):
        multiplier = 1000000.0
        s = s[:-1]
    try:
        val = float(s)
        if math.isnan(val) or math.isinf(val):
            return 0
        total = val * multiplier
        if math.isnan(total) or math.isinf(total):
            return 0
        return max(0, int(total))
    except (ValueError, OverflowError):
        return 0


def normalize_verdict(header_text: Any) -> str:
    """Normalize markdown section title into 'fit', 'maybe', or 'not-fit'."""
    if not isinstance(header_text, str):
        return "maybe"
    h = header_text.lower()
    # Check for not-fit / pass / rejection first
    if any(k in h for k in ["🔴", "not fit", "not-fit", "unfit", "archived", "out of competition"]) or re.search(
        r"\b(pass|unfit|not-fit|archived)\b", h
    ):
        return "not-fit"
    # Check for fit / selection (word boundaries prevent 'unfit', 'profit', 'benefit' false positives)
    if "🟢" in h or re.search(r"\b(fit|select|selection|choice)\b", h):
        return "fit"
    # Check for maybe / review
    if any(k in h for k in ["🟡", "under review"]) or re.search(r"\b(maybe|review)\b", h):
        return "maybe"
    return "maybe"


def infer_language(repo_id: str, judgment: str = "", default: str = "Unknown") -> str:
    """Infer primary programming language using curated map, text heuristics, or fallback."""
    if not repo_id or not isinstance(repo_id, str):
        return default if default else "Unknown"
    if repo_id in KNOWN_LANGUAGES:
        return KNOWN_LANGUAGES[repo_id]

    text = f"{repo_id} {judgment}".lower()
    if re.search(r"\b(python|py)\b", text):
        return "Python"
    if re.search(r"\b(typescript|ts)\b", text):
        return "TypeScript"
    if re.search(r"\b(javascript|node|js)\b", text):
        return "JavaScript"
    if re.search(r"\b(rust|rs)\b", text):
        return "Rust"
    if re.search(r"\b(golang|go)\b", text):
        return "Go"
    if re.search(r"\b(c\+\+|cpp)\b", text):
        return "C++"
    if re.search(r"\b(c engine|c-based|ansi c)\b", text):
        return "C"
    if re.search(r"\b(swift)\b", text):
        return "Swift"
    if re.search(r"\b(java)\b", text) and not re.search(r"\b(javascript)\b", text):
        return "Java"
    if re.search(r"\b(kotlin)\b", text):
        return "Kotlin"
    if re.search(r"\b(dart|flutter)\b", text):
        return "Dart"
    if re.search(r"\b(markdown|prompt|skills)\b", text):
        return "Markdown"

    return default if default else "Unknown"


def load_seen_repos(state_path: Union[str, Path]) -> Dict[str, Any]:
    """Load seen-repos.json persistent state, returning empty dict if missing or invalid."""
    path = Path(state_path)
    if not path.is_file():
        # Try resolving relative to REPO_ROOT
        alt_path = REPO_ROOT / state_path
        if alt_path.is_file():
            path = alt_path
        else:
            logger.warning("State file not found at %s. Proceeding with empty state.", state_path)
            return {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
            logger.warning("State file %s does not contain a JSON object. Using empty state.", path)
            return {}
    except Exception as e:
        logger.warning("Error reading state file %s: %s. Using empty state.", path, e)
        return {}


def parse_report_file(filepath: Union[str, Path], seen_repos: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a single YYYY-MM-DD.md digest and join with seen-repos state."""
    path = Path(filepath)
    filename = path.name

    # Extract date from filename or content
    date_match = re.search(r"(\d{4}-\d{2}-\d{2})", filename)
    date_str = date_match.group(1) if date_match else "unknown"

    empty_digest = {
        "date": date_str,
        "evaluatedCount": 0,
        "skippedCount": 0,
        "stats": {"fit": 0, "maybe": 0, "notFit": 0, "total": 0},
        "summary": {"evaluated": 0, "skipped": 0, "fit": 0, "maybe": 0, "notFit": 0, "total": 0},
        "repos": [],
    }

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        logger.error("Failed to read report file %s: %s", path, e)
        return empty_digest

    try:
        lines = content.splitlines()

        # If date_str is still unknown, try finding in header
        if date_str == "unknown":
            hdr_m = re.search(r"# RepoRadar Daily Digest\s*[—\-]\s*(\d{4}-\d{2}-\d{2})", content)
            if hdr_m:
                date_str = hdr_m.group(1)
                empty_digest["date"] = date_str

        # Parse evaluated and skipped count from summary sentence
        evaluated_count = 0
        skipped_count = 0
        for line in lines[:8]:
            line_clean = line.strip()
            m_eval = re.search(r"evaluated\s+(\d+)", line_clean, re.IGNORECASE)
            m_skip = re.search(r"skipped\s+(\d+)", line_clean, re.IGNORECASE)
            if m_eval:
                evaluated_count = int(m_eval.group(1))
            if m_skip:
                skipped_count = int(m_skip.group(1))
            if m_eval and m_skip:
                break

        current_verdict: Optional[str] = None
        repos: List[Dict[str, Any]] = []

        for line in lines:
            line_clean = line.strip()
            if not line_clean:
                continue

            # Check for section header
            if line_clean.startswith("##"):
                current_verdict = normalize_verdict(line_clean)
                continue

            # Check for repo line
            if line_clean.startswith("- **[") or line_clean.startswith("- ["):
                m = REPO_LINE_PATTERN.match(line_clean)
                if not m:
                    continue

                groups = m.groupdict()
                repo_id = groups["id"].strip()
                url = groups["url"].strip()
                raw_stars = groups.get("stars")
                tag = (groups.get("tag") or "").strip()
                reason = groups.get("reason", "").strip()

                parts = repo_id.split("/", 1)
                owner = parts[0] if len(parts) > 1 else repo_id
                name = parts[1] if len(parts) > 1 else repo_id

                parsed_stars = parse_stars(raw_stars)

                # Metadata join with seen-repos.json (handle null or non-dict seen_entry)
                seen_raw = seen_repos.get(repo_id) if isinstance(seen_repos, dict) else None
                seen_entry = seen_raw if isinstance(seen_raw, dict) else {}

                # Stars priority: seen-repos if finite & > 0, else parsed from report, else 0
                stars_raw = seen_entry.get("stars_at_check")
                if isinstance(stars_raw, (int, float)):
                    try:
                        if math.isnan(stars_raw) or math.isinf(stars_raw) or stars_raw <= 0:
                            stars = parsed_stars
                        else:
                            stars = int(stars_raw)
                    except (ValueError, OverflowError):
                        stars = parsed_stars
                elif isinstance(stars_raw, str):
                    s_parsed = parse_stars(stars_raw)
                    stars = s_parsed if s_parsed > 0 else parsed_stars
                else:
                    stars = parsed_stars

                stars = max(0, int(stars))

                # Verdict determination (handle non-string or unhashable types in state)
                raw_verdict = current_verdict
                if not raw_verdict:
                    sv = seen_entry.get("verdict")
                    if isinstance(sv, str) and sv.strip():
                        raw_verdict = sv.strip()
                    else:
                        raw_verdict = "maybe"

                if raw_verdict in VERDICT_MAP:
                    verdict = raw_verdict
                else:
                    verdict = normalize_verdict(raw_verdict)

                if verdict not in VERDICT_MAP:
                    verdict = "maybe"

                verdict_info = VERDICT_MAP.get(verdict, VERDICT_MAP["maybe"])
                verdict_label = verdict_info["label"]

                # Confidence determination
                conf = seen_entry.get("confidence")
                if isinstance(conf, str) and conf.strip().lower() in ("high", "medium", "low"):
                    confidence = conf.strip().lower()
                else:
                    confidence = verdict_info["confidence"]

                # PushedAt / Release determination (strictly YYYY-MM-DD 10 characters)
                pushed_at = date_str[:10] if len(date_str) >= 10 else date_str
                for date_field in ("latest_release_at_check", "last_checked", "pushed_at", "pushedAt"):
                    val = seen_entry.get(date_field)
                    if isinstance(val, str) and len(val.strip()) >= 10:
                        val_clean = val.strip()
                        m_date = re.search(r"(\d{4}-\d{2}-\d{2})", val_clean)
                        if m_date:
                            pushed_at = m_date.group(1)
                        else:
                            pushed_at = val_clean[:10]
                        break

                # Language determination (safe fallback to "Unknown")
                lang_val = seen_entry.get("language")
                if isinstance(lang_val, str) and lang_val.strip():
                    language = lang_val.strip()
                else:
                    language = infer_language(repo_id, judgment=reason, default="Unknown")
                if not language or not isinstance(language, str):
                    language = "Unknown"

                # Topics
                topics = seen_entry.get("topics")
                if not isinstance(topics, list):
                    topics = []
                else:
                    topics = [str(t) for t in topics if t is not None]

                # Reason fallback
                if not reason and isinstance(seen_entry.get("reason"), str):
                    reason = seen_entry["reason"]
                if not reason:
                    reason = ""

                # Classification
                tag_clean = tag.strip() if isinstance(tag, str) else ""
                classification_val = seen_entry.get("classification")
                if tag_clean:
                    classification = tag_clean
                elif isinstance(classification_val, str) and classification_val.strip():
                    classification = classification_val.strip()
                else:
                    classification = "new"

                # URL fallback
                if not url or not isinstance(url, str) or not url.startswith("http"):
                    url = f"https://github.com/{owner}/{name}"

                repos.append(
                    {
                        "id": repo_id,
                        "owner": owner,
                        "name": name,
                        "stars": stars,
                        "language": language,
                        "pushedAt": pushed_at,
                        "confidence": confidence,
                        "verdict": verdict,
                        "verdictLabel": verdict_label,
                        "reason": reason,
                        "classification": classification,
                        "topics": topics,
                        "url": url,
                    }
                )

        fits = sum(1 for r in repos if r["verdict"] == "fit")
        maybes = sum(1 for r in repos if r["verdict"] == "maybe")
        not_fits = sum(1 for r in repos if r["verdict"] == "not-fit")
        total_repos = len(repos)

        if evaluated_count == 0 and total_repos > 0:
            evaluated_count = total_repos

        stats = {
            "fit": fits,
            "maybe": maybes,
            "notFit": not_fits,
            "total": total_repos,
        }

        summary = {
            "evaluated": evaluated_count,
            "skipped": skipped_count,
            "fit": fits,
            "maybe": maybes,
            "notFit": not_fits,
            "total": total_repos,
        }

        return {
            "date": date_str,
            "evaluatedCount": evaluated_count,
            "skippedCount": skipped_count,
            "stats": stats,
            "summary": summary,
            "repos": repos,
        }
    except Exception as e:
        logger.error("Unexpected error parsing report file content for %s: %s", path, e, exc_info=True)
        return empty_digest


def generate_js_content(digests: Dict[str, Any]) -> str:
    """Generate JavaScript file content exposing window.REPORADAR_DIGESTS and CommonJS export."""
    sorted_dates = sorted(digests.keys())
    latest_date = sorted_dates[-1] if sorted_dates else ""
    active_dates = [d for d in sorted_dates if digests[d].get("evaluatedCount", 0) > 0]
    latest_active_date = active_dates[-1] if active_dates else latest_date

    digests_json = json.dumps(digests, indent=2, ensure_ascii=False)
    dates_json = json.dumps(sorted_dates, ensure_ascii=False)
    latest_date_json = json.dumps(latest_date, ensure_ascii=False)
    latest_active_date_json = json.dumps(latest_active_date, ensure_ascii=False)

    return f"""// Auto-generated by RepoRadar V3 (src/build_ui_data.py)
// Do not edit manually.

if (typeof window === 'undefined') {{
  var window = {{}};
}}

window.REPORADAR_DIGESTS = {digests_json};

// Non-enumerable metadata helpers for ergonomic access without polluting Object.keys()
Object.defineProperty(window.REPORADAR_DIGESTS, 'dates', {{
  value: {dates_json},
  enumerable: false,
  configurable: true,
  writable: true
}});

Object.defineProperty(window.REPORADAR_DIGESTS, 'latestDate', {{
  value: {latest_date_json},
  enumerable: false,
  configurable: true,
  writable: true
}});

Object.defineProperty(window.REPORADAR_DIGESTS, 'latestActiveDate', {{
  value: {latest_active_date_json},
  enumerable: false,
  configurable: true,
  writable: true
}});

Object.defineProperty(window.REPORADAR_DIGESTS, 'digests', {{
  value: window.REPORADAR_DIGESTS,
  enumerable: false,
  configurable: true,
  writable: true
}});

if (typeof module !== 'undefined' && module.exports) {{
  module.exports = window.REPORADAR_DIGESTS;
}}
"""


def build_ui_data(
    reports_dir: Union[str, Path] = "reports",
    state_path: Union[str, Path] = "seen-repos.json",
    output_path: Union[str, Path] = "ui/data/digests.js",
) -> Dict[str, Any]:
    """Scan markdown reports, parse digests, join with seen-repos, and write ui/data/digests.js.

    Args:
        reports_dir: Directory containing daily markdown reports.
        state_path: Path to seen-repos.json file.
        output_path: Output path for generated digests.js.

    Returns:
        dict mapping date strings (YYYY-MM-DD) to their digest data.
    """
    reports_path = Path(reports_dir)
    if not reports_path.is_dir():
        alt = REPO_ROOT / reports_dir
        if alt.is_dir():
            reports_path = alt

    state_file = Path(state_path)
    if not state_file.is_file():
        alt = REPO_ROOT / state_path
        if alt.is_file():
            state_file = alt

    out_file = Path(output_path)
    if not out_file.is_absolute():
        repo_candidate = REPO_ROOT / output_path
        if str(output_path) == "ui/data/digests.js":
            out_file = repo_candidate
        elif repo_candidate.parent.is_dir() and not (Path.cwd() / output_path).parent.is_dir():
            out_file = repo_candidate
        else:
            out_file = Path.cwd() / output_path

    logger.info("Building UI data bundle from %s and %s", reports_path, state_file)
    seen_repos = load_seen_repos(state_file)

    report_files = []
    if reports_path.is_dir():
        for p in reports_path.iterdir():
            if p.is_file() and re.match(r"^\d{4}-\d{2}-\d{2}\.md$", p.name):
                report_files.append(p)

    report_files.sort(key=lambda p: p.name)

    digests: Dict[str, Any] = {}
    total_evaluated = 0

    for rf in report_files:
        try:
            digest = parse_report_file(rf, seen_repos)
        except Exception as e:
            logger.error("Failed to parse report file %s: %s", rf, e, exc_info=True)
            date_m = re.search(r"(\d{4}-\d{2}-\d{2})", rf.name)
            d_key = date_m.group(1) if date_m else "unknown"
            digest = {
                "date": d_key,
                "evaluatedCount": 0,
                "skippedCount": 0,
                "stats": {"fit": 0, "maybe": 0, "notFit": 0, "total": 0},
                "summary": {"evaluated": 0, "skipped": 0, "fit": 0, "maybe": 0, "notFit": 0, "total": 0},
                "repos": [],
            }
        date_key = digest.get("date", "unknown")
        digests[date_key] = digest
        total_evaluated += digest.get("evaluatedCount", 0)
        logger.debug(
            "Parsed %s: %d evaluated, %d skipped (fit=%d, maybe=%d, notFit=%d)",
            date_key,
            digest.get("evaluatedCount", 0),
            digest.get("skippedCount", 0),
            digest.get("stats", {}).get("fit", 0),
            digest.get("stats", {}).get("maybe", 0),
            digest.get("stats", {}).get("notFit", 0),
        )

    out_file.parent.mkdir(parents=True, exist_ok=True)
    js_content = generate_js_content(digests)
    out_file.write_text(js_content, encoding="utf-8")

    logger.info(
        "Successfully wrote %d digests (%d total evaluated repos) to %s",
        len(digests),
        total_evaluated,
        out_file,
    )
    return digests


def main() -> None:
    parser = argparse.ArgumentParser(description="Build deterministic UI digest data bundle for RepoRadar V3.")
    parser.add_argument(
        "--reports-dir",
        default="reports",
        help="Path to directory containing daily markdown reports (default: reports)",
    )
    parser.add_argument(
        "--state-path",
        default="seen-repos.json",
        help="Path to seen-repos.json persistent state (default: seen-repos.json)",
    )
    parser.add_argument(
        "--output-path",
        default="ui/data/digests.js",
        help="Path for generated JavaScript data bundle (default: ui/data/digests.js)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    try:
        build_ui_data(
            reports_dir=args.reports_dir,
            state_path=args.state_path,
            output_path=args.output_path,
        )
        sys.exit(0)
    except Exception as e:
        logger.error("Failed to build UI data: %s", e, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
