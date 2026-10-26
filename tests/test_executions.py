"""Execution boundaries, durable attempt identity, and evidence credibility tests."""

import asyncio
import json
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import httpx
import pytest

from gatekeeper.contracts.common import JsonObject
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.execution.worker import execute_run
from gatekeeper.persistence.executions import (
    cancel_run,
    claim_attempt,
    claim_run,
    queue_run,
    read_run,
    recover_interrupted,
)
from tests.conftest import ApiClient, create_project


# Build all scenario types with private rules and a candidate exposing one declared function.
def execution_fixture(client: ApiClient, provider_type: str = "openrouter") -> tuple[str, str]:
    """Create six mixed scenarios, a candidate, private rules, and a pending test run.

    Args:
        client: Isolated API client used to create the test resources.
        provider_type: Supported provider type assigned to the test candidate.

    Returns:
        The project ID and evaluation-run API URL.
    """
    project_id = str(create_project(client)["id"])
    base = f"/v1/projects/{project_id}"
    provider = client.post(
        f"{base}/providers",
        json={
            "name": "Primary",
            "provider_type": provider_type,
            "credential_ref": "env://GATEKEEPER_CREDENTIAL_TEST",
        },
    ).json()
    candidate = client.post(
        f"{base}/candidates",
        json={
            "provider_id": provider["id"],
            "name": "Baseline",
            "model_name": "example/model",
            "system_prompt": "Support the customer.",
            "generation_parameters": {"temperature": None, "max_output_tokens": 256},
            "tool_definitions": [
                {
                    "name": "lookup_order",
                    "parameters": {
                        "type": "object",
                        "required": ["order_id"],
                        "properties": {"order_id": {"type": "string"}},
                        "additionalProperties": False,
                    },
                }
            ],
        },
    ).json()
    scenarios = []

    for kind in ("single_turn", "multi_turn", "tool_use"):
        for number in range(2):
            scenario_input = {"user_message": f"Help with {kind} {number}"}

            if kind != "single_turn":
                scenario_input["history"] = [
                    {"role": "user", "content": "My order is ORD-1."},
                    {"role": "assistant", "content": "How can I help?"},
                ]

            scenarios.append(
                {
                    "scenario_key": f"{kind}-{number}",
                    "name": f"{kind} {number}",
                    "scenario_type": kind,
                    "input": scenario_input,
                }
            )

    dataset = client.post(f"{base}/datasets", json={"name": "Mixed", "scenarios": scenarios}).json()
    stored = client.get(f"{base}/datasets/{dataset['id']}/scenarios").json()
    response_scenario = next(s for s in stored if s["scenario_type"] == "single_turn")

    assert (
        client.post(
            f"{base}/datasets/{dataset['id']}/rule-bindings",
            json={
                "scenario_id": response_scenario["id"],
                "rule_key": "PRIVATE_RULE_SENTINEL",
                "rule_type": "response.required_text",
                "role": "required",
                "severity": "critical",
                "parameters": {"values": ["PRIVATE_EXPECTATION_SENTINEL"]},
            },
        ).status_code
        == 201
    )
    settings = client.post(
        f"{base}/run-settings",
        json={
            "name": "Repeated",
            "attempts_per_scenario": 3,
            "timeout_ms": 1000,
            "pass_threshold": 0.8,
        },
    ).json()
    run = client.post(
        f"{base}/evaluation-runs",
        json={
            "candidate_id": candidate["id"],
            "dataset_id": dataset["id"],
            "run_settings_id": settings["id"],
        },
    ).json()

    return project_id, f"{base}/evaluation-runs/{run['id']}"


# Model a successful completion with optional usage and requested calls.
def completion(content: str | None = "Hello", calls: list[JsonObject] | None = None) -> JsonObject:
    """Build a mock assistant completion for execution boundary tests.

    Args:
        content: Assistant response text, or None for a tool-only or absent response.
        calls: Optional provider-shaped requested tool calls.

    Returns:
        A provider response object with model identity and explicit token usage.
    """
    message = {"role": "assistant", "content": content}

    if calls is not None:
        message["tool_calls"] = calls

    return {
        "id": "provider-request",
        "model": "actual/model",
        "choices": [{"finish_reason": "tool_calls" if calls else "stop", "message": message}],
        "usage": {"prompt_tokens": 12, "completion_tokens": 0},
    }


