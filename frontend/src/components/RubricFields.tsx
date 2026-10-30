import type { ReactElement } from "react";
import type { RuleDraft } from "../utils/rules";
import { MULTI_TURN_RUBRIC_PRESETS } from "../utils/rubrics";
import "../styles/RubricFields.css";

// Authors a private criterion with optional multi-turn guidance and a local passing threshold.
export function RubricFields({
  draft,
  multiTurn,
  onChange,
}: {
  draft: RuleDraft;
  multiTurn: boolean;
  onChange: (draft: RuleDraft) => void;
}): ReactElement {
  const preset = MULTI_TURN_RUBRIC_PRESETS.find(
    (item) => item.id === draft.fields.rubric_preset,
  );

  // Preserve the criterion and threshold when selecting a different preset focus.
  function update(key: string, value: string): void {
    onChange({
      ...draft,
      fields: {
        ...draft.fields,
        [key]: value,
      },
    });
  }

  return (
    <div className="rubric-fields">
      {multiTurn && (
        <label className="form-field" htmlFor="rubric-preset">
          <span>Rubric preset</span>
          <select
            id="rubric-preset"
            value={draft.fields.rubric_preset ?? ""}
            onChange={(event) => update("rubric_preset", event.target.value)}
          >
            <option value="">Custom criterion</option>
            {MULTI_TURN_RUBRIC_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="form-field" htmlFor="rule-param-criterion">
        <span>Criterion</span>
        <small id="rubric-criterion-help">
          {preset?.guidance ??
            "Describe precisely what a good response must do."}
          {preset &&
            " The preset focus is included with your expectation when saved."}
        </small>
        <textarea
          id="rule-param-criterion"
          aria-describedby="rubric-criterion-help"
          required
          value={draft.fields.criterion ?? ""}
          placeholder={
            preset?.example ??
            "Explain the refund policy clearly and address the customer's question."
          }
          onChange={(event) => update("criterion", event.target.value)}
        />
      </label>
      <label className="form-field" htmlFor="rule-param-min_score">
        <span>Minimum passing score</span>
        <input
          id="rule-param-min_score"
          type="number"
          min={1}
          max={5}
          step={1}
          required
          value={draft.fields.min_score ?? ""}
          onChange={(event) => update("min_score", event.target.value)}
          aria-describedby="rubric-scale"
        />
      </label>
      <p id="rubric-scale" className="rubric-fields__scale">
        Judge scale: 1 — does not satisfy; 2 — major shortcomings; 3 — partially
        satisfies; 4 — minor shortcomings; 5 — fully satisfies. The response
        passes when its score meets the minimum. This score is separate from the
        weighted aggregate score.
      </p>
      <p className="rubric-fields__disclosure">
        An external judge receives the conversation, candidate response, and
        criterion. Use non-confidential development data. The criterion stays
        out of candidate requests.
      </p>
    </div>
  );
}
