"""Rule-binding and rule-parameter contracts."""

from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import Field, JsonValue, field_validator, model_validator

from gatekeeper.contracts.common import Contract, JsonObject, NonEmptyString
from gatekeeper.contracts.scenarios import ScenarioType
from gatekeeper.utils.json import canonical_json


# Supported evaluator implementations.
class RuleType(StrEnum):
    METRIC_LATENCY = "metric.latency"
    METRIC_TOKENS = "metric.tokens"
    METRIC_COST = "metric.cost"
    RESPONSE_REQUIRED_TEXT = "response.required_text"
    RESPONSE_FORBIDDEN_TEXT = "response.forbidden_text"
    RESPONSE_REGEX = "response.regex"
    RESPONSE_JSON_VALID = "response.json_valid"
    RESPONSE_JSON_SCHEMA = "response.json_schema"
    RESPONSE_JSON_FIELD = "response.json_field"
    RESPONSE_LENGTH = "response.length"
    JUDGE_RUBRIC = "judge.rubric"
    TOOL_SELECTION = "tool.selection"
    TOOL_ARGUMENT_FIELD = "tool.argument_field"
    TOOL_EXPECTED_CALLS = "tool.expected_calls"


# Rule result behavior.
class RuleRole(StrEnum):
    REQUIRED = "required"
    SCORED = "scored"
    INFORMATIONAL = "informational"