# Execute a queued run using controlled HTTP transport without any paid provider traffic.
def execute(client: ApiClient, handler: Callable[[httpx.Request], httpx.Response]) -> None:
    """Drain one queued test run through a mocked HTTP transport.

    Args:
        client: API client whose application owns the queued run database.
        handler: Mock transport callback supplying responses or transport exceptions.

    Returns:
        None; executes the claimed run and persists its attempt outcomes.
    """
    database = client.app.state.database
    claimed = claim_run(database)

    assert claimed is not None

    # Keep the client and all attempts within the same event loop.
    async def run() -> None:
        """Keep the client and all attempts within the same event loop.

        Accepts no parameters.

        Returns:
            None; assertions verify the expected execution behavior.
        """

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport:
            await execute_run(database, transport, *claimed)

    asyncio.run(run())


# Validate the full six-scenario, three-attempt pipeline and its private-data boundary.
@pytest.mark.parametrize("provider_type", ["openrouter", "groq"])
def test_mixed_run_records_18_distinct_attempts(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, provider_type: str
) -> None:
    """Validate the full six-scenario, three-attempt pipeline and its private-data boundary.

    Args:
        client: Isolated API client and application database used by this test.
        monkeypatch: Fixture used to isolate credentials and replace outbound request boundaries.
        provider_type: Supported provider variant exercised by this test.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret-provider-key")
    project_id, url = execution_fixture(client, provider_type)
    queued = client.post(f"{url}/start").json()

    assert queued["total_attempts"] == 18
    assert queued["snapshot_digest"]
    requests = []

    # Inspect the exact serialized provider payload rather than a helper's intermediate output.
    def handler(request: httpx.Request) -> httpx.Response:
        """Inspect the exact serialized provider payload rather than a helper's intermediate output.

        Args:
            request: Mock outbound HTTP request inspected or recorded by this callback.

        Returns:
            A mocked HTTP response, or a simulated transport exception.
        """
        body = json.loads(request.content)

        requests.append(body)
        assert request.headers["authorization"] == "Bearer secret-provider-key"
        serialized = request.content.decode()

        for private in (
            "PRIVATE_",
            "severity",
            "pass_threshold",
            "critical",
            "secret-provider-key",
        ):
            assert private not in serialized

        assert "temperature" not in body
        limit_key = "max_tokens" if provider_type == "openrouter" else "max_completion_tokens"

        assert body[limit_key] == 256
        assert body["tools"][0]["function"]["name"] == "lookup_order"
        assert body["tool_choice"] == "auto"

        if provider_type == "openrouter":
            assert body["provider"] == {"require_parameters": True, "allow_fallbacks": False}

        return httpx.Response(200, json=completion())

    execute(client, handler)
    run = client.get(url).json()

    assert run["status"] == "completed"
    assert run["finished_attempts"] == run["total_attempts"] == 18
    attempts = client.get(f"{url}/attempts").json()

    assert len({attempt["id"] for attempt in attempts}) == 18
    assert all(attempt["status"] == "completed" for attempt in attempts)

    for attempt, request in zip(attempts, requests, strict=True):
        messages = request["messages"]

        assert messages[0] == {"role": "system", "content": "Support the customer."}
        assert messages[-1]["role"] == "user"

        if attempt["scenario_type"] == "single_turn":
            assert len(messages) == 2
        else:
            assert [message["role"] for message in messages] == [
                "system",
                "user",
                "assistant",
                "user",
            ]

        detail = client.get(f"{url}/attempts/{attempt['id']}").json()

        assert detail["evidence"]["input_tokens"] == 12
        assert detail["evidence"]["output_tokens"] == 0
        assert detail["evidence"]["returned_model"] == "actual/model"
        assert detail["evidence"]["source"] == "direct_provider_response"
        assert detail["evidence"]["duration_ms"] >= 0
        assert "secret-provider-key" not in json.dumps(detail)

    other = str(create_project(client, "Other")["id"])
    other_url = url.replace(project_id, other)

    assert client.get(other_url).status_code == 404
    assert client.post(f"{other_url}/start").status_code == 404
    assert client.post(f"{other_url}/cancel").status_code == 404
    assert client.get(f"{other_url}/attempts").status_code == 404
    assert client.get(f"{other_url}/attempts/{attempts[0]['id']}").status_code == 404
    assert client.get(f"{url}/attempts/{uuid4()}").status_code == 404
    assert client.post(f"{url}/start").json()["status"] == "completed"
    assert client.post(f"{url}/cancel").json()["status"] == "completed"


# Concurrent starts must share one snapshot and exactly one set of attempt identities.
def test_start_is_atomic_and_freezes_rules(client: ApiClient) -> None:
    """Concurrent starts must share one snapshot and exactly one set of attempt identities.

    Args:
        client: Isolated API client and application database used by this test.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    project_id, url = execution_fixture(client)
    database = client.app.state.database
    run_id = UUID(url.rsplit("/", 1)[1])

    with ThreadPoolExecutor(max_workers=2) as pool:
        runs = list(pool.map(lambda _: queue_run(database, UUID(project_id), run_id), range(2)))

    assert runs[0].snapshot_digest == runs[1].snapshot_digest
    before = client.get(f"{url}/attempts").json()

    with database.connection() as connection:
        snapshot = connection.execute("SELECT * FROM execution_snapshots").fetchone()
        frozen = ExecutionSnapshot.model_validate_json(snapshot["configuration"])

        assert any(frozen.effective_rules.values())
        connection.execute("UPDATE rule_bindings SET parameters = ?", ('{"values":["changed"]}',))

    assert client.post(f"{url}/start").json()["snapshot_digest"] == runs[0].snapshot_digest
    assert client.get(f"{url}/attempts").json() == before

    with database.connection() as connection:
        assert (
            connection.execute("SELECT configuration FROM execution_snapshots").fetchone()[0]
            == (snapshot["configuration"])
        )


