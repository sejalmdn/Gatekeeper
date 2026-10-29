"""Readable assertion diagnostics for private evaluation results, never invocation payloads."""

import json

from gatekeeper.contracts.common import JsonObject


# Keep individual diagnostic values bounded without obscuring their JSON type.
def display_value(value: object) -> str:
    """Render value as bounded JSON for a private explanation; return readable text."""
    encoded = json.dumps(value, ensure_ascii=False, separators=(", ", ": "))

    return encoded if len(encoded) <= 240 else encoded[:237] + "..."


# Keep operational measurements consistent with the UI's two-decimal display precision.
def display_number(value: float | int) -> str:
    """Format numeric value to at most two decimal places; return display text."""
    return f"{value:.2f}".rstrip("0").rstrip(".")


# Explain the exact JSON field observation and the configured assertion without regrading it.
def field_explanation(actual: object, present: bool, parameters: JsonObject, passed: bool) -> str:
    """Describe actual/present against parameters using the supplied passed outcome."""
    path = parameters["path"] or "(root)"
    operator = parameters["operator"]
    expectations = {
        "exists": "be present",
        "not_exists": "be absent",
        "equals": f"equal {display_value(parameters.get('value'))}",
        "not_equals": f"differ from {display_value(parameters.get('value'))}",
        "in": f"be one of {display_value(parameters.get('values'))}",
        "not_in": f"be outside {display_value(parameters.get('values'))}",
        "gt": f"be greater than {display_value(parameters.get('value'))}",
        "gte": f"be greater than or equal to {display_value(parameters.get('value'))}",
        "lt": f"be less than {display_value(parameters.get('value'))}",
        "lte": f"be less than or equal to {display_value(parameters.get('value'))}",
        "between": (
            f"be between {display_value(parameters.get('min'))} and "
            f"{display_value(parameters.get('max'))}, inclusive"
        ),
    }
    observed = display_value(actual) if present else "missing"
    outcome = "satisfied" if passed else "not satisfied"
    numeric_note = (
        " Numeric comparisons require a JSON number; booleans and strings do not qualify."
        if present
        and operator in {"gt", "gte", "lt", "lte", "between"}
        and type(actual) not in {int, float}
        else ""
    )

    return (
        f"Field {path}: expected to {expectations[operator]}; observed {observed}. "
        f"Assertion {outcome}.{numeric_note}"
    )


# Report only the phrases relevant to the observed text assertion outcome.
def text_explanation(parameters: JsonObject, matches: list[bool], forbidden: bool) -> str:
    """Describe parameters' phrases using matches and forbidden mode; return diagnostic text."""
    found = [value for value, matched in zip(parameters["values"], matches, strict=True) if matched]
    missing = [
        value for value, matched in zip(parameters["values"], matches, strict=True) if not matched
    ]
    case = "case-sensitive" if parameters["case_sensitive"] else "case-insensitive"

    if forbidden:
        message = (
            f"Forbidden text found: {display_value(found)}."
            if found
            else f"None of the forbidden phrases were found: {display_value(parameters['values'])}."
        )
    elif parameters["match"] == "all":
        message = (
            f"Missing required text: {display_value(missing)}."
            if missing
            else f"All required phrases were found: {display_value(found)}."
        )
    else:
        message = (
            f"At least one required phrase was found: {display_value(found)}."
            if found
            else f"None of the required phrases were found: {display_value(missing)}."
        )

    return f"{message} Matching was {case}."
