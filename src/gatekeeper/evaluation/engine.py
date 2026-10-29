"""Pure deterministic checks over frozen rules and normalized evidence."""

import logging
import re
from datetime import UTC, datetime
from time import perf_counter

from jsonschema.validators import validator_for
from referencing import Registry

from gatekeeper.contracts.candidates import ToolDefinition
from gatekeeper.contracts.common import JsonObject
from gatekeeper.contracts.evaluations import (
    AttemptEvaluation,
    AttemptVerdict,
    CheckResult,
    RuleEvaluationResult,
    RuleOutcome,
)
from gatekeeper.contracts.executions import ExecutionEvidence, ToolRequest
from gatekeeper.contracts.rules import EffectiveRuleBinding
from gatekeeper.evaluation.explanations import (
    display_number,
    display_value,
    field_explanation,
    text_explanation,
)
from gatekeeper.evidence.normalization import parse_json

# Version changes identify evaluator semantics without changing historical results.
EVALUATOR_VERSION = "deterministic-v1"
MISSING = object()
logger = logging.getLogger(__name__)


# Construct private result explanations while keeping diagnostic content out of logs.
def check(
    outcome: RuleOutcome, reason: str, reference: str = "", explanation: str = ""
) -> CheckResult:
    """Build a check from outcome/reason, optional reference, and human-readable explanation."""
    return CheckResult(
        outcome=outcome,
        reason=reason,
        explanation=explanation or reason.replace("_", " ").capitalize() + ".",
        evidence_references=[reference] if reference else [],
    )


# Convert a boolean assertion into a stable outcome.
def assertion_result(passed: bool, reference: str, reason: str, explanation: str) -> CheckResult:
    """Return passed as a verdict with specific reason/explanation and an evidence reference."""
    return check(
        "pass" if passed else "fail",
        reason,
        reference,
        explanation,
    )


# Compare JSON recursively without Python's boolean/number equivalence.
def json_equal(left: object, right: object) -> bool:
    """Compare left and right recursively by JSON type and value; return equality."""
    if type(left) in {int, float} and type(right) in {int, float}:
        return left == right

    if type(left) is not type(right):
        return False

    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(json_equal(v, right[k]) for k, v in left.items())

    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(
            json_equal(a, b) for a, b in zip(left, right, strict=True)
        )

    return left == right


# Resolve RFC 6901 pointers while retaining missing versus explicit null.
def pointer(value: object, path: str) -> object:
    """Resolve path in value, returning MISSING when an object key or array index is absent."""
    if not path:
        return value

    for encoded in path[1:].split("/"):
        key = encoded.replace("~1", "/").replace("~0", "~")

        if isinstance(value, dict):
            value = value.get(key, MISSING)
        elif isinstance(value, list) and re.fullmatch(r"0|[1-9][0-9]*", key):
            index = int(key)
            value = value[index] if index < len(value) else MISSING
        else:
            return MISSING

    return value


# Evaluate the shared response/tool JSON field assertion contract.
def field_matches(value: object, parameters: JsonObject) -> bool:
    """Apply parameters' pointer/operator to value and return whether the assertion holds."""
    actual = pointer(value, parameters["path"])
    operator = parameters["operator"]
    expected = parameters.get("value")

    if operator == "exists":
        return actual is not MISSING

    if operator == "not_exists":
        return actual is MISSING

    if actual is MISSING:
        return False

    if operator in {"equals", "not_equals"}:
        equal = json_equal(actual, expected)
        return equal if operator == "equals" else not equal

    if operator in {"in", "not_in"}:
        included = any(json_equal(actual, item) for item in parameters["values"])
        return included if operator == "in" else not included

    if type(actual) not in {int, float}:
        return False

    if operator == "between":
        return parameters["min"] <= actual <= parameters["max"]

    if type(expected) not in {int, float}:
        return False

    return {
        "gt": actual > expected,
        "gte": actual >= expected,
        "lt": actual < expected,
        "lte": actual <= expected,
    }[operator]


# Validate schemas locally without fetching remote references.
def schema_matches(value: object, schema: JsonObject) -> bool:
    """Validate value against schema with offline reference resolution; return validity."""
    validator_type = validator_for(schema)
    validator_type.check_schema(schema)
    return validator_type(schema, registry=Registry()).is_valid(value)


# Explain local schema violations without including arbitrary exception messages.
def schema_result(value: object, schema: JsonObject, reference: str) -> CheckResult:
    """Validate value against schema; return a result with failing paths and constraints."""
    validator_type = validator_for(schema)
    validator_type.check_schema(schema)
    error = next(validator_type(schema, registry=Registry()).iter_errors(value), None)
    explanation = "JSON matches the configured schema."

    if error is not None:
        path = "/".join(
            str(part).replace("~", "~0").replace("/", "~1") for part in error.absolute_path
        )
        location = f"/{path}" if path else "(root)"
        explanation = (
            f"JSON does not match the configured schema. {location}: {error.message[:300]}"
        )

    return assertion_result(
        error is None,
        reference,
        "json_schema_matched" if error is None else "json_schema_mismatch",
        explanation,
    )