# Preflight failures must leave old pending runs unchanged and allocate nothing.
@pytest.mark.parametrize("change", ["provider", "adapter", "parameters", "top_k", "schema", "url"])
def test_invalid_configuration_is_not_queued(client: ApiClient, change: str) -> None:
    """Preflight failures must leave old pending runs unchanged and allocate nothing.

    Args:
        client: Isolated API client and application database used by this test.
        change: Invalid configuration variant that must fail preflight.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    _, url = execution_fixture(client, "groq")

    with client.app.state.database.connection() as connection:
        if change == "provider":
            connection.execute("UPDATE providers SET provider_type = 'anthropic'")
        elif change == "adapter":
            connection.execute("UPDATE candidates SET adapter = 'legacy'")
        elif change == "parameters":
            connection.execute("UPDATE candidates SET generation_parameters = '{\"legacy\":1}'")
        elif change == "top_k":
            connection.execute("UPDATE candidates SET generation_parameters = '{\"top_k\":1}'")
        elif change == "schema":
            tools = [{"name": "lookup", "parameters": {"$ref": "https://example.com/schema"}}]

            connection.execute("UPDATE candidates SET tool_definitions = ?", (json.dumps(tools),))
        else:
            connection.execute(
                "UPDATE providers SET base_url = 'https://user:password@example.com'"
            )

    assert client.post(f"{url}/start").status_code == 422
    assert client.get(url).json()["queued_at"] is None
    assert client.get(f"{url}/attempts").json() == []


# Ordinary failures consume exactly one attempt each and cannot trigger hidden retries.
@pytest.mark.parametrize("failure", ["rate_limit", "timeout", "transport", "malformed"])
def test_request_failures_preserve_each_attempt(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    """Ordinary failures consume exactly one attempt each and cannot trigger hidden retries.

    Args:
        client: Isolated API client and application database used by this test.
        monkeypatch: Fixture used to isolate credentials and replace outbound request boundaries.
        failure: Request failure variant whose attempt accounting is checked.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url = execution_fixture(client)

    client.post(f"{url}/start")
    calls = []

    # Fail every request to make automatic retry or denominator changes observable.
    def handler(request: httpx.Request) -> httpx.Response:
        """Fail every request to make automatic retry or denominator changes observable.

        Args:
            request: Mock outbound HTTP request inspected or recorded by this callback.

        Returns:
            A mocked HTTP response, or a simulated transport exception.
        """
        calls.append(request)

        if failure == "timeout":
            raise httpx.ReadTimeout("sensitive provider text")

        if failure == "transport":
            raise httpx.ConnectError("sensitive provider text")

        if failure == "rate_limit":
            return httpx.Response(429, json={"error": {"message": "secret"}})

        return httpx.Response(200, text="not JSON")

    execute(client, handler)
    assert len(calls) == 18
    attempts = client.get(f"{url}/attempts").json()
    expected = "timed_out" if failure == "timeout" else "failed"

    assert all(attempt["status"] == expected for attempt in attempts)
    assert client.get(url).json()["status"] == "completed"
    detail = client.get(f"{url}/attempts/{attempts[0]['id']}").json()

    assert detail["evidence"]["input_tokens"] is None
    assert detail["evidence"]["output_tokens"] is None
    assert "sensitive provider text" not in json.dumps(detail)
    assert "secret" not in json.dumps(detail)


