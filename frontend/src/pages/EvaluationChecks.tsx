import type { ReactElement } from "react";
import { Notice } from "../components/Feedback";
import { PageHeading } from "../components/PageHeading";
import type { ScenarioType } from "../types";
import {
  RULE_CATEGORIES,
  RULE_DEFINITIONS,
  type AuthorableRuleType,
} from "../utils/rules";
import "../styles/EvaluationChecks.css";

interface CheckDetail {
  purpose: string;
  configuration: string;
}

const CHECK_DETAILS: Record<AuthorableRuleType, CheckDetail> = {
  "judge.rubric": {
    purpose:
      "Assesses response meaning against a private criterion using the fixed LLM judge.",
    configuration:
      "Criterion and minimum score (1–5). Multi-turn presets cover history values, earlier references, and conversation state.",
  },
  "response.required_text": {
    purpose: "Checks that the response includes the expected phrases.",
    configuration: "Required phrases, match mode, and case sensitivity.",
  },
  "response.forbidden_text": {
    purpose: "Checks that the response omits disallowed phrases.",
    configuration: "Forbidden phrases and case sensitivity.",
  },
  "response.regex": {
    purpose: "Checks the response against a Python regular expression.",
    configuration: "Pattern and search or full-match mode.",
  },
  "response.json_valid": {
    purpose: "Checks that the response can be parsed as JSON.",
    configuration: "No additional configuration.",
  },
  "response.json_schema": {
    purpose: "Checks that the parsed response conforms to a JSON Schema.",
    configuration: "JSON Schema document.",
  },
  "response.json_field": {
    purpose:
      "Checks a field in the parsed response with a JSON Pointer assertion.",
    configuration: "JSON Pointer, operator, and expected value or range.",
  },
  "response.length": {
    purpose: "Checks that the response length stays within a configured range.",
    configuration: "Character or word unit, with a minimum, maximum, or both.",
  },
  "metric.latency": {
    purpose: "Checks that observed response latency does not exceed a limit.",
    configuration: "Maximum latency in milliseconds.",
  },
  "metric.tokens": {
    purpose:
      "Checks reported input, output, or total token usage against limits.",
    configuration: "One or more maximum token counts.",
  },
  "metric.cost": {
    purpose: "Checks that the derived candidate cost does not exceed a limit.",
    configuration: "Maximum cost in USD.",
  },
  "tool.selection": {
    purpose: "Checks which tools the candidate requested.",
    configuration: "Required, allowed, or forbidden tool names.",
  },
  "tool.argument_field": {
    purpose: "Checks one argument field on a request to a named tool.",
    configuration:
      "Tool name, JSON Pointer, operator, and expected value or range.",
  },
  "tool.expected_calls": {
    purpose: "Checks the expected set of tool requests and their arguments.",
    configuration: "Expected calls and whether additional calls are allowed.",
  },
};

const CATEGORY_NOTES: Partial<Record<string, string>> = {
  "Semantic quality":
    "An external judge receives conversation content, candidate responses, and criteria. Use non-confidential development data. Judge usage and costs stay separate from candidate metrics.",
  "Tool requests":
    "Tool checks verify requests, not tool execution. Gatekeeper automatically validates requested arguments against the tool schemas declared by the candidate.",
};

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  single_turn: "Single turn",
  multi_turn: "Multi-turn",
  tool_use: "Tool use",
};

// Explains available deterministic and semantic checks and their evidence boundaries.
export function EvaluationChecks(): ReactElement {
  const definitions = new Map(
    RULE_DEFINITIONS.map((definition) => [definition.type, definition]),
  );
  return (
    <section className="page-content evaluation-checks">
      <PageHeading
        title="Evaluation checks"
        detail="What each rule checks and which scenario types it supports."
      />
      <Notice>
        Expectations stay private and never enter candidate requests. Missing
        required evidence yields cannot_evaluate. Semantic rubrics return a 1–5
        score and reason; Gatekeeper applies the saved minimum score to
        determine pass or fail.
      </Notice>
      <div className="evaluation-checks__categories">
        {RULE_CATEGORIES.map((category) => (
          <section
            className="evaluation-checks__panel"
            aria-labelledby={`evaluation-checks-${category.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`}
            key={category.label}
          >
            <h2
              id={`evaluation-checks-${category.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`}
            >
              {category.label}
            </h2>
            <div className="evaluation-checks__table-scroll">
              <table>
                <colgroup>
                  <col className="evaluation-checks__check-column" />
                  <col className="evaluation-checks__purpose-column" />
                  <col className="evaluation-checks__configuration-column" />
                  <col className="evaluation-checks__scenarios-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Check</th>
                    <th scope="col">What it checks</th>
                    <th scope="col">Configuration</th>
                    <th scope="col">Supported scenarios</th>
                  </tr>
                </thead>
                <tbody>
                  {category.types.map((ruleType) => {
                    const definition = definitions.get(ruleType);
                    if (!definition) return null;
                    const detail = CHECK_DETAILS[ruleType];
                    return (
                      <tr key={ruleType}>
                        <th scope="row">{definition.label}</th>
                        <td>{detail.purpose}</td>
                        <td>{detail.configuration}</td>
                        <td>
                          <div
                            className="evaluation-checks__scenarios"
                            aria-label={`${definition.label} scenario types`}
                          >
                            {definition.types.map((scenarioType) => (
                              <span
                                className="badge badge-cyan"
                                key={scenarioType}
                              >
                                {SCENARIO_LABELS[scenarioType]}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {CATEGORY_NOTES[category.label] && (
              <p className="evaluation-checks__panel-note">
                {CATEGORY_NOTES[category.label]}
              </p>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
