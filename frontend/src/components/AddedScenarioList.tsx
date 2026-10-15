import { useId, useState, type ReactElement } from "react";
import type { JsonObject, ScenarioCreate, ScenarioType } from "../types";
import "../styles/AddedScenarioList.css";

interface AddedScenarioListProps {
  scenarios: ScenarioCreate[];
  disabled: boolean;
  onRemove: (index: number) => void;
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// Format a scenario contract name for compact display.
function formatScenarioType(scenarioType: ScenarioType): string {
  const labels: Record<ScenarioType, string> = {
    single_turn: "Single turn",
    multi_turn: "Multi-turn",
    tool_use: "Tool use",
  };
  return labels[scenarioType];
}

// Read validated conversation history from a scenario input.
function historyFor(input: JsonObject): HistoryMessage[] {
  if (!Array.isArray(input.history)) return [];
  return input.history.flatMap((message) => {
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    ) {
      return [];
    }
    const values = message as Record<string, unknown>;
    if (
      (values.role !== "user" && values.role !== "assistant") ||
      typeof values.content !== "string"
    ) {
      return [];
    }
    return [
      {
        role: values.role,
        content: values.content,
      },
    ];
  });
}

// Shows added scenarios with one read-only detail row expanded at a time.
export function AddedScenarioList({
  scenarios,
  disabled,
  onRemove,
}: AddedScenarioListProps): ReactElement {
  // Provides stable relationships between each row and its detail region.
  const listId = useId();

  // Tracks the single row currently expanded for inspection.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Requires an explicit second action before removing an added scenario.
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);

  // Toggle one detail region and close any pending removal choice.
  function toggleScenario(index: number): void {
    setExpandedIndex((current) => (current === index ? null : index));
    setConfirmingIndex(null);
  }

  // Remove the chosen scenario and return the list to its collapsed state.
  function confirmRemoval(index: number): void {
    onRemove(index);
    setExpandedIndex(null);
    setConfirmingIndex(null);
  }

  return (
    <section className="added-scenarios" aria-labelledby={`${listId}-title`}>
      <div className="added-scenarios__heading">
        <h2 id={`${listId}-title`}>Added scenarios</h2>
      </div>
      <div className="added-scenarios__scroll" aria-live="polite">
        {scenarios.length === 0 ? (
          <p className="added-scenarios__empty">
            Added scenarios will appear here.
          </p>
        ) : (
          <ul className="added-scenarios__list">
            {scenarios.map((scenario, index) => {
              const expanded = expandedIndex === index;
              const detailsId = `${listId}-details-${index}`;
              const history = historyFor(scenario.input);
              const userMessage =
                typeof scenario.input.user_message === "string"
                  ? scenario.input.user_message
                  : "";
              return (
                <li key={`${scenario.scenario_key}-${index}`}>
                  <button
                    className="added-scenarios__row"
                    type="button"
                    onClick={() => toggleScenario(index)}
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    disabled={disabled}
                  >
                    <span>{scenario.scenario_key}</span>
                    <span>{formatScenarioType(scenario.scenario_type)}</span>
                  </button>
                  {expanded && (
                    <div className="added-scenarios__details" id={detailsId}>
                      <dl>
                        <div>
                          <dt>Name</dt>
                          <dd>{scenario.name}</dd>
                        </div>
                        <div>
                          <dt>User message</dt>
                          <dd>{userMessage}</dd>
                        </div>
                        {history.length > 0 && (
                          <div>
                            <dt>Conversation history</dt>
                            <dd>
                              <ol className="added-scenarios__history">
                                {history.map((message, messageIndex) => (
                                  <li key={`${message.role}-${messageIndex}`}>
                                    <strong>
                                      {message.role === "user"
                                        ? "User"
                                        : "Assistant"}
                                    </strong>
                                    <span>{message.content}</span>
                                  </li>
                                ))}
                              </ol>
                            </dd>
                          </div>
                        )}
                      </dl>
                      {confirmingIndex === index ? (
                        <div className="added-scenarios__confirmation">
                          <span>Remove this scenario?</span>
                          <button
                            className="quiet-button"
                            type="button"
                            onClick={() => setConfirmingIndex(null)}
                            disabled={disabled}
                          >
                            Keep
                          </button>
                          <button
                            className="added-scenarios__confirm"
                            type="button"
                            onClick={() => confirmRemoval(index)}
                            disabled={disabled}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <button
                          className="quiet-button added-scenarios__remove"
                          type="button"
                          onClick={() => setConfirmingIndex(index)}
                          disabled={disabled}
                        >
                          Remove scenario
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