# Fatal credentials and authentication problems stop duplicate doomed requests.
@pytest.mark.parametrize("missing_credential", [True, False])
def test_fatal_provider_configuration_skips_remaining_attempts(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, missing_credential: bool
) -> None:
    """Fatal credentials and authentication problems stop duplicate doomed requests.

    Args:
        client: Isolated API client and application database used by this test.
        monkeypatch: Fixture used to isolate credentials and replace outbound request boundaries.
        missing_credential: Whether to omit the credential or return an authentication error.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    monkeypatch.delenv("GATEKEEPER_CREDENTIAL_TEST", raising=False)

    if not missing_credential:
        monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")

    _, url = execution_fixture(client)

    client.post(f"{url}/start")
    calls = []

    # Authentication failures are infrastructure evidence rather than candidate rule failures.
    def handler(request: httpx.Request) -> httpx.Response:
        """Authentication failures are infrastructure evidence rather than candidate rule failures.

        Args:
            request: Mock outbound HTTP request inspected or recorded by this callback.

        Returns:
            A mocked HTTP response, or a simulated transport exception.
        """
        calls.append(request)
        return httpx.Response(401, json={"error": "secret"})

    execute(client, handler)
    assert len(calls) == (0 if missing_credential else 1)
    run = client.get(url).json()

    assert run["status"] == "failed"
    attempts = client.get(f"{url}/attempts").json()

    assert attempts[0]["status"] == "failed"
    assert all(attempt["status"] == "skipped" for attempt in attempts[1:])


# Preserve tool errors, truncation, refusals, and missing usage without inventing outputs.
def test_incomplete_response_and_tool_arguments_remain_inspectable(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Preserve tool errors, truncation, refusals, and missing usage without inventing outputs.

    Args:
        client: Isolated API client and application database used by this test.
        monkeypatch: Fixture used to isolate credentials and replace outbound request boundaries.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret-provider-key")
    _, url = execution_fixture(client)

    client.post(f"{url}/start")
    raw = completion(
        None,
        [
            {
                "id": "a",
                "type": "function",
                "function": {
                    "name": "lookup_order",
                    "arguments": '{"order_id":"ORD-1"}',
                },
            },
            {
                "id": "b",
                "type": "function",
                "function": {
                    "name": "lookup_order",
                    "arguments": "{broken",
                },
            },
            {
                "id": "c",
                "type": "function",
                "function": {
                    "name": "unknown",
                    "arguments": "{}",
                },
            },
            {
                "id": "d",
                "type": "function",
                "function": {
                    "name": "lookup_order",
                    "arguments": '{"order_id":5}',
                },
            },
        ],
    )

    raw.pop("usage")
    raw["choices"][0]["finish_reason"] = "length"
    raw["choices"][0]["message"]["refusal"] = "secret-provider-key redacted"

    execute(client, lambda _: httpx.Response(200, json=raw))
    first = client.get(f"{url}/attempts").json()[0]
    detail = client.get(f"{url}/attempts/{first['id']}").json()
    evidence = detail["evidence"]

    assert evidence["response_text"] is None
    assert evidence["input_tokens"] is None
    assert evidence["refusal"] == "[REDACTED] redacted"
    assert "usage_unavailable" in evidence["completeness_issues"]
    assert "output_truncated" in evidence["completeness_issues"]
    assert "credential_redacted" in evidence["completeness_issues"]
    tools = evidence["tool_requests"]

    assert tools[0]["arguments"] == {"order_id": "ORD-1"}
    assert tools[1]["arguments_text"] == "{broken"
    assert tools[1]["issues"] == ["invalid_argument_json"]
    assert tools[2]["issues"] == ["undeclared_tool"]
    assert tools[3]["issues"] == ["arguments_schema_mismatch"]
    assert "secret-provider-key" not in json.dumps(detail)


# Queued cancellation and cancellation during a request retain stable attempt history.
@pytest.mark.parametrize("during_request", [False, True])
def test_cancel_never_invokes_remaining_attempts(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, during_request: bool
) -> None:
    """Queued cancellation and cancellation during a request retain stable attempt history.

    Args:
        client: Isolated API client and application database used by this test.
        monkeypatch: Fixture used to isolate credentials and replace outbound request boundaries.
        during_request: Whether cancellation occurs during a request instead of before execution.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    project_id, url = execution_fixture(client)

    client.post(f"{url}/start")
    database = client.app.state.database
    run_id = UUID(url.rsplit("/", 1)[1])

    if during_request:
        # Simulate cancellation while the remote server is preparing its active response.
        def handler(_: httpx.Request) -> httpx.Response:
            """Simulate cancellation while the remote server is preparing its active response.

            Args:
                _: Unused outbound HTTP request supplied by the mock transport.

            Returns:
                A mocked HTTP response, or a simulated transport exception.
            """
            cancel_run(database, UUID(project_id), run_id)
            return httpx.Response(200, json=completion())

        execute(client, handler)
    else:
        assert client.post(f"{url}/cancel").json()["status"] == "cancelled"
        assert claim_run(database) is None

    attempts = client.get(f"{url}/attempts").json()

    assert client.get(url).json()["status"] == "cancelled"
    assert sum(attempt["status"] == "completed" for attempt in attempts) == int(during_request)
    assert sum(attempt["status"] == "skipped" for attempt in attempts) == 18 - int(during_request)
    assert client.post(f"{url}/cancel").json()["status"] == "cancelled"
    assert client.post(f"{url}/start").json()["status"] == "cancelled"


