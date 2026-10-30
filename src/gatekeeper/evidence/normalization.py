"""Normalize supported observations without inferring grading or tool execution."""

import json
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import cast
from uuid import UUID

from jsonschema.validators import validator_for
from pydantic import JsonValue
from referencing import Registry
from referencing.exceptions import Unresolvable

from gatekeeper.contracts.candidates import Candidate
from gatekeeper.contracts.common import JsonObject
from gatekeeper.contracts.executions import ExecutionError, ExecutionEvidence, ToolRequest
from gatekeeper.integrations.chat import InvocationFailure
from gatekeeper.utils.json import canonical_json


# Require standards-compliant JSON rather than accepting non-finite provider values.
def parse_json(text: str) -> object:
    """Decode JSON and reject non-finite values through canonical serialization.

    Args:
        text: Provider text expected to contain standards-compliant JSON.

    Returns:
        The decoded value; invalid JSON or non-finite values raise ValueError.
    """
    value: object = json.loads(text)

    canonical_json(value)
    return value


# Redact string values and keys without changing JSON syntax or unrelated scalar types.
def redact_value(value: JsonValue, credential: str) -> JsonValue:
    """Recursively replace a credential in JSON strings and object keys.

    Args:
        value: JSON value to redact while preserving unrelated scalar types.
        credential: Nonempty resolved secret to replace with the redaction marker.

    Returns:
        A redacted JSON value without modifying the input containers.
    """

    if isinstance(value, str):
        return value.replace(credential, "[REDACTED]")

    if isinstance(value, list):
        return [redact_value(item, credential) for item in value]

    if isinstance(value, dict):
        return {
            key.replace(credential, "[REDACTED]"): redact_value(item, credential)
            for key, item in value.items()
        }

    return value


# Remove the resolved credential from artifacts before persistence, including echoed responses.
def sanitize(value: JsonObject, credential: str) -> JsonObject:
    """Remove a resolved credential from a JSON artifact before persistence.

    Args:
        value: Request or response object to sanitize.
        credential: Resolved secret, or an empty string when no secret is available.

    Returns:
        The redacted object, or the original object when the credential is empty.
    """
    return cast(JsonObject, redact_value(value, credential)) if credential else value


# Parse and validate a tool request while preserving original invalid argument strings.
def tool_request(raw: object, candidate: Candidate) -> ToolRequest:
    """Parse a requested tool call and record argument or declaration issues.

    Args:
        raw: Untrusted provider tool-call value.
        candidate: Candidate whose declared tools define accepted names and argument schemas.

    Returns:
        A tool-request observation retaining original arguments and validation issues.
    """
    request = ToolRequest()

    if not isinstance(raw, dict):
        request.issues.append("malformed_tool_request")
        return request

    request.call_id = raw.get("id") if isinstance(raw.get("id"), str) else None
    function = raw.get("function")

    if not isinstance(function, dict) or raw.get("type") != "function":
        request.issues.append("malformed_tool_request")
        return request

    request.name = function.get("name") if isinstance(function.get("name"), str) else None
    arguments = function.get("arguments")
    request.arguments_text = arguments if isinstance(arguments, str) else None

    try:
        parsed = parse_json(arguments) if isinstance(arguments, str) else None
    except (ValueError, TypeError):
        parsed = None

    if not isinstance(parsed, dict):
        request.issues.append("invalid_argument_json")
    else:
        request.arguments = parsed

    definition = next(
        (tool for tool in candidate.tool_definitions if tool.name == request.name), None
    )

    if definition is None:
        request.issues.append("undeclared_tool")
    elif request.arguments is not None:
        try:
            validator = validator_for(definition.parameters)(
                definition.parameters, registry=Registry()
            )

            if not validator.is_valid(request.arguments):
                request.issues.append("arguments_schema_mismatch")
        except (Unresolvable, ValueError, RecursionError):
            request.issues.append("arguments_schema_unresolvable")

    return request


# Accept only explicitly reported nonnegative integer usage; unavailable values remain unknown.
def token_count(value: object) -> int | None:
    """Accept only explicitly reported nonnegative integer token counts.

    Args:
        value: Untrusted provider usage value; booleans and negative values are rejected.

    Returns:
        The valid token count, or None when usage is unavailable or invalid.
    """
    return value if type(value) is int and value >= 0 else None


