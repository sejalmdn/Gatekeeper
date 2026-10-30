"""Cost arithmetic, deployment validation, frozen execution, and reporting boundaries."""

import json
import sqlite3
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.contracts.pricing import ExecutionCost, PricingCatalog, PricingEntry
from gatekeeper.contracts.reporting import OperationalMetrics, ReportingAttempt
from gatekeeper.evaluation.engine import evaluate_attempt, evaluate_rule
from gatekeeper.persistence.database import Database
from gatekeeper.pricing import calculate_cost, load_catalog
from gatekeeper.reporting.aggregation import metrics
from tests.conftest import ApiClient
from tests.test_evaluations import binding, evidence
from tests.test_executions import completion, execute, execution_fixture

# Exact destination keys cannot accidentally price compatible third-party endpoints.
DESTINATION = "https://openrouter.ai/api/v1/chat/completions"


# Legacy costs migrate losslessly, while absent costs remain unknown across restarts.
@pytest.mark.parametrize("has_cost_column", [True, False])
def test_cost_storage_migration(tmp_path: Path, has_cost_column: bool) -> None:
    """Initialize a legacy database at tmp_path; verify saved costs and idempotent migration."""
    path = tmp_path / "legacy.db"
    saved = ExecutionCost(estimated_usd="0.000000123", reason=None).model_dump(mode="json")
    manual = ExecutionCost(estimated_usd="0", reason=None).model_dump(mode="json")
    legacy_saved = json.dumps({**saved, "calculation_version": "standard-token-usd-v1"})
    legacy_manual = json.dumps(
        {**manual, "calculation_version": "manual-zero-v1", "reason": "manual_default"}
    )
    unavailable = ExecutionCost(reason="usage_unavailable").model_dump(mode="json")

    with sqlite3.connect(path) as connection:
        connection.execute(
            "CREATE TABLE execution_evidence "
            "(execution_id TEXT PRIMARY KEY, normalized TEXT, request TEXT, response TEXT)"
        )
        connection.executemany(
            "INSERT INTO execution_evidence (execution_id, normalized) VALUES (?, '{}')",
            [("saved",), ("missing",), ("unavailable",)],
        )
        connection.execute(
            "CREATE TABLE execution_costs (execution_id TEXT PRIMARY KEY, record TEXT)"
        )
        connection.execute("INSERT INTO execution_costs VALUES ('saved', ?)", (legacy_saved,))
        connection.execute(
            "INSERT INTO execution_costs VALUES ('unavailable', ?)", (json.dumps(unavailable),)
        )

        if has_cost_column:
            connection.execute("ALTER TABLE execution_evidence ADD COLUMN cost TEXT")
            connection.execute(
                "UPDATE execution_evidence SET cost = ? WHERE execution_id = 'saved'",
                (legacy_manual,),
            )

    for _ in range(2):
        database = Database(path)

        with database.connection() as connection:
            rows = connection.execute(
                "SELECT execution_id, cost FROM execution_evidence"
            ).fetchall()

            assert {
                row["execution_id"]: json.loads(row["cost"]) if row["cost"] else None
                for row in rows
            } == {
                "saved": manual if has_cost_column else saved,
                "missing": None,
                "unavailable": unavailable,
            }
            assert (
                connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE name = 'execution_costs'"
                ).fetchone()
                is None
            )


# Supply reviewed fractional tariffs and an explicit returned-model alias.
def catalog(**changes: object) -> PricingCatalog:
    """Build a test catalog with entry changes; return a validated deployment catalog."""
    entry = {
        "provider": "openrouter",
        "api_destination": DESTINATION,
        "model": "example/model",
        "aliases": ["actual/model"],
        "input_usd_per_million": "0.125",
        "output_usd_per_million": "0.375",
        "source_url": "https://example.com/pricing",
        "verified_on": "2026-10-30",
        "catalog_version": "test-v1",
    }
    entry.update(changes)

    return PricingCatalog(entries=[PricingEntry.model_validate(entry)])


# Decimal checks preserve exact equality and exclude reported charges from grading.
def test_fractional_cost_and_threshold() -> None:
    """Price fractional usage and test equal/lower thresholds; return None."""
    observed = evidence(
        provider_type="openrouter",
        requested_model="example/model",
        returned_model="actual/model",
        input_tokens=3,
        output_tokens=7,
        provider_reported_usd="99",
    )
    cost = calculate_cost(observed, catalog(), DESTINATION)

    assert cost.input_usd == Decimal("0.000000375")
    assert cost.output_usd == Decimal("0.000002625")
    assert cost.estimated_usd == Decimal("0.000003")
    assert json.loads(cost.model_dump_json())["estimated_usd"] == "0.000003000"
    assert (
        evaluate_rule(binding("metric.cost", {"max_usd": 0.000003}), observed, cost).outcome
        == "pass"
    )
    assert (
        evaluate_rule(binding("metric.cost", {"max_usd": 0.000002}), observed, cost).outcome
        == "fail"
    )

    for role in ("scored", "informational"):
        result = evaluate_attempt(
            observed, [binding("metric.cost", {"max_usd": 0.000002}, role)], [], cost
        )

        assert result.verdict == "not_evaluated"
        assert result.rule_results[0].outcome == "fail"


