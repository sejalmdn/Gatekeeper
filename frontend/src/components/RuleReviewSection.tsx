import type { ReactElement } from "react";

interface RuleReviewSectionProps {
  ruleKey: string;
  summary: string;
  showSummary: boolean;
  saving: boolean;
  error?: string;
  sectionRef: (node: HTMLDetailsElement | null) => void;
  onRuleKeyChange: (ruleKey: string) => void;
  onCancel: () => void;
}

// Names and summarizes the complete rule beside its save and cancel actions.
export function RuleReviewSection({
  ruleKey,
  summary,
  showSummary,
  saving,
  error,
  sectionRef,
  onRuleKeyChange,
  onCancel,
}: RuleReviewSectionProps): ReactElement {
  return (
    <details
      className="rule-form__section rule-form__review"
      open
      ref={sectionRef}
    >
      <summary>
        <span>5. Review</span>
      </summary>
      <fieldset disabled={saving}>
        <legend className="rule-form__visually-hidden">Review rule</legend>
        <label className="form-field" htmlFor="rule-key">
          <span>Rule name</span>
          <input
            id="rule-key"
            value={ruleKey}
            onChange={(event) => onRuleKeyChange(event.target.value)}
          />
          <small>Names are unique within the selected scenario.</small>
        </label>
        {showSummary && (
          <div className="rule-form__review-summary" aria-live="polite">
            <h3>Rule summary</h3>
            <p>{summary}</p>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="rule-form__submit-actions">
          <button
            className="quiet-button"
            type="button"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving rule…" : "Save rule"}
          </button>
        </div>
      </fieldset>
    </details>
  );
}
