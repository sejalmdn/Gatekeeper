import { useId, useState, type ReactElement } from "react";
import { CopyButton } from "./CopyButton";
import { Icon } from "./Icon";

// Keeps long prompts compact while preserving line breaks and full-text copying.
export function CandidatePrompt({ prompt }: { prompt: string }): ReactElement {
  // Lets users expand long instructions without leaving the configuration overview.
  const [expanded, setExpanded] = useState(false);

  // Connects the disclosure button to this prompt's uniquely identified content.
  const contentId = useId();
  const collapsible = prompt.length > 600 || prompt.split("\n").length > 6;

  return (
    <section className="candidate-details__panel candidate-details__prompt">
      <header className="candidate-details__panel-header">
        <div className="candidate-details__panel-title">
          <Icon name="candidate" />
          <h2>System prompt</h2>
          <span className="candidate-details__count">
            {prompt.length.toLocaleString()} chars
          </span>
        </div>
        {prompt && <CopyButton value={prompt} label="Copy system prompt" />}
      </header>
      <div
        id={contentId}
        className={
          collapsible && !expanded
            ? "candidate-details__prompt-body candidate-details__prompt-body--collapsed"
            : "candidate-details__prompt-body"
        }
      >
        <p>{prompt || "No system prompt configured."}</p>
      </div>
      {collapsible && (
        <button
          className="candidate-details__expand"
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded(!expanded)}
        >
          <Icon name="chevron" />
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </section>
  );
}
