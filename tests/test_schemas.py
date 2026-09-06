"""Published JSON Schema verification tests."""

from __future__ import annotations

import json
from pathlib import Path

from gatekeeper.contracts.candidates import Candidate, CandidateCreate
from gatekeeper.contracts.configs import Config, ConfigCreate
from gatekeeper.contracts.dataset_releases import DatasetRelease, DatasetReleaseCreate
from gatekeeper.contracts.evaluations import Evaluation, EvaluationCreate
from gatekeeper.contracts.projects import Project, ProjectCreate


# Verify checked-in schemas match their owning contracts.
def test_committed_schemas_match_contracts() -> None:
    schema_directory = Path(__file__).parents[1] / "schemas"
    for model in (
        ProjectCreate,
        Project,
        CandidateCreate,
        Candidate,
        DatasetReleaseCreate,
        DatasetRelease,
        ConfigCreate,
        Config,
        EvaluationCreate,
        Evaluation,
    ):
        expected = json.loads((schema_directory / f"{model.__name__}.json").read_text())
        assert expected == model.model_json_schema()
