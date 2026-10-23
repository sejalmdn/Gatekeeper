import { useRef, useState, type FormEvent, type ReactElement } from "react";
import { ApiError, createRuleBinding } from "../api";
import type {
  Dataset,
  RuleBinding,
  RuleBindingCreate,
  Scenario,
} from "../types";
import { messageFor } from "../utils/format";
import {
  initialRuleDraft,
  RULE_DEFINITIONS,
  RULE_SEVERITY_OPTIONS,
  serializeParameters,
  summarizeRule,
  validateBindingScope,
  type RuleDefinition,
  type RuleDraft,
} from "../utils/rules";
import { RuleCheckSection } from "./RuleCheckSection";
import { RuleEffectSection } from "./RuleEffectSection";
import { RuleExpectationSection } from "./RuleExpectationSection";
import { RuleReviewSection } from "./RuleReviewSection";
import { RuleScopeSection } from "./RuleScopeSection";
import "../styles/RuleForm.css";

interface RuleEditorProps {
  projectId: string;
  dataset: Dataset;
  scenarios: Scenario[];
  bindings: RuleBinding[];
  initialScenarioId: string;
  onCancel: () => void;
  onSaved: () => void;
}

type SectionId = "scope" | "check" | "expectation" | "effect" | "review";

interface FormError {
  section: SectionId;
  message: string;
}