# Normalize one provider response, retaining omissions and truncation as completeness issues.
def normalize(
    raw: JsonObject,
    candidate: Candidate,
    provider_type: str,
    execution_id: UUID,
    run_id: UUID,
    scenario_id: UUID,
    attempt_number: int,
    started_at: datetime,
    completed_at: datetime,
    duration_ms: float,
) -> ExecutionEvidence:
    """Normalize one assistant completion without inferring grades or tool execution.

    Args:
        raw: Sanitized provider JSON containing exactly one assistant choice.
        candidate: Frozen candidate supplying requested model, adapter, and declared tools.
        provider_type: Provider identifier recorded for provenance.
        execution_id: Stable identity of this attempt.
        run_id: Owning evaluation run identity.
        scenario_id: Executed scenario identity.
        attempt_number: One-based attempt number within the scenario.
        started_at: Recorded attempt start time.
        completed_at: Time evidence collection completed.
        duration_ms: Measured outbound request duration in milliseconds.

    Returns:
        Normalized observations and completeness issues; malformed envelopes raise
        InvocationFailure instead of producing fabricated response evidence.
    """
    choices = raw.get("choices")

    if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
        raise malformed_response()

    choice = choices[0]
    message = choice.get("message")

    if not isinstance(message, dict) or message.get("role") != "assistant":
        raise malformed_response()

    evidence = ExecutionEvidence(
        execution_id=execution_id,
        run_id=run_id,
        scenario_id=scenario_id,
        attempt_number=attempt_number,
        status="completed",
        started_at=started_at,
        completed_at=completed_at,
        duration_ms=duration_ms,
        requested_model=candidate.model_name,
        provider_type=provider_type,
        adapter=candidate.adapter,
    )
    evidence.returned_model = raw.get("model") if isinstance(raw.get("model"), str) else None
    evidence.provider_request_id = raw.get("id") if isinstance(raw.get("id"), str) else None
    evidence.finish_reason = (
        choice.get("finish_reason") if isinstance(choice.get("finish_reason"), str) else None
    )
    content = message.get("content")
    evidence.response_text = content if isinstance(content, str) else None
    evidence.refusal = message.get("refusal") if isinstance(message.get("refusal"), str) else None

    if content is not None and not isinstance(content, str):
        evidence.completeness_issues.append("unsupported_response_content")

    calls = message.get("tool_calls")

    if calls is None:
        calls = []

    if isinstance(calls, list):
        evidence.tool_requests = [tool_request(call, candidate) for call in calls]

        if any(call.issues for call in evidence.tool_requests):
            evidence.completeness_issues.append("tool_request_validation_issues")
    else:
        evidence.completeness_issues.append("malformed_tool_calls")

    if evidence.finish_reason == "tool_calls" and not evidence.tool_requests:
        evidence.tool_requests = None

        evidence.completeness_issues.append("tool_calls_unavailable")

    usage = raw.get("usage")

    if isinstance(usage, dict):
        charge = usage.get("cost") if provider_type == "openrouter" else None

        if type(charge) in {int, float, str}:
            try:
                amount = Decimal(str(charge))

                if amount.is_finite() and amount >= 0:
                    evidence.provider_reported_usd = amount
            except InvalidOperation:
                pass

        evidence.input_tokens = token_count(usage.get("prompt_tokens"))
        evidence.output_tokens = token_count(usage.get("completion_tokens"))

    if evidence.input_tokens is None or evidence.output_tokens is None:
        evidence.completeness_issues.append("usage_unavailable")

    if evidence.returned_model is None:
        evidence.completeness_issues.append("model_identity_unavailable")

    if evidence.finish_reason is None:
        evidence.completeness_issues.append("finish_reason_unavailable")

    if evidence.finish_reason == "length":
        evidence.completeness_issues.append("output_truncated")

    if evidence.response_text is None and not evidence.tool_requests and evidence.refusal is None:
        evidence.completeness_issues.append("response_unavailable")

    return evidence


# Explain malformed envelopes without returning arbitrary integration payload content.
def malformed_response() -> InvocationFailure:
    """Create a safe failure for an unnormalizable provider response.

    Accepts no parameters.

    Returns:
        A nonfatal provider failure without arbitrary response content.
    """
    return InvocationFailure(
        ExecutionError(
            code="malformed_provider_response",
            source="provider",
            message="The provider response could not be normalized.",
        )
    )
