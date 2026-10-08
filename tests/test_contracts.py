"""Contract and canonical JSON validation tests."""

from __future__ import annotations

import hashlib

import pytest
from pydantic import ValidationError

from gatekeeper.contracts.candidates import CandidateCreate
from gatekeeper.contracts.configs import ConfigCreate
from gatekeeper.contracts.dataset_releases import DatasetReleaseCreate
from gatekeeper.contracts.evaluations import EvaluationCreate
from gatekeeper.contracts.projects import Project, ProjectCreate
from gatekeeper.utils.json import canonical_json, digest


# Validate contract serialization and strict input behavior.
def test_contracts_serialize_and_reject_invalid_values() -> None:
    project = ProjectCreate(name="Payments")
    assert (
        Project.model_validate(
            {
                "id": "b0d5740a-1f0b-4bc0-82a7-b1cfab9bdbbc",
                "name": project.name,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ).model_dump(mode="json")["name"]
        == "Payments"
    )
    assert CandidateCreate(
        application_version="1", runtime_configuration={"model": "x"}
    ).model_dump()
    assert DatasetReleaseCreate(
        dataset_name="smoke", version="1", scenarios=[{"scenario_id": "one", "input": {}}]
    ).model_dump()
    assert ConfigCreate(
        name="standard",
        version="v1",
        settings={"rules": {"schema": "v1"}},
        thresholds={"pass": 0.8},
        weights={"critical": 10},
        default_attempts=3,
    ).model_dump()
    assert EvaluationCreate(
        candidate_id="b0d5740a-1f0b-4bc0-82a7-b1cfab9bdbbc",
        dataset_release_id="b0d5740a-1f0b-4bc0-82a7-b1cfab9bdbbc",
        config_id="b0d5740a-1f0b-4bc0-82a7-b1cfab9bdbbc",
    ).model_dump()
    with pytest.raises(ValidationError):
        CandidateCreate(application_version=" ", runtime_configuration={})
    with pytest.raises(ValidationError):
        CandidateCreate(application_version="1", runtime_configuration={"bad": float("nan")})
    with pytest.raises(ValidationError):
        DatasetReleaseCreate(
            dataset_name="smoke",
            version="1",
            scenarios=[
                {"scenario_id": "one", "input": {}},
                {"scenario_id": "one", "input": {}},
            ],
        )
    with pytest.raises(ValidationError):
        ProjectCreate.model_validate({"name": "x", "extra": True})
    valid_config = {
        "name": "x",
        "version": "v1",
        "settings": {},
        "thresholds": {"pass": 1},
        "weights": {"low": 1},
        "default_attempts": 1,
    }
    for invalid in (
        {key: value for key, value in valid_config.items() if key != "version"},
        valid_config | {"name": " "},
        valid_config | {"settings": {"bad": float("nan")}},
        valid_config | {"thresholds": {}},
        valid_config | {"thresholds": {"pass": float("inf")}},
        valid_config | {"weights": {}},
        valid_config | {"weights": {"low": 0}},
        valid_config | {"default_attempts": 0},
    ):
        with pytest.raises(ValidationError):
            ConfigCreate.model_validate(invalid)
    for invalid_version in ("", " "):
        with pytest.raises(ValidationError):
            ConfigCreate.model_validate(valid_config | {"version": invalid_version})


# Validate canonical JSON encoding and digest stability.
def test_canonical_json_and_digest_are_stable() -> None:
    first = {"model": {"name": "x", "temperature": 0}}
    second = {"model": {"temperature": 0, "name": "x"}}
    assert canonical_json(first) == '{"model":{"name":"x","temperature":0}}'
    assert digest(first) == digest(second)
    assert digest(first) == hashlib.sha256(canonical_json(first).encode()).hexdigest()
