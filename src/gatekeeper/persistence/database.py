"""SQLite initialization and connection lifecycle."""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from time import perf_counter

# Storage summaries omit database paths, SQL statements, and driver exception messages.
logger = logging.getLogger(__name__)


# SQLite storage manager.
class Database:
    # Initialize SQLite storage and schema.
    def __init__(self, path: str | Path) -> None:
        """Initialize SQLite at path and its schema; return None."""
        started = perf_counter()
        self.path = str(path)
        schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
        with self.connection() as connection:
            connection.executescript(schema)

        logger.info("storage_initialized duration_ms=%d", (perf_counter() - started) * 1000)

    # Transactional SQLite connection context.
    @contextmanager
    def connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Yield a transactional SQLite connection; commit or roll back before closing it."""
        started = perf_counter()

        try:
            connection = sqlite3.connect(self.path)
        except sqlite3.Error as error:
            logger.error(
                "database_connection_failed error_code=%s exception_type=%s duration_ms=%d",
                getattr(error, "sqlite_errorname", "sqlite_error"),
                type(error).__name__,
                (perf_counter() - started) * 1000,
            )
            raise

        try:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            yield connection
            connection.commit()
        except BaseException as error:
            connection.rollback()

            if isinstance(error, sqlite3.Error):
                logger.log(
                    logging.WARNING if isinstance(error, sqlite3.IntegrityError) else logging.ERROR,
                    "database_transaction_failed error_code=%s exception_type=%s duration_ms=%d",
                    getattr(error, "sqlite_errorname", "sqlite_error"),
                    type(error).__name__,
                    (perf_counter() - started) * 1000,
                )

            raise
        finally:
            connection.close()
