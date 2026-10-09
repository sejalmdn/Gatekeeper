"""SQLite initialization and connection lifecycle."""

from __future__ import annotations

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path


# SQLite storage manager.
class Database:
    # Initialize SQLite storage and schema.
    def __init__(self, path: str | Path) -> None:
        self.path = str(path)
        schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
        with self.connection() as connection:
            connection.executescript(schema)

    # Transactional SQLite connection context.
    @contextmanager
    def connection(self) -> Generator[sqlite3.Connection, None, None]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()
