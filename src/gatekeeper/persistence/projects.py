"""Project scoping and SQLite row mapping."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status

from gatekeeper.contracts.candidates import Candidate
from gatekeeper.contracts.configs import Config
from gatekeeper.contracts.dataset_releases import DatasetRelease
from gatekeeper.contracts.evaluations import Evaluation
from gatekeeper.contracts.projects import Project


# UTC timestamp generator.
def timestamp() -> datetime:
    return datetime.now(UTC)


# Project existence guard.
def project_or_404(connection: sqlite3.Connection, project_id: UUID) -> None:
    if (
        connection.execute("SELECT 1 FROM projects WHERE id = ?", (str(project_id),)).fetchone()
        is None
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")


# Project row mapper.
def project_from_row(row: sqlite3.Row) -> Project:
    return Project(id=row["id"], name=row["name"], created_at=row["created_at"])


# Candidate row mapper.
def candidate_from_row(row: sqlite3.Row) -> Candidate:
    return Candidate(
        id=row["id"],
        project_id=row["project_id"],
        application_version=row["application_version"],
        runtime_configuration=json.loads(row["runtime_configuration"]),
        runtime_configuration_digest=row["runtime_configuration_digest"],
        created_at=row["created_at"],
    )


# Dataset release row mapper.
def release_from_row(row: sqlite3.Row) -> DatasetRelease:
    return DatasetRelease(
        id=row["id"],
        project_id=row["project_id"],
        dataset_name=row["dataset_name"],
        version=row["version"],
        scenarios=json.loads(row["scenarios"]),
        content_digest=row["content_digest"],
        created_at=row["created_at"],
    )


# Config row mapper.
def config_from_row(row: sqlite3.Row) -> Config:
    return Config(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        version=row["version"],
        settings=json.loads(row["settings"]),
        thresholds=json.loads(row["thresholds"]),
        weights=json.loads(row["weights"]),
        default_attempts=row["default_attempts"],
        digest=row["digest"],
        created_at=row["created_at"],
    )


# Evaluation row mapper.
def evaluation_from_row(row: sqlite3.Row) -> Evaluation:
    return Evaluation(
        id=row["id"],
        project_id=row["project_id"],
        candidate_id=row["candidate_id"],
        dataset_release_id=row["dataset_release_id"],
        config_id=row["config_id"],
        candidate_digest=row["candidate_digest"],
        dataset_release_digest=row["dataset_release_digest"],
        config_digest=row["config_digest"],
        candidate_snapshot=json.loads(row["candidate_snapshot"]),
        dataset_release_snapshot=json.loads(row["dataset_release_snapshot"]),
        config_snapshot=json.loads(row["config_snapshot"]),
        created_at=row["created_at"],
    )