// Defines a private check through five collapsible, state-preserving sections.
export function RuleEditor({
  projectId,
  dataset,
  scenarios,
  bindings,
  initialScenarioId,
  onCancel,
  onSaved,
}: RuleEditorProps): ReactElement {
  const initialScenario = scenarios.find(
    (scenario) => scenario.id === initialScenarioId,
  );

  // Keeps the rule bound to one explicitly selected scenario.
  const [scenarioId, setScenarioId] = useState(initialScenario?.id ?? "");

  // Holds the selected built-in check until a scope makes it incompatible.
  const [definition, setDefinition] = useState<RuleDefinition>();

  // Preserves the selected check's parameters while sections collapse.
  const [draft, setDraft] = useState<RuleDraft>();

  // Identifies the rule within the selected scenario.
  const [ruleKey, setRuleKey] = useState("");

  // Determines whether failure controls passing, scoring, or reporting.
  const [role, setRole] = useState<RuleBindingCreate["role"]>("required");

  // Preserves the scored-rule weight while other roles use the neutral API value.
  const [severity, setSeverity] =
    useState<RuleBindingCreate["severity"]>("medium");

  // Places validation and request feedback in the relevant section.
  const [error, setError] = useState<FormError>();

  // Locks all authoring controls until a create request finishes.
  const [saving, setSaving] = useState(false);

  // Prevents a second submit before React applies the pending state.
  const submitting = useRef(false);

  // Opens the first invalid section even when the user collapsed it.
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDetailsElement>>>(
    {},
  );

  const scenario = scenarios.find((item) => item.id === scenarioId);
  const compatibleDefinitions = RULE_DEFINITIONS.filter((item) =>
    scenario ? item.types.includes(scenario.scenario_type) : false,
  );

  let expectation = "Choose a check to configure its expectation.";
  if (definition && draft) {
    try {
      expectation = summarizeRule(
        definition.type,
        serializeParameters(definition, draft),
      );
    } catch {
      expectation = `${definition.label} needs more information.`;
    }
  }

  const scopeReview = scenario
    ? `only ${scenario.name}`
    : "a selected scenario";
  const effectReview =
    role === "required"
      ? "causes the scenario to fail"
      : role === "scored"
        ? "contributes to scoring"
        : "is reported only";
  const severityOption = RULE_SEVERITY_OPTIONS.find(
    (option) => option.value === severity,
  );
  const submittedSeverity = role === "scored" ? severity : "medium";

  // Opens a section and associates a specific error with it.
  function showError(section: SectionId, message: string): void {
    const target = sectionRefs.current[section];
    if (target) target.open = true;
    setError({ section, message });
  }

  // Retains expectations when the newly selected scenario supports the check.
  function chooseScenario(nextScenarioId: string): void {
    const nextScenario = scenarios.find((item) => item.id === nextScenarioId);
    setScenarioId(nextScenarioId);
    if (
      !nextScenario ||
      (definition && !definition.types.includes(nextScenario.scenario_type))
    ) {
      setDefinition(undefined);
      setDraft(undefined);
    }
    setError(undefined);
  }

  // Starts a clean parameter draft when the user deliberately selects a check.
  function chooseDefinition(type: string): void {
    const next = RULE_DEFINITIONS.find((item) => item.type === type);
    setDefinition(next);
    setDraft(next ? initialRuleDraft(next) : undefined);
    setError(undefined);
  }

  // Persists validated private configuration while retaining failed drafts.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    setError(undefined);

    if (!scenario) {
      showError(
        "scope",
        "Choose the specific scenario this rule should apply to.",
      );
      return;
    }
    if (!definition || !draft) {
      showError("check", "Choose what Gatekeeper should check.");
      return;
    }

    let parameters: RuleBindingCreate["parameters"];
    try {
      parameters = serializeParameters(definition, draft);
    } catch (failure) {
      showError("expectation", messageFor(failure));
      return;
    }

    const payload: RuleBindingCreate = {
      scenario_id: scenarioId,
      rule_key: ruleKey,
      rule_type: definition.type,
      role,
      severity: submittedSeverity,
      parameters,
      applies_to: null,
    };
    try {
      validateBindingScope(payload, bindings);
    } catch (failure) {
      showError("review", messageFor(failure));
      return;
    }

    submitting.current = true;
    setSaving(true);
    try {
      await createRuleBinding(projectId, dataset.id, payload);
      onSaved();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        showError(
          "review",
          "This rule name already exists for this scenario. Choose another name.",
        );
      } else {
        showError("review", messageFor(failure));
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  let showReviewSummary = false;
  if (ruleKey.trim() && definition && draft && scenario) {
    try {
      validateBindingScope(
        {
          scenario_id: scenarioId,
          rule_key: ruleKey,
          rule_type: definition.type,
          role,
          severity: submittedSeverity,
          parameters: serializeParameters(definition, draft),
          applies_to: null,
        },
        bindings,
      );
      showReviewSummary = true;
    } catch {
      showReviewSummary = false;
    }
  }
  const weightReview =
    role === "scored" && severityOption
      ? ` with ${severityOption.label} weight (${severityOption.weight})`
      : "";
  const reviewSummary = `“${ruleKey}” applies to ${scopeReview}. It checks: ${expectation} A failure ${effectReview}${weightReview}.`;
  return (
    <form
      className="rule-form rule-form--embedded"
      onSubmit={submit}
      aria-busy={saving}
      noValidate
    >
      <RuleScopeSection
        scenarioId={scenarioId}
        scenarios={scenarios}
        saving={saving}
        error={error?.section === "scope" ? error.message : undefined}
        sectionRef={(node) => {
          if (node) sectionRefs.current.scope = node;
        }}
        onScenarioChange={chooseScenario}
      />
      <RuleCheckSection
        scenario={scenario}
        compatibleDefinitions={compatibleDefinitions}
        definition={definition}
        saving={saving}
        error={error?.section === "check" ? error.message : undefined}
        sectionRef={(node) => {
          if (node) sectionRefs.current.check = node;
        }}
        onChoose={chooseDefinition}
      />
      <RuleExpectationSection
        definition={definition}
        draft={draft}
        saving={saving}
        error={error?.section === "expectation" ? error.message : undefined}
        sectionRef={(node) => {
          if (node) sectionRefs.current.expectation = node;
        }}
        onChange={setDraft}
      />
      <RuleEffectSection
        role={role}
        severity={severity}
        saving={saving}
        error={error?.section === "effect" ? error.message : undefined}
        sectionRef={(node) => {
          if (node) sectionRefs.current.effect = node;
        }}
        onRoleChange={setRole}
        onSeverityChange={setSeverity}
      />
      <RuleReviewSection
        ruleKey={ruleKey}
        summary={reviewSummary}
        showSummary={showReviewSummary}
        saving={saving}
        error={error?.section === "review" ? error.message : undefined}
        sectionRef={(node) => {
          if (node) sectionRefs.current.review = node;
        }}
        onRuleKeyChange={setRuleKey}
        onCancel={onCancel}
      />
    </form>
  );
}
