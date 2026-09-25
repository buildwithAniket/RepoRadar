"""Logging configuration for RepoRadar V3.

Uses a module-level logger so every source file can do:
    from logger import log
    log.info("…")
    log.error("…")
    log.debug("…")
"""

from __future__ import annotations

import logging
import sys

_LOGGER = logging.getLogger("reporadar")
_HANDLER: logging.Handler | None = None


def _setup() -> logging.Logger:
    global _HANDLER
    if _LOGGER.handlers:
        return _LOGGER
    _LOGGER.setLevel(logging.INFO)
    _HANDLER = logging.StreamHandler(sys.stdout)
    _HANDLER.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    _LOGGER.addHandler(_HANDLER)
    return _LOGGER


def get_logger() -> logging.Logger:
    if not _LOGGER.handlers:
        _setup()
    return _LOGGER


# Module-level convenience — imported by every other module as `log`
log = get_logger()
