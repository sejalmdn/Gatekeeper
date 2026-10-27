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
from gatekeeper.evidence.normalization import parse_json

# Version changes identify evaluator semantics without changing historical results.
EVALUATOR_VERSION = "deterministic-v1"
MISSING = object()
logger = logging.getLogger(__name__)


# Construct concise content-free results with evidence references.
def check(outcome: RuleOutcome, reason: str, reference: str = "") -> CheckResult:
    """Build a check from outcome/reason and an optional normalized evidence pointer."""
    return CheckResult(
        outcome=outcome,
        reason=reason,
        explanation=reason.replace("_", " ").capitalize() + ".",
        evidence_references=[reference] if reference else [],
    )


# Convert a boolean assertion into a stable outcome.
def assertion_result(passed: bool, reference: str) -> CheckResult:
    """Return a pass or fail for passed, referencing the observed evidence field."""
    return check(
        "pass" if passed else "fail",
        "assertion_passed" if passed else "assertion_failed",
        reference,
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

        return assertion_result(evidence.duration_ms <= parameters["max_ms"], "/duration_ms")

    if kind == "metric.tokens":
        observations = {"max_input": evidence.input_tokens, "max_output": evidence.output_tokens}
        observations["max_total"] = (
            evidence.input_tokens + evidence.output_tokens
            if evidence.input_tokens is not None and evidence.output_tokens is not None
            else None
        )
        configured = [(observations[key], limit) for key, limit in parameters.items()]

        if any(value is not None and value > limit for value, limit in configured):
            result = check("fail", "token_limit_exceeded")
        elif any(value is None for value, _ in configured):
            result = check("cannot_evaluate", "usage_unavailable")
        else:
            result = check("pass", "token_limits_satisfied")

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
        elif kind == "response.regex":
            flags = re.RegexFlag(0)

            for flag in parameters["flags"]:
                flags |= getattr(re, flag)

            expression = re.compile(parameters["pattern"], flags)
            passed = getattr(expression, parameters["mode"])(text) is not None
        elif kind == "response.length":
            length = len(text) if parameters["unit"] == "characters" else len(text.split())
            passed = parameters.get("min", 0) <= length <= parameters.get("max", float("inf"))
        else:
            try:
                value = parse_json(text)
            except (ValueError, TypeError):
                return check("fail", "invalid_response_json", "/response_text")

            if kind == "response.json_valid":
                passed = True
            elif kind == "response.json_schema":
                passed = schema_matches(value, parameters["schema"])
            else:
                passed = field_matches(value, parameters)

        return assertion_result(passed, "/response_text")

    calls = evidence.tool_requests

    if "malformed_tool_calls" in evidence.completeness_issues:
        return check("fail", "malformed_tool_calls", "/tool_requests")

    if calls is None:
        return check("cannot_evaluate", "tool_requests_unavailable", "/tool_requests")

    if kind == "tool.selection":
        names = {call.name for call in calls}
        passed = (
            set(parameters.get("required_all", [])).issubset(names)
            and ("required_any" not in parameters or bool(names & set(parameters["required_any"])))
            and ("allowed" not in parameters or names.issubset(parameters["allowed"]))
            and not names.intersection(parameters.get("forbidden", []))
        )
    elif kind == "tool.argument_field":
        selected = [call for call in calls if call.name == parameters["tool"]]
        passed = bool(selected) and all(
            call.arguments is not None and field_matches(call.arguments, parameters)
            for call in selected
        )
    elif kind == "tool.expected_calls":
        passed = expected_calls_match(calls, parameters)
    else:
        return check("error", "unsupported_rule_type")

    return assertion_result(passed, "/tool_requests")


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
