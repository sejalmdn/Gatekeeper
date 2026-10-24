import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import type { Dataset } from "../types";
import { Icon } from "./Icon";
import "../styles/DatasetHeader.css";

interface DatasetHeaderProps {
  dataset: Dataset;
  projectId: string;
  scenarioCount: number;
  ruleCount?: number;
  coveredScenarioCount?: number;
}

// Frames a dataset with its identity, rule coverage, and creation metadata.
export function DatasetHeader({
  dataset,
  projectId,
  scenarioCount,
  ruleCount,
  coveredScenarioCount,
}: DatasetHeaderProps): ReactElement {
  const createdAt = new Date(dataset.created_at);
  const date = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(createdAt);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(createdAt);

  return (
    <header className="dataset-header">
      <div className="dataset-header__identity">
        <div>
          <h1>{dataset.name}</h1>
          {dataset.description && <p>{dataset.description}</p>}
        </div>
        <Link
          className="dataset-header__back button-secondary button"
          to={`/projects/${projectId}/datasets`}
        >
          <Icon name="arrow" />
          Back to datasets
        </Link>
      </div>
      <dl className="dataset-header__stats">
        <div>
          <dt>Total scenarios</dt>
          <dd className="dataset-header__value">{scenarioCount}</dd>
        </div>
        <div>
          <dt>Total rules</dt>
          <dd className="dataset-header__value dataset-header__value--rules">
            {ruleCount ?? "—"}
          </dd>
        </div>
        <div>
          <dt>Rule coverage</dt>
          <dd className="dataset-header__value dataset-header__value--coverage">
            {coveredScenarioCount === undefined
              ? "—"
              : `${coveredScenarioCount} of ${scenarioCount}`}
          </dd>
          <p className="dataset-header__coverage-label">Scenarios with rules</p>
        </div>
        <div>
          <dt>Created at</dt>
          <dd className="dataset-header__created">
            <time dateTime={dataset.created_at}>
              <span>{date}</span>
              <span className="dataset-header__time">{time}</span>
            </time>
          </dd>
        </div>
      </dl>
    </header>
  );
}