# Find a complete bipartite matching so broad expectations cannot consume unique matches.
def expected_calls_match(calls: list[ToolRequest], parameters: JsonObject) -> bool:
    """Match parameters' unordered expected calls one-to-one against calls; return success."""
    expected = parameters["expected"]

    if len(calls) < len(expected):
        return False

    if not parameters["allow_additional_calls"] and len(calls) != len(expected):
        return False

    edges = [
        [
            index
            for index, call in enumerate(calls)
            if call.name == item["tool"]
            and (not item["fields"] or call.arguments is not None)
            and all(field_matches(call.arguments, field) for field in item["fields"])
        ]
        for item in expected
    ]
    assigned: dict[int, int] = {}

    # Reassign previous matches when needed to cover a more constrained expectation.
    def assign(expected_index: int, seen: set[int]) -> bool:
        """Find an augmenting path for expected_index using seen calls; return success."""
        for call_index in edges[expected_index]:
            if call_index in seen:
                continue

            seen.add(call_index)

            if call_index not in assigned or assign(assigned[call_index], seen):
                assigned[call_index] = expected_index
                return True

        return False

    return all(assign(index, set()) for index in range(len(expected)))


# Evaluate one binding without provider invocation or mutable configuration access.
def evaluate_rule(rule: EffectiveRuleBinding, evidence: ExecutionEvidence) -> CheckResult:
    """Evaluate frozen rule against evidence, returning an outcome and safe reason."""
    kind = rule.rule_type
    parameters = rule.parameters

    if evidence.status != "completed":
        return check("cannot_evaluate", "invocation_unsuccessful", "/status")

    if kind == "metric.cost":
        return check("cannot_evaluate", "pricing_unavailable")

    if kind == "judge.rubric":
        return check("cannot_evaluate", "rubric_unsupported")

    if kind == "metric.latency":
        if evidence.duration_ms is None:
            return check("cannot_evaluate", "latency_unavailable", "/duration_ms")

        passed = evidence.duration_ms <= parameters["max_ms"]
        comparison = "within" if passed else "above"

        return assertion_result(
            passed,
            "/duration_ms",
            "latency_within_limit" if passed else "latency_limit_exceeded",
            f"Observed latency {display_number(evidence.duration_ms)} ms is {comparison} "
            f"the maximum of {parameters['max_ms']} ms.",
        )

    if kind == "metric.tokens":
        observations = {"max_input": evidence.input_tokens, "max_output": evidence.output_tokens}
        observations["max_total"] = (
            evidence.input_tokens + evidence.output_tokens
            if evidence.input_tokens is not None and evidence.output_tokens is not None
            else None
        )
        configured = [(observations[key], limit) for key, limit in parameters.items()]
        labels = {
            "max_input": "Input tokens",
            "max_output": "Output tokens",
            "max_total": "Total tokens",
        }
        details = []

        for key, limit in parameters.items():
            value = observations[key]
            comparison = "unavailable" if value is None else str(value)
            relation = "exceeds" if value is not None and value > limit else "maximum"
            details.append(f"{labels[key]}: observed {comparison}; {relation} {limit}")

        if any(value is not None and value > limit for value, limit in configured):
            result = check("fail", "token_limit_exceeded")
        elif any(value is None for value, _ in configured):
            result = check("cannot_evaluate", "usage_unavailable")
        else:
            result = check("pass", "token_limits_satisfied")

        result.explanation = ". ".join(details) + "."
        result.evidence_references = [
            reference
            for limit, reference in (
                ("max_input", "/input_tokens"),
                ("max_output", "/output_tokens"),
            )
            if limit in parameters or "max_total" in parameters
        ]
        return result

    if kind.startswith("response."):
        text = evidence.response_text

        if text is None:
            return check("cannot_evaluate", "response_unavailable", "/response_text")

        if kind in {"response.required_text", "response.forbidden_text"}:
            values = parameters["values"]

            if not parameters["case_sensitive"]:
                text = text.casefold()
                values = [value.casefold() for value in values]

            matches = [value in text for value in values]
            passed = (
                not any(matches)
                if kind == "response.forbidden_text"
                else (all(matches) if parameters["match"] == "all" else any(matches))
            )
            forbidden = kind == "response.forbidden_text"
            reason = (
                ("forbidden_text_absent" if passed else "forbidden_text_found")
                if forbidden
                else ("required_text_found" if passed else "required_text_missing")
            )

            return assertion_result(
                passed, "/response_text", reason, text_explanation(parameters, matches, forbidden)
            )
        elif kind == "response.regex":
            flags = re.RegexFlag(0)

            for flag in parameters["flags"]:
                flags |= getattr(re, flag)

            expression = re.compile(parameters["pattern"], flags)
            passed = getattr(expression, parameters["mode"])(text) is not None
            description = "matches" if passed else "does not match"

            return assertion_result(
                passed,
                "/response_text",
                "regex_matched" if passed else "regex_not_matched",
                f"Response {description} pattern {display_value(parameters['pattern'])} "
                f"using {parameters['mode']} mode; flags: "
                f"{', '.join(parameters['flags']) or 'none'}.",
            )
        elif kind == "response.length":
            length = len(text) if parameters["unit"] == "characters" else len(text.split())
            passed = parameters.get("min", 0) <= length <= parameters.get("max", float("inf"))
            bounds = (
                f"minimum {parameters.get('min', 0)}, maximum {parameters.get('max', 'unbounded')}"
            )
            description = "within" if passed else "outside"

            return assertion_result(
                passed,
                "/response_text",
                "response_length_within_bounds" if passed else "response_length_out_of_bounds",
                f"Observed length {length} {parameters['unit']} is {description} "
                f"the configured bounds ({bounds}).",
            )
        else:
            try:
                value = parse_json(text)
            except (ValueError, TypeError):
                return check(
                    "fail",
                    "invalid_response_json",
                    "/response_text",
                    "Response could not be parsed as valid JSON.",
                )

            if kind == "response.json_valid":
                return assertion_result(
                    True, "/response_text", "valid_response_json", "Response is valid JSON."
                )
            elif kind == "response.json_schema":
                return schema_result(value, parameters["schema"], "/response_text")
            else:
                passed = field_matches(value, parameters)
                actual = pointer(value, parameters["path"])

                return assertion_result(
                    passed,
                    "/response_text",
                    "json_field_matched" if passed else "json_field_mismatch",
                    field_explanation(actual, actual is not MISSING, parameters, passed),
                )

    calls = evidence.tool_requests

    if "malformed_tool_calls" in evidence.completeness_issues:
        return check("fail", "malformed_tool_calls", "/tool_requests")

    if calls is None:
        return check("cannot_evaluate", "tool_requests_unavailable", "/tool_requests")

    if kind == "tool.selection":
        names = {call.name for call in calls}
        missing = sorted(set(parameters.get("required_all", [])) - names)
        forbidden_names = sorted(names.intersection(parameters.get("forbidden", [])))
        unexpected = names - set(parameters["allowed"]) if "allowed" in parameters else set()
        no_required_choice = "required_any" in parameters and not names.intersection(
            parameters["required_any"]
        )
        problems = []

        if missing:
            problems.append(f"Missing required tools: {display_value(missing)}")

        if no_required_choice:
            problems.append(
                f"Expected at least one of: {display_value(parameters['required_any'])}"
            )

        if forbidden_names:
            problems.append(f"Forbidden tools requested: {display_value(forbidden_names)}")

        if unexpected:
            problems.append(
                f"Tools outside the allowed set: {display_value(sorted(unexpected, key=str))}"
            )

        passed = not problems
        observed_names = display_value([call.name for call in calls])
        explanation = (
            ". ".join(problems) + f". Observed requested tools: {observed_names}."
            if problems
            else f"Requested tools {observed_names} satisfy all configured selection constraints."
        )

        return assertion_result(
            passed,
            "/tool_requests",
            "tool_selection_matched" if passed else "tool_selection_mismatch",
            explanation,
        )
    elif kind == "tool.argument_field":
        selected = [
            (index, call) for index, call in enumerate(calls) if call.name == parameters["tool"]
        ]
        details = []
        matches = []

        for index, call in selected:
            passed = call.arguments is not None and field_matches(call.arguments, parameters)
            matches.append(passed)

            if call.arguments is None:
                details.append(f"Request {index + 1}: arguments are not valid JSON")
            else:
                actual = pointer(call.arguments, parameters["path"])
                details.append(
                    f"Request {index + 1}: "
                    + field_explanation(actual, actual is not MISSING, parameters, passed)
                )

        passed = bool(selected) and all(matches)
        explanation = (
            f"Tool {display_value(parameters['tool'])}. " + " ".join(details)
            if selected
            else f"Required tool {display_value(parameters['tool'])} was not requested."
        )

        return assertion_result(
            passed,
            "/tool_requests",
            "tool_argument_matched" if passed else "tool_argument_mismatch",
            explanation,
        )
    elif kind == "tool.expected_calls":
        passed = expected_calls_match(calls, parameters)
        expected_count = len(parameters["expected"])
        actual_count = len(calls)
        expected_names = [item["tool"] for item in parameters["expected"]]
        observed_names = [call.name for call in calls]
        allowance = "allowed" if parameters["allow_additional_calls"] else "not allowed"
        description = (
            "Every expected tool request matched a distinct observed request "
            "and its argument checks."
            if passed
            else "Expected tool requests could not be matched one-to-one with observed requests "
            "under the configured tool names, argument checks, and additional-call policy."
        )

        return assertion_result(
            passed,
            "/tool_requests",
            "expected_tool_calls_matched" if passed else "expected_tool_calls_mismatch",
            f"{description} Expected {expected_count}: {display_value(expected_names)}; "
            f"observed {actual_count}: {display_value(observed_names)}. "
            f"Additional calls are {allowance}. "
            f"Expected argument checks: {display_value(parameters['expected'])}. "
            f"Observed arguments: {display_value([call.arguments for call in calls])}.",
        )
    else:
        return check("error", "unsupported_rule_type")


