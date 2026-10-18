import { useState, type ReactElement } from "react";
import { Icon } from "./Icon";
import { JsonInput } from "./JsonInput";
import type { ScenarioCreate, ScenarioType } from "../types";
import {
  initialScenarioFields,
  prepareScenarioAddition,
  scenarioPlaceholders,
  type ScenarioFields,
} from "../utils/scenarioComposer";
import "../styles/ScenarioEditor.css";

interface ScenarioEditorProps {
  scenarios: ScenarioCreate[];
  disabled: boolean;
  onAdd: (scenario: ScenarioCreate) => void;
}

// Composes one type-aware scenario before adding it to the dataset.
export function ScenarioEditor({
  scenarios,
  disabled,
  onAdd,
}: ScenarioEditorProps): ReactElement {
  // Holds editor input independently from the added scenario collection.
  const [fields, setFields] = useState<ScenarioFields>(initialScenarioFields);

  // Shows local validation without affecting already added scenarios.
  const [error, setError] = useState<string>();

  // Keeps unfinished scenario input available while the editor is collapsed.
  const [collapsed, setCollapsed] = useState(false);

  const placeholders = scenarioPlaceholders(fields.scenarioType);

  // Update one editor field without discarding the other entered values.
  function updateField<Key extends keyof ScenarioFields>(
    key: Key,
    value: ScenarioFields[Key],
  ): void {
    setFields((current) => ({
      ...current,
      [key]: value,
    }));
    setError(undefined);
  }

  // Validate and add the scenario, resetting fields only after success.
  function addScenario(): void {
    try {
      const addition = prepareScenarioAddition(fields, scenarios);
      onAdd(addition.scenario);
      setFields(addition.nextFields);
      setError(undefined);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "The scenario is invalid.",
      );
    }
  }

  return (
    <section
      className="scenario-editor"
      aria-labelledby="scenario-editor-title"
    >
      <div className="scenario-editor__heading">
        <h2 id="scenario-editor-title">Scenario editor</h2>
        <button
          className="scenario-editor__toggle"
          type="button"
          aria-label={collapsed ? "Expand form" : "Collapse form"}
          title={collapsed ? "Expand form" : "Collapse form"}
          aria-expanded={!collapsed}
          aria-controls="scenario-editor-content"
          onClick={() => setCollapsed((current) => !current)}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <div id="scenario-editor-content" hidden={collapsed}>
        <div className="scenario-editor__fields">
          <label className="form-field" htmlFor="scenario-key">
            <span>Scenario key</span>
            <input
              id="scenario-key"
              value={fields.scenarioKey}
              onChange={(event) =>
                updateField("scenarioKey", event.target.value)
              }
              placeholder={placeholders.scenarioKey}
              disabled={disabled}
            />
          </label>
          <label className="form-field" htmlFor="scenario-name">
            <span>Scenario name</span>
            <input
              id="scenario-name"
              value={fields.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder={placeholders.name}
              disabled={disabled}
            />
          </label>
          <label className="form-field" htmlFor="scenario-type">
            <span>Scenario type</span>
            <select
              id="scenario-type"
              value={fields.scenarioType}
              onChange={(event) =>
                updateField("scenarioType", event.target.value as ScenarioType)
              }
              disabled={disabled}
            >
              <option value="single_turn">Single turn</option>
              <option value="multi_turn">Multi-turn</option>
              <option value="tool_use">Tool use</option>
            </select>
          </label>
          {fields.scenarioType !== "single_turn" && (
            <div className="scenario-editor__history">
              <JsonInput
                id="scenario-history"
                label="Conversation history"
                help={
                  fields.scenarioType === "multi_turn"
                    ? "A non-empty JSON array of user and assistant messages."
                    : "An optional JSON array of earlier user and assistant messages."
                }
                value={fields.history}
                onChange={(value) => updateField("history", value)}
                placeholder={JSON.stringify(
                  JSON.parse(placeholders.history),
                  null,
                  2,
                )}
                required={fields.scenarioType === "multi_turn"}
                disabled={disabled}
                actions={
                  <button
                    className="quiet-button json-input__format"
                    type="button"
                    disabled={disabled || Boolean(fields.history.trim())}
                    title="Insert the example into an empty history field"
                    onClick={() =>
                      updateField(
                        "history",
                        JSON.stringify(JSON.parse(placeholders.history), null, 2),
                      )
                    }
                  >
                    Add sample history
                  </button>
                }
              />
            </div>
          )}
          <label
            className="form-field scenario-editor__message"
            htmlFor="user-message"
          >
            <span>User message</span>
            <textarea
              id="user-message"
              value={fields.userMessage}
              onChange={(event) =>
                updateField("userMessage", event.target.value)
              }
              placeholder={placeholders.userMessage}
              disabled={disabled}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="scenario-editor__actions">
          <button type="button" onClick={addScenario} disabled={disabled}>
            Add scenario
          </button>
        </div>
      </div>
    </section>
  );
}