# Fixed rule severity categories.
class Severity(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# Product-wide relative weights for scored rules.
SEVERITY_WEIGHTS: dict[Severity, int] = {
    Severity.CRITICAL: 4,
    Severity.HIGH: 3,
    Severity.MEDIUM: 2,
    Severity.LOW: 1,
}


# Empty parameter object.
class EmptyParameters(Contract):
    pass


# Latency limit parameters.
class LatencyParameters(Contract):
    max_ms: int = Field(gt=0)


# Token-usage limit parameters.
class TokenParameters(Contract):
    max_input: int | None = Field(default=None, ge=0)
    max_output: int | None = Field(default=None, ge=0)
    max_total: int | None = Field(default=None, ge=0)

    # Require at least one token limit.
    @model_validator(mode="after")
    def require_limit(self) -> TokenParameters:
        if self.max_input is None and self.max_output is None and self.max_total is None:
            raise ValueError("at least one token limit is required")
        return self


# Cost limit parameters.
class CostParameters(Contract):
    max_usd: float = Field(gt=0)


# Required-text parameters.
class RequiredTextParameters(Contract):
    values: list[NonEmptyString] = Field(min_length=1)
    match: Literal["all", "any"] = "all"
    case_sensitive: bool = False


# Forbidden-text parameters.
class ForbiddenTextParameters(Contract):
    values: list[NonEmptyString] = Field(min_length=1)
    case_sensitive: bool = False


# Regex parameters.
class RegexParameters(Contract):
    pattern: NonEmptyString
    mode: Literal["search", "fullmatch"] = "search"
    flags: list[Literal["IGNORECASE", "MULTILINE", "DOTALL"]] = Field(default_factory=list)

    # Compile the configured expression and flags.
    @model_validator(mode="after")
    def validate_expression(self) -> RegexParameters:
        flag_value = re.RegexFlag(0)
        for flag in self.flags:
            flag_value |= getattr(re, flag)
        try:
            re.compile(self.pattern, flag_value)
        except re.error as error:
            raise ValueError(f"invalid regular expression: {error}") from error
        return self


# JSON Schema parameters.
class JsonSchemaParameters(Contract):
    schema_: JsonObject = Field(alias="schema", serialization_alias="schema")

    # JSON-safe schema validation.
    @field_validator("schema_")
    @classmethod
    def validate_schema(cls, value: JsonObject) -> JsonObject:
        canonical_json(value)
        return value


# JSON field assertion shared by response and tool-call rules.
class FieldAssertion(Contract):
    path: str
    operator: Literal[
        "exists",
        "not_exists",
        "equals",
        "not_equals",
        "in",
        "not_in",
        "gt",
        "gte",
        "lt",
        "lte",
        "between",
    ]
    value: JsonValue | None = None
    values: list[JsonValue] | None = None
    min: float | None = None
    max: float | None = None

    # JSON Pointer syntax validation.
    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if value and not value.startswith("/"):
            raise ValueError("must be an empty root pointer or start with /")
        if re.search(r"~(?![01])", value):
            raise ValueError("contains an invalid JSON Pointer escape")
        return value

    # Enforce the operand shape required by each operator.
    @model_validator(mode="after")
    def validate_operand(self) -> FieldAssertion:
        fields = self.model_fields_set
        if self.operator in {"equals", "not_equals", "gt", "gte", "lt", "lte"}:
            if "value" not in fields:
                raise ValueError(f"{self.operator} requires value")
        elif self.operator in {"in", "not_in"}:
            if not self.values:
                raise ValueError(f"{self.operator} requires non-empty values")
        elif self.operator == "between":
            if self.min is None or self.max is None or self.min > self.max:
                raise ValueError("between requires min less than or equal to max")
        return self


# Response-length parameters.
class LengthParameters(Contract):
    unit: Literal["characters", "words"]
    min: int | None = Field(default=None, ge=0)
    max: int | None = Field(default=None, ge=0)

    # Require a coherent response-length bound.
    @model_validator(mode="after")
    def validate_bounds(self) -> LengthParameters:
        if self.min is None and self.max is None:
            raise ValueError("at least one length bound is required")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must be less than or equal to max")
        return self


# Fixed-judge rubric parameters.
class JudgeRubricParameters(Contract):
    criterion: NonEmptyString
    min_score: int = Field(ge=1, le=5)


# Tool-selection parameters for unordered requests.
class ToolSelectionParameters(Contract):
    required_all: list[NonEmptyString] | None = None
    required_any: list[NonEmptyString] | None = None
    allowed: list[NonEmptyString] | None = None
    forbidden: list[NonEmptyString] | None = None

    # Require a coherent tool-selection policy.
    @model_validator(mode="after")
    def validate_policy(self) -> ToolSelectionParameters:
        configured = [self.required_all, self.required_any, self.allowed, self.forbidden]
        if all(value is None for value in configured):
            raise ValueError("at least one tool-selection constraint is required")
        for name, value in (
            ("required_all", self.required_all),
            ("required_any", self.required_any),
            ("forbidden", self.forbidden),
        ):
            if value == []:
                raise ValueError(f"{name} must not be empty")
        lists = [value for value in configured if value is not None]
        if any(len(value) != len(set(value)) for value in lists):
            raise ValueError("tool names must be unique within each constraint")
        forbidden = set(self.forbidden or [])
        required = set(self.required_all or []) | set(self.required_any or [])
        if forbidden.intersection(required):
            raise ValueError("required and forbidden tools must not overlap")
        if self.allowed is not None and not required.issubset(self.allowed):
            raise ValueError("required tools must be included in allowed")
        return self


# Tool-specific field assertion parameters.
class ToolArgumentFieldParameters(FieldAssertion):
    tool: NonEmptyString


# Expected tool request with private argument assertions.
class ExpectedToolCall(Contract):
    tool: NonEmptyString
    fields: list[FieldAssertion] = Field(default_factory=list)


# Unordered expected-call matching parameters.
class ExpectedCallsParameters(Contract):
    expected: list[ExpectedToolCall] = Field(min_length=1)
    allow_additional_calls: bool = False


# Serialize parameters with defaults while retaining explicit null assertion operands.
def normalize_parameters(parameters: Contract) -> JsonObject:
    normalized = parameters.model_dump(mode="json", by_alias=True, exclude_none=True)
    if isinstance(parameters, FieldAssertion) and "value" in parameters.model_fields_set:
        normalized["value"] = parameters.value
    if isinstance(parameters, ExpectedCallsParameters):
        normalized["expected"] = [
            {"tool": call.tool, "fields": [normalize_parameters(field) for field in call.fields]}
            for call in parameters.expected
        ]
    return normalized


# Supported parameter contract lookup.
PARAMETER_CONTRACTS: dict[RuleType, type[Contract]] = {
    RuleType.METRIC_LATENCY: LatencyParameters,
    RuleType.METRIC_TOKENS: TokenParameters,
    RuleType.METRIC_COST: CostParameters,
    RuleType.RESPONSE_REQUIRED_TEXT: RequiredTextParameters,
    RuleType.RESPONSE_FORBIDDEN_TEXT: ForbiddenTextParameters,
    RuleType.RESPONSE_REGEX: RegexParameters,
    RuleType.RESPONSE_JSON_VALID: EmptyParameters,
    RuleType.RESPONSE_JSON_SCHEMA: JsonSchemaParameters,
    RuleType.RESPONSE_JSON_FIELD: FieldAssertion,
    RuleType.RESPONSE_LENGTH: LengthParameters,
    RuleType.JUDGE_RUBRIC: JudgeRubricParameters,
    RuleType.TOOL_SELECTION: ToolSelectionParameters,
    RuleType.TOOL_ARGUMENT_FIELD: ToolArgumentFieldParameters,
    RuleType.TOOL_EXPECTED_CALLS: ExpectedCallsParameters,
}

# Scenario types supported by each evaluator.
ALL_SCENARIO_TYPES = set(ScenarioType)
RESPONSE_SCENARIO_TYPES = {ScenarioType.SINGLE_TURN, ScenarioType.MULTI_TURN}
TOOL_SCENARIO_TYPES = {ScenarioType.TOOL_USE}
RULE_SCENARIO_TYPES: dict[RuleType, set[ScenarioType]] = {
    RuleType.METRIC_LATENCY: ALL_SCENARIO_TYPES,
    RuleType.METRIC_TOKENS: ALL_SCENARIO_TYPES,
    RuleType.METRIC_COST: ALL_SCENARIO_TYPES,
    RuleType.RESPONSE_REQUIRED_TEXT: RESPONSE_SCENARIO_TYPES,
    RuleType.RESPONSE_FORBIDDEN_TEXT: RESPONSE_SCENARIO_TYPES,
    RuleType.RESPONSE_REGEX: RESPONSE_SCENARIO_TYPES,
    RuleType.RESPONSE_JSON_VALID: RESPONSE_SCENARIO_TYPES,
    RuleType.RESPONSE_JSON_SCHEMA: RESPONSE_SCENARIO_TYPES,
    RuleType.RESPONSE_JSON_FIELD: RESPONSE_SCENARIO_TYPES,
    RuleType.RESPONSE_LENGTH: RESPONSE_SCENARIO_TYPES,
    RuleType.JUDGE_RUBRIC: RESPONSE_SCENARIO_TYPES,
    RuleType.TOOL_SELECTION: TOOL_SCENARIO_TYPES,
    RuleType.TOOL_ARGUMENT_FIELD: TOOL_SCENARIO_TYPES,
    RuleType.TOOL_EXPECTED_CALLS: TOOL_SCENARIO_TYPES,
}


# Rule-binding creation contract.
class RuleBindingCreate(Contract):
    scenario_id: UUID | None = None
    rule_key: NonEmptyString
    rule_type: RuleType
    role: RuleRole
    severity: Severity
    parameters: JsonObject
    applies_to: list[ScenarioType] | None = None

    # Validate scope and normalize parameters while preserving explicit null operands.
    @model_validator(mode="after")
    def validate_binding(self) -> RuleBindingCreate:
        if self.scenario_id is None and not self.applies_to:
            raise ValueError("dataset rules require applies_to")
        if self.scenario_id is not None and self.applies_to is not None:
            raise ValueError("scenario rules must not define applies_to")
        if self.applies_to and len(self.applies_to) != len(set(self.applies_to)):
            raise ValueError("applies_to values must be unique")
        if self.applies_to and not set(self.applies_to).issubset(
            RULE_SCENARIO_TYPES[self.rule_type]
        ):
            raise ValueError("rule type does not support every applies_to scenario type")
        parsed = PARAMETER_CONTRACTS[self.rule_type].model_validate(self.parameters)
        self.parameters = normalize_parameters(parsed)
        return self


# Rule-binding read contract.
class RuleBinding(RuleBindingCreate):
    id: UUID
    dataset_id: UUID
    created_at: datetime


# Effective rule with its origin and the applicable default replaced by an override.
class EffectiveRuleBinding(RuleBinding):
    source: Literal["dataset", "scenario"]
    overridden_rule_id: UUID | None = None