# Revalidate normalized requests against frozen declarations, separate from bound rules.
def validate_tools(evidence: ExecutionEvidence, tools: list[ToolDefinition]) -> list[CheckResult]:
    """Validate evidence's requested tools against tools, returning required baseline checks."""
    if evidence.status != "completed":
        return [check("cannot_evaluate", "invocation_unsuccessful", "/status")]

    if "malformed_tool_calls" in evidence.completeness_issues:
        return [check("fail", "malformed_tool_calls", "/tool_requests")]

    if evidence.tool_requests is None:
        return [check("cannot_evaluate", "tool_requests_unavailable", "/tool_requests")]

    definitions = {tool.name: tool for tool in tools}
    results = []

    for index, call in enumerate(evidence.tool_requests):
        reference = f"/tool_requests/{index}"

        try:
            if call.issues == ["arguments_schema_unresolvable"]:
                result = check("error", "tool_schema_unresolvable", reference)
            elif call.issues:
                result = check("fail", call.issues[0], reference)
            elif not call.name:
                result = check("fail", "malformed_tool_request", reference)
            elif call.arguments is None:
                result = check("fail", "invalid_argument_json", reference)
            elif call.name not in definitions:
                result = check("fail", "undeclared_tool", reference)
            elif not schema_matches(call.arguments, definitions[call.name].parameters):
                result = check("fail", "arguments_schema_mismatch", reference)
            else:
                result = check("pass", "tool_request_valid", reference)
        except Exception:
            result = check("error", "tool_validation_error", reference)

        results.append(result)

    return results


