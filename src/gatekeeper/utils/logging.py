"""Scoped console logging with safe diagnostic tracebacks and bounded metadata."""

import logging
import logging.config
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from types import TracebackType

# Application records use one UTC console format and a dedicated logger hierarchy.
LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"


# Render timezone-aware timestamps and tracebacks without exception messages or source content.
class SafeFormatter(logging.Formatter):
    # Keep the timestamp independent of the host's local timezone.
    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        """Return an ISO UTC timestamp for record; datefmt is intentionally unused."""
        return datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds")

    # Retain debugging locations without exposing payloads embedded in exceptions or source lines.
    def formatException(
        self,
        ei: tuple[type[BaseException], BaseException, TracebackType | None]
        | tuple[None, None, None],
    ) -> str:
        """Return safe locations for ei, omitting messages, chains, source lines, and locals."""
        exception_type, _, traceback = ei
        locations = []

        while traceback is not None:
            code = traceback.tb_frame.f_code
            locations.append(f"{Path(code.co_filename).name}:{code.co_name}:{traceback.tb_lineno}")
            traceback = traceback.tb_next

        name = exception_type.__name__ if exception_type is not None else "UnknownError"
        return f"exception_type={name} stack={' > '.join(locations)}"


# Configure only Gatekeeper, leaving framework and host handlers open and untouched.
def configure_logging() -> None:
    """Configure stdout with BACKEND_LOG_LEVEL or its legacy fallback; return None."""
    logger = logging.getLogger("gatekeeper")
    level = (
        os.getenv("BACKEND_LOG_LEVEL", os.getenv("GATEKEEPER_LOG_LEVEL", "INFO")).strip().upper()
    )
    level = level if level in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"} else "INFO"
    handler = next((h for h in logger.handlers if h.name == "gatekeeper_console"), None)

    if handler is None:
        handler = logging.StreamHandler(sys.stdout)
        handler.set_name("gatekeeper_console")
        handler.setFormatter(SafeFormatter(LOG_FORMAT))
        logger.addHandler(handler)

    logging.config.dictConfig(
        {
            "version": 1,
            "incremental": True,
            "loggers": {"gatekeeper": {"level": level, "propagate": False}},
        }
    )


# Limit user-configured labels to a single bounded token before including them in logs.
def safe_label(value: str) -> str:
    """Return at most 100 safe identifier characters from value, replacing other characters."""
    return re.sub(r"[^A-Za-z0-9_./:-]", "_", value[:100])
