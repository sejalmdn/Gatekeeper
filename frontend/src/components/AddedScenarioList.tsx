import { useId, useState, type ReactElement } from "react";
import type { JsonObject, ScenarioCreate, ScenarioType } from "../types";
import { Icon } from "./Icon";
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

// Shows scenario summaries and their ordered input conversations for review.
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
        <div>
          <h2 id={`${listId}-title`}>
            Added scenarios
            <span className="added-scenarios__count">{scenarios.length}</span>
          </h2>
          <p>Review each input before creating the dataset.</p>
        </div>
      </div>
      <div className="added-scenarios__scroll">
        {scenarios.length === 0 ? (
          <div className="added-scenarios__empty">
            <Icon name="dataset" />
            <strong>No scenarios added yet</strong>
            <p>
              Complete the form above and select Add scenario to start your
              dataset.
            </p>
          </div>
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
                <li
                  className="added-scenarios__item"
                  key={`${scenario.scenario_key}-${index}`}
                >
                  <button
                    className="added-scenarios__row"
                    type="button"
                    onClick={() => toggleScenario(index)}
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    disabled={disabled}
                  >
                    <span className="added-scenarios__summary">
                      <span className="added-scenarios__identity">
                        <strong>{scenario.name}</strong>
                        <span className="added-scenarios__type">
                          {formatScenarioType(scenario.scenario_type)}
                        </span>
                      </span>
                      <span className="added-scenarios__metadata">
                        <code>{scenario.scenario_key}</code>
                        <span>
                          {history.length > 0
                            ? `${history.length} earlier ${history.length === 1 ? "message" : "messages"}`
                            : "No conversation history"}
                        </span>
                      </span>
                      <span className="added-scenarios__preview">
                        {userMessage}
                      </span>
                    </span>
                    <span className="added-scenarios__disclosure">
                      <Icon name="chevron" />
                    </span>
                  </button>
                  {expanded && (
                    <div className="added-scenarios__details" id={detailsId}>
                      <h3>Conversation input</h3>
                      <ol className="added-scenarios__conversation">
                        {history.map((message, messageIndex) => (
                          <li
                            className="added-scenarios__message"
                            key={`${message.role}-${messageIndex}`}
                          >
                            <div className="added-scenarios__message-label">
                              <strong>
                                {message.role === "user" ? "User" : "Assistant"}
                              </strong>
                              <span>History</span>
                            </div>
                            <p>{message.content}</p>
                          </li>
                        ))}
                        <li className="added-scenarios__message added-scenarios__message--current">
                          <div className="added-scenarios__message-label">
                            <strong>User</strong>
                            <span>New message</span>
                          </div>
                          <p>{userMessage}</p>
                        </li>
                      </ol>
                      <div className="added-scenarios__footer">
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
