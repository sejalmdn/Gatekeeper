"""Project scoping and SQLite row mapping."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status

from gatekeeper.contracts.candidates import Candidate
from gatekeeper.contracts.datasets import Dataset
from gatekeeper.contracts.evaluation_runs import EvaluationRun
from gatekeeper.contracts.projects import Project
from gatekeeper.contracts.providers import Provider
from gatekeeper.contracts.rules import RuleBinding
from gatekeeper.contracts.run_settings import RunSettings
from gatekeeper.contracts.scenarios import Scenario


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


# Dataset existence guard scoped through its project.
def dataset_or_404(
    connection: sqlite3.Connection, project_id: UUID, dataset_id: UUID
) -> sqlite3.Row:
    row = connection.execute(
        "SELECT * FROM datasets WHERE id = ? AND project_id = ?",
        (str(dataset_id), str(project_id)),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dataset not found")
    return row


# Project row mapper.
def project_from_row(row: sqlite3.Row) -> Project:
    return Project(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
    )


# Provider row mapper.
def provider_from_row(row: sqlite3.Row) -> Provider:
    return Provider(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        provider_type=row["provider_type"],
        base_url=row["base_url"],
        credential_ref=row["credential_ref"],
        created_at=row["created_at"],
    )


# Candidate row mapper.
def candidate_from_row(row: sqlite3.Row) -> Candidate:
    return Candidate(
        id=row["id"],
        project_id=row["project_id"],
        provider_id=row["provider_id"],
        name=row["name"],
        adapter=row["adapter"],
        model_name=row["model_name"],
        system_prompt=row["system_prompt"],
        generation_parameters=json.loads(row["generation_parameters"]),
        tool_definitions=json.loads(row["tool_definitions"]),
        response_format=(json.loads(row["response_format"]) if row["response_format"] else None),
        created_at=row["created_at"],
    )


# Dataset row mapper.
def dataset_from_row(row: sqlite3.Row) -> Dataset:
    return Dataset(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
    )


# Scenario row mapper.
def scenario_from_row(row: sqlite3.Row) -> Scenario:
    return Scenario(
        id=row["id"],
        dataset_id=row["dataset_id"],
        scenario_key=row["scenario_key"],
        name=row["name"],
        scenario_type=row["scenario_type"],
        input=json.loads(row["input"]),
        created_at=row["created_at"],
    )


# Rule-binding row mapper.
def rule_binding_from_row(row: sqlite3.Row) -> RuleBinding:
    return RuleBinding(
        id=row["id"],
        dataset_id=row["dataset_id"],
        scenario_id=row["scenario_id"],
        rule_key=row["rule_key"],
        rule_type=row["rule_type"],
        role=row["role"],
        severity=row["severity"],
        parameters=json.loads(row["parameters"]),
        applies_to=json.loads(row["applies_to"]) if row["applies_to"] else None,
        created_at=row["created_at"],
    )


# Run-setting row mapper.
def run_settings_from_row(row: sqlite3.Row) -> RunSettings:
    return RunSettings(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        attempts_per_scenario=row["attempts_per_scenario"],
        timeout_ms=row["timeout_ms"],
        pass_threshold=row["pass_threshold"],
        created_at=row["created_at"],
    )


# Evaluation-run row mapper.
def evaluation_run_from_row(row: sqlite3.Row) -> EvaluationRun:
    """Map stored execution state into an evaluation-run contract.

    Args:
        row: SQLite row containing run identifiers, timestamps, and serialized errors.

    Returns:
        The evaluation run represented by the database row.
    """
    return EvaluationRun(
        id=row["id"],
        project_id=row["project_id"],
        candidate_id=row["candidate_id"],
        dataset_id=row["dataset_id"],
        run_settings_id=row["run_settings_id"],
        status=row["status"],
        created_at=row["created_at"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        queued_at=row["queued_at"],
        cancel_requested_at=row["cancel_requested_at"],
        snapshot_digest=row["snapshot_digest"],
        error=json.loads(row["error"]) if row["error"] else None,
    )