# Observed zero remains a known estimate, including explicitly free rates.
@pytest.mark.parametrize(("tokens", "rate"), [(0, "1"), (5, "0")])
def test_zero_cost(tokens: int, rate: str) -> None:
    """Price observed tokens at rate; assert known zero instead of unavailable."""
    observed = evidence(
        provider_type="openrouter",
        requested_model="example/model",
        returned_model="example/model",
        input_tokens=tokens,
        output_tokens=tokens,
    )
    cost = calculate_cost(
        observed, catalog(input_usd_per_million=rate, output_usd_per_million=rate), DESTINATION
    )

    assert cost.estimated_usd == 0
    assert cost.reason is None


# Omitted usage and unmatched identities never become fabricated zero observations.
@pytest.mark.parametrize(
    ("changes", "reason"),
    [
        ({"input_tokens": None}, "usage_unavailable"),
        ({"output_tokens": None}, "usage_unavailable"),
        ({"returned_model": None}, "model_identity_unavailable"),
        ({"returned_model": "example/model:free"}, "pricing_unavailable"),
        ({"requested_model": "other"}, "pricing_unavailable"),
        ({"status": "failed"}, "invocation_unsuccessful"),
        ({"status": "timed_out"}, "invocation_unsuccessful"),
    ],
)
def test_unavailable_cost(changes: dict[str, object], reason: str) -> None:
    """Price evidence changes and verify the specific unavailable reason."""
    data = {
        "provider_type": "openrouter",
        "requested_model": "example/model",
        "returned_model": "example/model",
    }
    data.update(changes)
    observed = evidence(**data)
    cost = calculate_cost(observed, catalog(), DESTINATION)

    assert cost.estimated_usd is None
    assert cost.reason == reason
    assert evaluate_rule(binding("metric.cost", {"max_usd": 1}), observed, cost).reason == reason
    assert (
        calculate_cost(observed, catalog(), "https://other.test/chat/completions").estimated_usd
        is None
    )


# Deployment catalogs reject invalid tariffs and ambiguous alias or model keys.
@pytest.mark.parametrize("rate", ["-1", "NaN", "Infinity", "-Infinity"])
def test_invalid_rates(rate: str) -> None:
    """Validate invalid rate and assert configuration rejection."""
    with pytest.raises(ValidationError):
        catalog(input_usd_per_million=rate)


# Ambiguity is rejected before a run starts rather than resolved by entry order.
def test_ambiguous_catalog() -> None:
    """Validate overlapping exact and alias identities; assert rejection."""
    entry = catalog().entries[0]

    with pytest.raises(ValidationError, match="ambiguous"):
        PricingCatalog(entries=[entry, entry.model_copy(update={"model": "actual/model"})])


# Completed invocation coverage includes unknown costs while failed calls stay excluded.
def test_mixed_aggregation_and_historical_fields() -> None:
    """Aggregate known, unknown, zero, and failed costs; verify backward compatibility."""
    observed = [
        ReportingAttempt(scenario_id=uuid4(), attempt_number=index + 1, status=status, cost=cost)
        for index, (status, cost) in enumerate(
            [
                ("completed", ExecutionCost(estimated_usd="0.000001")),
                ("completed", None),
                ("completed", ExecutionCost(estimated_usd="0")),
                ("failed", ExecutionCost(estimated_usd="500")),
                ("timed_out", None),
            ]
        )
    ]
    result = metrics(observed, 5)
    stats = result.estimated_cost_usd

    assert stats.observed_count == 2
    assert stats.missing_count == 1
    assert stats.sum == Decimal("0.000001")
    assert stats.mean == Decimal("0.0000005")
    assert result.excluded_unsuccessful_attempts == 2
    historical = result.model_dump(mode="json", exclude={"estimated_cost_usd"})

    assert OperationalMetrics.model_validate(historical).estimated_cost_usd is None