# Apply required-only verdict precedence without aggregating scored or informational bindings.
def attempt_verdict(
    rules: list[RuleEvaluationResult], automatic: list[CheckResult]
) -> AttemptVerdict:
    """Derive an attempt verdict from required rules and automatic baseline results."""
    required = [rule for rule in rules if rule.role == "required"]
    outcomes = {result.outcome for result in [*required, *automatic]}

    for outcome in ("fail", "error"):
        if outcome in outcomes:
            return outcome

    if not required:
        return "not_evaluated"

    if "cannot_evaluate" in outcomes:
        return "cannot_evaluate"

    return "pass"


# Isolate evaluator errors per binding and log only identities, counts, and safe codes.
def evaluate_attempt(
    evidence: ExecutionEvidence,
    rules: list[EffectiveRuleBinding],
    tools: list[ToolDefinition],
) -> AttemptEvaluation:
    """Evaluate evidence using frozen rules/tools and return a complete versioned evaluation."""
    started = perf_counter()
    results = []
    automatic = validate_tools(evidence, tools)

    for rule in rules:
        try:
            result = evaluate_rule(rule, evidence)
        except Exception:
            result = check("error", "rule_evaluator_error")

        results.append(
            RuleEvaluationResult(
                **result.model_dump(),
                rule_binding_id=rule.id,
                rule_key=rule.rule_key,
                rule_type=rule.rule_type,
                role=rule.role,
                severity=rule.severity,
            )
        )

    evaluation = AttemptEvaluation(
        execution_id=evidence.execution_id,
        verdict=attempt_verdict(results, automatic),
        evaluator_version=EVALUATOR_VERSION,
        evaluated_at=datetime.now(UTC),
        automatic_tool_validation=automatic,
        rule_results=results,
    )
    logger.info(
        "attempt_evaluated run_id=%s execution_id=%s verdict=%s rule_count=%d "
        "automatic_count=%d error_count=%d error_codes=%s duration_ms=%.2f",
        evidence.run_id,
        evidence.execution_id,
        evaluation.verdict,
        len(results),
        len(automatic),
        sum(result.outcome == "error" for result in [*results, *automatic]),
        "|".join(
            sorted(
                {result.reason for result in [*results, *automatic] if result.outcome == "error"}
            )
        )
        or "none",
        (perf_counter() - started) * 1000,
    )
    return evaluation
