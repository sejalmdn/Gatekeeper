"""Frozen evaluation creation and read contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from gatekeeper.contracts.candidates import Candidate
from gatekeeper.contracts.common import Contract
from gatekeeper.contracts.configs import Config
from gatekeeper.contracts.dataset_releases import DatasetRelease


# Evaluation creation contract.
class EvaluationCreate(Contract):
    candidate_id: UUID
    dataset_release_id: UUID
    config_id: UUID


# Evaluation read contract with immutable input snapshots.
class Evaluation(EvaluationCreate):
    id: UUID
    project_id: UUID
    candidate_digest: str
    dataset_release_digest: str
    config_digest: str
    candidate_snapshot: Candidate
    dataset_release_snapshot: DatasetRelease
    config_snapshot: Config
    created_at: datetime
