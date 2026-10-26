"""Readable application activity logs containing explicit operational metadata only."""

import json
import logging
import os
import time
from pathlib import Path


# Configure the application namespace without replacing server or host logging handlers.
def configure_logging() -> None:
    """Configure one UTC console handler and the level from GATEKEEPER_LOG_LEVEL; return None."""
    logger = logging.getLogger("gatekeeper")
    level = os.environ.get("GATEKEEPER_LOG_LEVEL", "INFO").upper()
    logger.setLevel(level if level in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"} else "INFO")

    if not logger.handlers:
        formatter = logging.Formatter(
            "%(asctime)sZ %(levelname)s %(name)s %(message)s", datefmt="%Y-%m-%dT%H:%M:%S"
        )
        formatter.converter = time.gmtime
        handler = logging.StreamHandler()
        handler.setFormatter(formatter)
        logger.addHandler(handler)


# Serialize explicitly selected metadata on one line without accepting payloads implicitly.
def log_event(
    logger: logging.Logger, event: str, *, level: int = logging.INFO, **fields: object
) -> None:
    """Write event and selected fields at level through logger; return None."""
    if not logger.isEnabledFor(level):
        return

    context = " ".join(
        f"{key}={json.dumps(value, default=str, ensure_ascii=True)}"
        for key, value in fields.items()
    )
    logger.log(level, "%s%s", event, f" {context}" if context else "")


# Preserve useful stack locations without exception text, source lines, or frame locals.
def error_context(error: Exception) -> dict[str, str]:
    """Return the exception type and stack locations for error, excluding its message and data."""
    locations = []
    traceback = error.__traceback__

    while traceback is not None:
        code = traceback.tb_frame.f_code
        locations.append(f"{Path(code.co_filename).name}:{code.co_name}:{traceback.tb_lineno}")
        traceback = traceback.tb_next

    return {"exception_type": type(error).__name__, "stack": " > ".join(locations)}
