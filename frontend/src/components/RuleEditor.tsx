import { useRef, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, createRuleBinding } from "../api";
import type {
  Dataset,
  RuleBinding,
  RuleBindingCreate,
  Scenario,
  ScenarioType,
} from "../types";
import {
  initialRuleDraft,
  RULE_DEFINITIONS,
  serializeParameters,
  summarizeRule,
  validateBindingScope,
} from "../utils/rules";
import { messageFor } from "../utils/format";
import { RecordForm } from "./RecordForm";
import { RuleParameterFields } from "./RuleParameterFields";
import "../styles/RuleForm.css";

interface RuleEditorProps {
  projectId: string;
  dataset: Dataset;
  scenarios: Scenario[];
  bindings: RuleBinding[];
  initialScenarioId: string;
}

// Defines a check and its binding together while keeping private expectations out of inputs.
export function RuleEditor({
  projectId,
  dataset,
  scenarios,
  bindings,
  initialScenarioId,
}: RuleEditorProps): ReactElement {
  const initialScenario = scenarios.find(
    (scenario) => scenario.id === initialScenarioId,
  );
  const initialDefinition = RULE_DEFINITIONS.find((item) =>
    item.types.includes(initialScenario?.scenario_type ?? "single_turn"),
  )!;
  const navigate = useNavigate();
  const back = `/projects/${projectId}/datasets/${dataset.id}?tab=rules`;

  // Holds the chosen scenario or the dataset-default scope.
  const [scenarioId, setScenarioId] = useState(initialScenarioId);

  // Selects the built-in check and its independent parameter draft.
  const [definition, setDefinition] = useState(initialDefinition);

  // Preserves unfinished expectations through validation and server failures.
  const [draft, setDraft] = useState(() => initialRuleDraft(initialDefinition));

  // Records the compatible scenario types for a dataset-level default.
  const [appliesTo, setAppliesTo] = useState<ScenarioType[]>(["single_turn"]);

  // Identifies the logical rule used for duplicates and scenario overrides.
  const [ruleKey, setRuleKey] = useState("");

  // Determines whether results control passing, contribute scores, or only report.
  const [role, setRole] = useState<RuleBindingCreate["role"]>("required");

  // Records product-defined importance without exposing custom scoring weights.
  const [severity, setSeverity] =
    useState<RuleBindingCreate["severity"]>("medium");

  // Surfaces local and backend validation failures without discarding edits.
  const [error, setError] = useState<string>();

  // Locks the form until its create request finishes.
  const [saving, setSaving] = useState(false);

  // Prevents duplicate submissions before the pending render is applied.
  const submitting = useRef(false);

  const scenario = scenarios.find((item) => item.id === scenarioId);
  const compatible = RULE_DEFINITIONS.filter(
    (item) => !scenario || item.types.includes(scenario.scenario_type),
  );
  const defaultRule = bindings.find(
    (binding) =>
      binding.scenario_id === null &&
      binding.rule_key === ruleKey &&
      scenario &&
      binding.applies_to?.includes(scenario.scenario_type),
  );
  let preview = "Complete the check parameters to preview its condition.";
  try {
    preview = summarizeRule(
      definition.type,
      serializeParameters(definition, draft),
    );
  } catch {
    /* Incomplete input is expected while defining a condition. */
  }

  // Reset parameter shape only when choosing a different built-in check.
  function chooseDefinition(type: string): void {
    const next = RULE_DEFINITIONS.find((item) => item.type === type)!;
    setDefinition(next);
    setDraft(initialRuleDraft(next));
    setAppliesTo((current) => {
      const retained = current.filter((item) => next.types.includes(item));
      return retained.length ? retained : [...next.types];
    });
    setError(undefined);
  }

  // Keep scenario-scoped checks compatible when the target scope changes.
  function chooseScope(id: string): void {
    setScenarioId(id);
    const target = scenarios.find((item) => item.id === id);
    if (target && !definition.types.includes(target.scenario_type)) {
      chooseDefinition(
        RULE_DEFINITIONS.find((item) =>
          item.types.includes(target.scenario_type),
        )!.type,
      );
    }
    setError(undefined);
  }

  // Persist validated private configuration; backend remains authoritative for racing writes.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    setError(undefined);
    try {
      if (scenarioId && !scenario)
        throw new Error("Select a scenario from this dataset.");
      const payload: RuleBindingCreate = {
        scenario_id: scenarioId || null,
        rule_key: ruleKey,
        rule_type: definition.type,
        role,
        severity,
        parameters: serializeParameters(definition, draft),
        applies_to: scenarioId ? null : appliesTo,
      };
      validateBindingScope(payload, bindings);
      submitting.current = true;
      setSaving(true);
      await createRuleBinding(projectId, dataset.id, payload);
      navigate(back);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setError(
          "This rule key already exists in the selected scope. Choose another key.",
        );
      } else {
        setError(messageFor(failure));
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title="Add rule"
      detail={`Define a private evaluation check for ${dataset.name}.`}
      submitLabel="Save rule"
      pendingLabel="Saving rule…"
      caption="Private evaluation configuration"
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={() => navigate(back)}
      className="rule-form"
    >
      <fieldset className="rule-form__section" disabled={saving}>
        <legend>Apply to</legend>
        <label className="form-field" htmlFor="rule-scope">
          <span>Scope</span>
          <select
            id="rule-scope"
            value={scenarioId}
            onChange={(event) => chooseScope(event.target.value)}
          >
            <option value="">Dataset default</option>
            {scenarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.scenario_key})
              </option>
            ))}
          </select>
        </label>
        {scenario && (
          <p>
            Applies only to this {scenario.scenario_type.replaceAll("_", " ")}{" "}
            scenario.
          </p>
        )}
        {!scenarioId && (
          <fieldset>
            <legend>Applicable scenario types</legend>
            {(["single_turn", "multi_turn", "tool_use"] as ScenarioType[]).map(
              (type) => (
                <label className="rule-form__check" key={type}>
                  <input
                    type="checkbox"
                    checked={appliesTo.includes(type)}
                    disabled={!definition.types.includes(type)}
                    onChange={(event) =>
                      setAppliesTo((current) =>
                        event.target.checked
                          ? [...current, type]
                          : current.filter((item) => item !== type),
                      )
                    }
                  />
                  {type.replaceAll("_", " ")}
                </label>
              ),
            )}
            <p>Available types depend on the selected check.</p>
          </fieldset>
        )}
      </fieldset>
      <fieldset className="rule-form__section" disabled={saving}>
        <legend>Check</legend>
        <label className="form-field" htmlFor="rule-type">
          <span>Check type</span>
          <select
            id="rule-type"
            value={definition.type}
            onChange={(event) => chooseDefinition(event.target.value)}
          >
            {compatible.map((item) => (
              <option key={item.type} value={item.type}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <RuleParameterFields
          disabled={saving}
          definition={definition}
          draft={draft}
          onChange={setDraft}
        />
      </fieldset>
      <fieldset className="rule-form__section" disabled={saving}>
        <legend>Result behavior</legend>
        <label className="form-field" htmlFor="rule-key">
          <span>Rule key</span>
          <input
            id="rule-key"
            value={ruleKey}
            required
            onChange={(event) => setRuleKey(event.target.value)}
          />
          <small>
            Unique in this scope. Reuse a dataset default’s key to replace it
            for one scenario.
          </small>
        </label>
        <label className="form-field" htmlFor="rule-role">
          <span>Role</span>
          <select
            id="rule-role"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as RuleBindingCreate["role"])
            }
          >
            <option value="required">Required — controls pass/fail</option>
            <option value="scored">Scored — contributes to scoring</option>
            <option value="informational">
              Informational — observations only
            </option>
          </select>
        </label>
        <label className="form-field" htmlFor="rule-severity">
          <span>Severity</span>
          <select
            id="rule-severity"
            value={severity}
            onChange={(event) =>
              setSeverity(event.target.value as RuleBindingCreate["severity"])
            }
          >
            {["critical", "high", "medium", "low"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <small>
            Scored rules use fixed weights: critical 4, high 3, medium 2, low 1.
          </small>
        </label>
      </fieldset>
      <aside className="rule-form__preview" aria-live="polite">
        <h2>Rule preview</h2>
        <p>{preview}</p>
        <p>
          {scenario
            ? `Applies to ${scenario.name}.`
            : `Dataset default for ${appliesTo.join(", ") || "no selected types"}.`}
        </p>
        {defaultRule && (
          <p>
            This rule completely replaces dataset default “{ruleKey}” for this
            scenario.
          </p>
        )}
        <small>
          Saving defines the check. Evaluation results will be available when
          execution is implemented.
        </small>
      </aside>
    </RecordForm>
  );
}