# A repeated run reproduces its check verdict and reports from saved decimal breakdowns.
@pytest.mark.parametrize("bind_cost", [True, False])
def test_frozen_run_costs(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, bind_cost: bool
) -> None:
    """Execute with frozen prices, alter deployment configuration, and verify saved API reports."""
    path = tmp_path / "prices.json"
    path.write_text(catalog().model_dump_json())
    monkeypatch.setenv("GATEKEEPER_PRICING_CATALOG", str(path))
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    project, url = execution_fixture(client)
    run = client.get(url).json()
    rule_url = f"/v1/projects/{project}/datasets/{run['dataset_id']}/rule-bindings"
    response = client.post(
        rule_url,
        json={
            "rule_key": "cost",
            "rule_type": "metric.cost",
            "role": "required",
            "severity": "high",
            "parameters": {"max_usd": 0.0000015},
            "applies_to": ["single_turn", "multi_turn", "tool_use"],
        },
    )

    assert response.status_code == 201
    if not bind_cost:
        with client.app.state.database.connection() as connection:
            connection.execute("DELETE FROM rule_bindings WHERE rule_key = 'cost'")

    assert client.post(f"{url}/start").status_code == 200
    path.write_text(
        catalog(input_usd_per_million="999", catalog_version="test-v2").model_dump_json()
    )

    # Ensure private pricing and expectations are absent from every invocation.
    def handler(request: httpx.Request) -> httpx.Response:
        """Inspect request privacy and return a completion with a separate provider charge."""
        assert "catalog" not in request.content.decode()
        assert "max_usd" not in request.content.decode()
        body = completion()
        body["usage"]["cost"] = 99

        return httpx.Response(200, json=body)

    execute(client, handler)
    attempts = client.get(f"{url}/attempts").json()
    saved = []

    for attempt in attempts:
        detail = client.get(f"{url}/attempts/{attempt['id']}").json()
        cost = detail["cost"]
        saved.append(Decimal(cost["estimated_usd"]))
        grade = client.get(f"{url}/attempts/{attempt['id']}/evaluation").json()
        checks = [result for result in grade["rule_results"] if result["rule_key"] == "cost"]

        assert len(checks) == int(bind_cost)
        assert all(check["outcome"] == "pass" for check in checks)

        assert Decimal(cost["input_usd"]) + Decimal(cost["output_usd"]) == saved[-1]
        assert saved[-1] == Decimal("0.0000015")
        assert cost["pricing_entry"]["catalog_version"] == "test-v1"
        assert detail["evidence"]["provider_reported_usd"] == "99"

    summary = client.get(f"{url}/summary").json()
    stats = summary["aggregates"]["metrics"]["estimated_cost_usd"]

    assert stats["observed_count"] == 18
    assert stats["missing_count"] == 0
    assert Decimal(stats["sum"]) == sum(saved)
    assert stats["pricing_entries"][0]["catalog_version"] == "test-v1"
    path.write_text("invalid deployment configuration")

    assert client.get(f"{url}/summary").json() == summary
    with client.app.state.database.connection() as connection:
        frozen = ExecutionSnapshot.model_validate_json(
            connection.execute("SELECT configuration FROM execution_snapshots").fetchone()[0]
        )

    historical = frozen.model_dump(mode="json", exclude={"pricing_catalog"})
    assert ExecutionSnapshot.model_validate(historical).pricing_catalog is None


# Packaged defaults remain installable and validated without fetching external data.
def test_packaged_catalog() -> None:
    """Read reviewed defaults for both executable integrations; assert exact provider scoping."""
    for provider in ("openrouter", "groq"):
        assert all(entry.provider == provider for entry in load_catalog(provider).entries)
        assert load_catalog(provider).entries


# Precision extends beyond binary floating point for thresholds and tariff calculations.
def test_precise_decimal_threshold() -> None:
    """Check decimal string thresholds against a tariff beyond float precision."""
    observed = evidence(
        provider_type="openrouter",
        requested_model="example/model",
        returned_model="example/model",
        input_tokens=1,
        output_tokens=0,
    )
    cost = calculate_cost(
        observed, catalog(input_usd_per_million="1.000000000000000000001"), DESTINATION
    )
    rule = binding("metric.cost", {"max_usd": "0.000001000000000000000000001"})

    assert evaluate_rule(rule, observed, cost).outcome == "pass"
    assert (
        evaluate_rule(binding("metric.cost", {"max_usd": "0.000001"}), observed, cost).outcome
        == "fail"
    )


# The deployed OpenRouter candidate has a reviewed free tariff for its exact model identity.
def test_packaged_nemotron_free_pricing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Price the configured Nemotron free model; reject unreviewed paid or suffixed variants."""
    monkeypatch.delenv("GATEKEEPER_PRICING_CATALOG", raising=False)
    model = "nvidia/nemotron-3.5-lightning:free"
    observed = evidence(
        provider_type="openrouter",
        requested_model=model,
        returned_model=model,
        input_tokens=1342,
        output_tokens=291,
    )
    prices = load_catalog("openrouter")
    cost = calculate_cost(observed, prices, DESTINATION)

    assert cost.reason is None
    assert cost.estimated_usd == Decimal("0")
    assert cost.input_usd == cost.output_usd == Decimal("0")
    assert cost.pricing_entry.model == model
    assert cost.pricing_entry.catalog_version == "2026-10-30.2"
    assert (
        evaluate_rule(binding("metric.cost", {"max_usd": "0.01"}), observed, cost).outcome == "pass"
    )

    for identity in ("nvidia/nemotron-3.5-lightning", f"{model}:unknown"):
        unmatched = observed.model_copy(
            update={"requested_model": identity, "returned_model": identity}
        )

        assert calculate_cost(unmatched, prices, DESTINATION).reason == "pricing_unavailable"

    missing_usage = observed.model_copy(update={"input_tokens": None})

    assert calculate_cost(missing_usage, prices, DESTINATION).reason == "usage_unavailable"
