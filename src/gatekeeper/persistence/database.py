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
        with self.connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS candidates (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
                    application_version TEXT NOT NULL, runtime_configuration TEXT NOT NULL,
                    runtime_configuration_digest TEXT NOT NULL, created_at TEXT NOT NULL,
                    UNIQUE(project_id, application_version, runtime_configuration_digest)
                );
                CREATE TABLE IF NOT EXISTS dataset_releases (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
                    dataset_name TEXT NOT NULL, version TEXT NOT NULL, scenarios TEXT NOT NULL,
                    content_digest TEXT NOT NULL, created_at TEXT NOT NULL,
                    UNIQUE(project_id, dataset_name, version)
                );
                CREATE TABLE IF NOT EXISTS configs (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
                    name TEXT NOT NULL, version TEXT NOT NULL, settings TEXT NOT NULL,
                    thresholds TEXT NOT NULL, weights TEXT NOT NULL,
                    default_attempts INTEGER NOT NULL, digest TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(project_id, name, version)
                );
                CREATE TABLE IF NOT EXISTS evaluations (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
                    candidate_id TEXT NOT NULL, dataset_release_id TEXT NOT NULL,
                    config_id TEXT NOT NULL,
                    candidate_digest TEXT NOT NULL, dataset_release_digest TEXT NOT NULL,
                    config_digest TEXT NOT NULL, candidate_snapshot TEXT NOT NULL,
                    dataset_release_snapshot TEXT NOT NULL, config_snapshot TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

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
