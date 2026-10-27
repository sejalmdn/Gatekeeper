"""Credential-free Chat Completions payload construction and one-request transport."""

import logging
from urllib.parse import urlsplit

import httpx
from jsonschema import Draft202012Validator, SchemaError
from jsonschema.validators import validator_for
from pydantic import ValidationError

from gatekeeper.contracts.candidates import Candidate, GenerationParameters
from gatekeeper.contracts.common import JsonObject
from gatekeeper.contracts.executions import ExecutionError
from gatekeeper.contracts.providers import Provider
from gatekeeper.contracts.scenarios import Scenario

# Integration diagnostics include counts and validated identifiers only.
logger = logging.getLogger(__name__)

# Provider defaults retain each candidate's frozen Chat Completions adapter.
BASE_URLS = {
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
}


# Safe invocation failure whose message never includes arbitrary provider or exception content.
class InvocationFailure(Exception):
    # Retain a safe explanation and whether further attempts would repeat this error.
    def __init__(self, error: ExecutionError, fatal: bool = False) -> None:
        """Initialize an invocation failure with a safe error and stop policy.

        Args:
            self: Exception instance being initialized.
            error: Credential-free, machine-readable failure details.
            fatal: Whether the run must stop instead of attempting its remaining requests.

        Returns:
            None; stores the error and initializes the exception message.
        """
        self.error = error
        self.fatal = fatal

        super().__init__(error.message)


# Construct a configuration error before any credentials or network requests are involved.
def configuration_failure(code: str, message: str) -> InvocationFailure:
    """Create a fatal failure for invalid invocation configuration.

    Args:
        code: Stable machine-readable configuration error code.
        message: Safe explanation containing no credentials or arbitrary provider text.

    Returns:
        An invocation failure that stops the run before further attempts.
    """
    return InvocationFailure(
        ExecutionError(code=code, source="configuration", message=message), fatal=True
    )


# Reject remote schema references so tool validation never makes external requests.
def check_schema(schema: JsonObject) -> None:
    """Validate a tool schema and reject references requiring external retrieval.

    Args:
        schema: Tool argument JSON Schema, using a supported draft and local references.

    Returns:
        None; raises InvocationFailure for invalid drafts, references, or schemas.
    """
    pending: list[object] = [schema]

    while pending:
        item = pending.pop()

        if isinstance(item, dict):
            for key, value in item.items():
                if key in {"$ref", "$dynamicRef"} and (
                    not isinstance(value, str) or not value.startswith("#")
                ):
                    raise configuration_failure(
                        "unsupported_schema_reference", "Tool schemas require local references."
                    )

                pending.append(value)
        elif isinstance(item, list):
            pending.extend(item)

    try:
        validator = (
            validator_for(schema, default=None) if "$schema" in schema else Draft202012Validator
        )

        if validator is None:
            raise configuration_failure(
                "unsupported_schema_draft", "Unsupported tool schema draft."
            )

        validator.check_schema(schema)
    except (SchemaError, TypeError, ValueError) as error:
        raise configuration_failure("invalid_tool_schema", "A tool schema is invalid.") from error


# Resolve the configured API destination without allowing credentials in URLs or redirects.
def endpoint(provider: Provider) -> str:
    """Validate the provider destination and construct its Chat Completions URL.

    Args:
        provider: Provider type and optional HTTPS API base URL.

    Returns:
        The request URL; raises InvocationFailure for unsupported or unsafe configuration.
    """

    if provider.provider_type not in BASE_URLS:
        raise configuration_failure(
            "unsupported_provider", "Execution supports OpenRouter and Groq."
        )

    base = provider.base_url or BASE_URLS[provider.provider_type]

    try:
        parsed = urlsplit(base)
        _ = parsed.port
    except ValueError as error:
        raise configuration_failure(
            "invalid_base_url", "The provider API base URL is invalid."
        ) from error

    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise configuration_failure(
            "invalid_base_url", "The provider requires an HTTPS API base URL."
        )

    return f"{base.rstrip('/')}/chat/completions"