# Restart recovery preserves uncertain attempt identity and leaves queued runs claimable.
def test_restart_does_not_resend_uncertain_requests(client: ApiClient) -> None:
    """Restart recovery preserves uncertain attempt identity and leaves queued runs claimable.

    Args:
        client: Isolated API client and application database used by this test.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    project_id, url = execution_fixture(client)

    client.post(f"{url}/start")
    database = client.app.state.database
    claimed = claim_run(database)

    assert claimed is not None
    current = claim_attempt(database, claimed[0])

    assert current is not None
    recover_interrupted(database)
    recover_interrupted(database)
    attempts = client.get(f"{url}/attempts").json()

    assert attempts[0]["id"] == str(current.id)
    assert attempts[0]["error"]["code"] == "process_interrupted"
    assert attempts[0]["status"] == "failed"
    assert all(attempt["status"] == "skipped" for attempt in attempts[1:])
    assert client.get(url).json()["status"] == "failed"
    assert claim_run(database) is None

    with database.connection() as connection:
        assert read_run(connection, UUID(project_id), UUID(claimed[0])).finished_attempts == 18


# Verify that the application lifespan drains queued work and stops its worker cleanly.
def test_lifespan_runs_worker(client: ApiClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify that the application lifespan drains queued work and stops its worker cleanly.

    Args:
        client: Isolated API client and application database used by this test.
        monkeypatch: Fixture used to isolate credentials and replace outbound request boundaries.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url = execution_fixture(client)

    client.post(f"{url}/start")
    calls = []

    # Replace the outbound boundary only, leaving the actual lifespan and queue worker intact.
    async def send(*args: object) -> httpx.Response:
        """Replace the outbound boundary only, leaving the actual lifespan and queue worker intact.

        Args:
            args: Invocation arguments recorded or ignored by the replacement request function.

        Returns:
            A mocked successful HTTP response after the test synchronization point.
        """
        calls.append(args)
        return httpx.Response(200, json=completion())

    monkeypatch.setattr("gatekeeper.execution.worker.send_request", send)

    # Enter the lifespan explicitly and wait for persisted run completion.
    async def run() -> None:
        """Enter the lifespan explicitly and wait for persisted run completion.

        Accepts no parameters.

        Returns:
            None; assertions verify the expected execution behavior.
        """

        async with client.app.router.lifespan_context(client.app):
            for _ in range(200):
                with client.app.state.database.connection() as connection:
                    status = connection.execute("SELECT status FROM evaluation_runs").fetchone()[0]

                if status == "completed":
                    break

                await asyncio.sleep(0.01)

            assert status == "completed"

    asyncio.run(run())
    assert len(calls) == 18


# The configured deadline covers the entire awaited request, not only socket-level timeouts.
def test_whole_request_deadline(client: ApiClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """The configured deadline covers the entire awaited request, not only socket-level timeouts.

    Args:
        client: Isolated API client and application database used by this test.
        monkeypatch: Fixture used to isolate credentials and replace outbound request boundaries.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url = execution_fixture(client)

    with client.app.state.database.connection() as connection:
        connection.execute("UPDATE run_settings SET timeout_ms = 5")

    client.post(f"{url}/start")
    claimed = claim_run(client.app.state.database)

    assert claimed is not None
    calls = []

    # Keep each mocked server response pending beyond the attempt's configured deadline.
    async def handler(request: httpx.Request) -> httpx.Response:
        """Keep each mocked server response pending beyond the attempt's configured deadline.

        Args:
            request: Mock outbound HTTP request inspected or recorded by this callback.

        Returns:
            A mocked HTTP response, or a simulated transport exception.
        """
        calls.append(request)
        await asyncio.sleep(1)
        return httpx.Response(200, json=completion())

    # Exercise the actual asyncio deadline independently from mocked HTTP timeout exceptions.
    async def run() -> None:
        """Exercise the actual asyncio deadline independently from mocked HTTP timeout exceptions.

        Accepts no parameters.

        Returns:
            None; assertions verify the expected execution behavior.
        """

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport:
            await execute_run(client.app.state.database, transport, *claimed)

    asyncio.run(run())
    assert len(calls) == 18
    attempts = client.get(f"{url}/attempts").json()

    assert all(attempt["status"] == "timed_out" for attempt in attempts)
    detail = client.get(f"{url}/attempts/{attempts[0]['id']}").json()

    assert detail["evidence"]["source"] == "backend_observation"
    assert detail["evidence"]["duration_ms"] >= 5


