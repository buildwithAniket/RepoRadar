"""Gmail MCP/GAPI delivery for RepoRadar V3.

This module is referenced by mailer.py when ``email.method: mcp`` is
configured in config.yaml. It is kept as a standalone helper for direct
invocation or future integration.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from logger import log

GAPI_SCRIPT = Path.home() / ".hermes/skills/productivity/google-workspace/scripts/google_api.py"


def send_digest_via_mcp(subject: str, body: str, recipient: str | None = None) -> bool:
    """Send an email via the Gmail MCP/GAPI script.

    Returns True on success.
    """
    if not GAPI_SCRIPT.is_file():
        log.error("Gmail GAPI script not found at %s", GAPI_SCRIPT)
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
