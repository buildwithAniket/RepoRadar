"""Email delivery for RepoRadar V3 digests.

Supports two delivery methods, selectable via config.yaml:
- ``smtp``  — direct Gmail SMTP via app password (default, original behaviour)
- ``mcp``   — delegates to the Google Workspace GAPI script (gmail_mcp.py)

Fails gracefully (logs a warning) when credentials are missing or the
chosen delivery method is unavailable, but does not crash the pipeline.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import yaml

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #


def _load_config() -> dict:
    config_path = Path(__file__).resolve().parent.parent / "config.yaml"
    if config_path.is_file():
        with config_path.open("r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


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


# --------------------------------------------------------------------------- #
# SMTP delivery (original behaviour)
# --------------------------------------------------------------------------- #


def send_digest_smtp(subject: str, body: str, recipient: str | None = None) -> bool:
    """Send the digest via Gmail SMTP. Returns True on success."""
    from logger import log

    _load_env_file()
    user = os.environ.get("GMAIL_USER")
    password = os.environ.get("GMAIL_APP_PASSWORD")
    to_email = recipient or user

    if not user or not password:
        log.warning("GMAIL_USER or GMAIL_APP_PASSWORD not set. Email skipped.")
        return False

    import smtplib
    from email.message import EmailMessage

    msg = EmailMessage()
    msg.set_content(body)
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(user, password)
            server.send_message(msg)
        log.info("Digest emailed to %s via SMTP", to_email)
        return True
    except Exception as e:
        log.error("Failed to send email via SMTP: %s", e)
        return False


# --------------------------------------------------------------------------- #
# MCP delivery (gmail_mcp.py → Google Workspace GAPI script)
# --------------------------------------------------------------------------- #

GAPI_SCRIPT = Path.home() / ".hermes/skills/productivity/google-workspace/scripts/google_api.py"


def send_digest_mcp(subject: str, body: str, recipient: str | None = None) -> bool:
    """Send the digest via the Gmail MCP/GAPI script. Returns True on success."""
    from logger import log

    if not GAPI_SCRIPT.is_file():
        log.error("Gmail GAPI script not found at %s. MCP email skipped.", GAPI_SCRIPT)
        return False

    cmd = [
        "python3",
        str(GAPI_SCRIPT),
        "gmail",
        "send",
        "--subject",
        subject,
        "--body",
        body,
    ]
    if recipient:
        cmd.extend(["--to", recipient])

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=60)
        log.info("Digest sent via Gmail MCP.")
        return True
    except subprocess.CalledProcessError as e:
        log.error("Gmail MCP failed (exit %d): %s", e.returncode, (e.stderr or e.stdout)[:300])
        return False
    except Exception as e:
        log.error("Gmail MCP exception: %s", e)
        return False


# --------------------------------------------------------------------------- #
# Dispatch
# --------------------------------------------------------------------------- #


def send_digest_email(subject: str, body: str, recipient: str | None = None) -> bool:
    """Send the digest using the method selected in config.yaml.

    Falls back to SMTP if the configured method is unavailable or the config
    is missing.
    """
    from logger import log

    _load_env_file()
    config = _load_config()
    method = (config.get("email", {}) or {}).get("method", "smtp").lower()

    log.info("Email delivery method: %s", method)

    if method == "mcp":
        ok = send_digest_mcp(subject, body, recipient)
        if not ok:
            log.warning("MCP delivery failed; falling back to SMTP.")
            return send_digest_smtp(subject, body, recipient)
        return True

    # Default / fallback: SMTP
    return send_digest_smtp(subject, body, recipient)