# Shutdown cannot replay a request whose remote outcome is uncertain.
def test_shutdown_marks_active_request_uncertain(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Shutdown cannot replay a request whose remote outcome is uncertain.

    Args:
        client: Isolated API client and application database used by this test.
        monkeypatch: Fixture used to isolate credentials and replace outbound request boundaries.

    Returns:
        None; assertions verify the expected execution behavior.
    """
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url = execution_fixture(client)

    client.post(f"{url}/start")

    # Coordinate shutdown only after the worker has actually entered its outbound boundary.
    async def run() -> None:
        """Coordinate shutdown only after the worker has actually entered its outbound boundary.

        Accepts no parameters.

        Returns:
            None; assertions verify the expected execution behavior.
        """
        started = asyncio.Event()

        # Simulate an in-flight provider response that has not yet reached the backend.
        async def send(*args: object) -> httpx.Response:
            """Simulate an in-flight provider response that has not yet reached the backend.

            Args:
                args: Invocation arguments recorded or ignored by the replacement request function.

            Returns:
                A mocked successful HTTP response after the test synchronization point.
            """
            started.set()
            await asyncio.sleep(30)
            return httpx.Response(200, json=completion())

        monkeypatch.setattr("gatekeeper.execution.worker.send_request", send)

        async with client.app.router.lifespan_context(client.app):
            await asyncio.wait_for(started.wait(), timeout=2)

    asyncio.run(run())
    assert client.get(url).json()["status"] == "failed"
    attempts = client.get(f"{url}/attempts").json()

    assert attempts[0]["error"]["code"] == "process_interrupted"
    assert all(attempt["status"] == "skipped" for attempt in attempts[1:])
    assert claim_run(client.app.state.database) is None