# Build provider input from an explicit allowlist, independently of private run configuration.
def build_request(candidate: Candidate, provider: Provider, scenario: Scenario) -> JsonObject:
    """Return a validated provider payload from candidate, provider, and scenario."""
    endpoint(provider)

    if candidate.adapter != "openai_chat_completions":
        raise configuration_failure(
            "unsupported_adapter", "The candidate adapter is not supported."
        )

    try:
        parameters = GenerationParameters.model_validate(candidate.generation_parameters)
    except ValidationError as error:
        raise configuration_failure(
            "unsupported_generation_parameters", "Recreate this candidate with supported settings."
        ) from error

    if provider.provider_type == "groq" and parameters.top_k is not None:
        raise configuration_failure(
            "unsupported_parameter", "Groq does not support explicit top_k."
        )

    messages: list[JsonObject] = []

    if candidate.system_prompt:
        messages.append({"role": "system", "content": candidate.system_prompt})

    for message in scenario.input.get("history", []):
        messages.append({"role": message["role"], "content": message["content"]})

    messages.append({"role": "user", "content": scenario.input["user_message"]})
    body: JsonObject = {
        "model": candidate.model_name,
        "messages": messages,
        "stream": False,
        "n": 1,
    }

    for key, value in parameters.model_dump(exclude_none=True).items():
        if key == "max_output_tokens":
            key = (
                "max_tokens" if provider.provider_type == "openrouter" else "max_completion_tokens"
            )

        body[key] = value

    if candidate.tool_definitions:
        tools: list[JsonObject] = []

        for tool in candidate.tool_definitions:
            check_schema(tool.parameters)
            tools.append({"type": "function", "function": tool.model_dump(exclude_none=True)})

        body["tools"] = tools
        body["tool_choice"] = "auto"

    if candidate.response_format is not None:
        format_type = candidate.response_format.get("type")

        if not isinstance(format_type, str) or format_type not in {
            "text",
            "json_object",
            "json_schema",
        }:
            raise configuration_failure(
                "unsupported_response_format", "Unsupported response format."
            )

        body["response_format"] = candidate.response_format

    if provider.provider_type == "openrouter":
        body["provider"] = {"require_parameters": True, "allow_fallbacks": False}

    logger.debug(
        "provider_payload_prepared candidate_id=%s provider_id=%s message_count=%d tool_count=%d",
        candidate.id,
        provider.id,
        len(messages),
        len(candidate.tool_definitions),
    )
    return body


# Send exactly one request; transport retry and redirect handling are deliberately disabled.
async def send_request(
    client: httpx.AsyncClient, provider: Provider, body: JsonObject, credential: str
) -> httpx.Response:
    """Send one authenticated provider request without following redirects.

    Args:
        client: Asynchronous HTTP client used for the outbound request.
        provider: Provider whose validated endpoint receives the request.
        body: Allowlisted Chat Completions payload.
        credential: Resolved secret used only in the authorization header.

    Returns:
        The HTTP response; transport errors propagate to the attempt handler.
    """
    return await client.post(
        endpoint(provider),
        json=body,
        headers={"Authorization": f"Bearer {credential}"},
        follow_redirects=False,
    )


# Classify HTTP failures without retaining potentially sensitive provider error messages.
def response_error(status: int) -> InvocationFailure:
    """Classify a provider HTTP error without copying its response message.

    Args:
        status: HTTP status code returned by the provider.

    Returns:
        A safe invocation failure with the status-specific code and fatal-error policy.
    """
    codes = {
        400: "provider_invalid_request",
        401: "provider_authentication_failed",
        402: "provider_payment_required",
        403: "provider_access_denied",
        404: "provider_model_not_found",
        422: "provider_invalid_request",
        429: "provider_rate_limited",
    }

    return InvocationFailure(
        ExecutionError(
            code=codes.get(status, "provider_http_error"),
            source="provider",
            message=f"The provider returned HTTP {status}.",
            http_status=status,
        ),
        fatal=status in {400, 401, 402, 403, 404, 422} or 300 <= status < 400,
    )
