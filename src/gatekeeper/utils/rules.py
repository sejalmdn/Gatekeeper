"""Transport-independent resolution of dataset defaults and scenario overrides."""

from uuid import UUID

from gatekeeper.contracts.rules import EffectiveRuleBinding, RuleBinding
from gatekeeper.contracts.scenarios import ScenarioType


# Select applicable defaults and replace them completely with same-key scenario rules.
def resolve_effective_rules(
    bindings: list[RuleBinding], scenario_id: UUID, scenario_type: ScenarioType
) -> list[EffectiveRuleBinding]:
    defaults = {
        binding.rule_key: binding
        for binding in bindings
        if binding.scenario_id is None and scenario_type in (binding.applies_to or [])
    }
    selected = dict(defaults)
    selected.update(
        (binding.rule_key, binding) for binding in bindings if binding.scenario_id == scenario_id
    )
    return [
        EffectiveRuleBinding(
            **binding.model_dump(),
            source="dataset" if binding.scenario_id is None else "scenario",
            overridden_rule_id=(
                defaults[key].id if binding.scenario_id is not None and key in defaults else None
            ),
        )
        for key, binding in selected.items()
    ]
