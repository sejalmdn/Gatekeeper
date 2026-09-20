import type { ReactElement, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Candidate, Config, DatasetRelease, Evaluation } from "../types";
import { timestamp } from "../utils/format";
import { Icon } from "./Icon";
import { Digest } from "./RecordData";
import "../styles/RecordTable.css";

// Column definitions keep domain-specific data separate from table presentation.
interface Column<T> {
    label: string;
    render: (row: T) => ReactNode;
}

// Shared semantic table with a keyboard-scrollable container for narrow screens.
export function RecordTable<T extends { id: string }>({
    label, rows, columns, searchText,
}: {
    label: string;
    rows: T[];
    columns: Column<T>[];
    searchText: (row: T) => string;
}): ReactElement {
    const [params] = useSearchParams();
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const visibleRows = rows.filter((row) => searchText(row).toLowerCase().includes(query));
    return (
        <div
            className="record-table-scroll"
            role="region"
            aria-label={label}
            tabIndex={0}
        >
            <table className="record-table">
                <caption className="record-table-caption">{label}</caption>
                <thead>
                    <tr>{columns.map((column) => (
                        <th key={column.label} scope="col">{column.label}</th>
                    ))}</tr>
                </thead>
                <tbody>{visibleRows.map((row) => (
                    <tr key={row.id}>{columns.map((column) => (
                        <td key={column.label}>{column.render(row)}</td>
                    ))}</tr>
                ))}
                    {!visibleRows.length && <tr><td colSpan={columns.length}
                        className="record-table-empty">
                        No matching records. Try another search.
                    </td></tr>}
                </tbody>
            </table>
        </div>
    );
}

// Candidate versions link to their immutable runtime configuration.
export function CandidateTable({ candidates, projectId }: {
    candidates: Candidate[];
    projectId: string;
}): ReactElement {
    return <RecordTable
        label="Candidate records"
        rows={candidates}
        searchText={(row) => [row.id, row.application_version,
            row.runtime_configuration_digest].join(" ")}
        columns={[
            {
                label: "Application version", render: (row) => (
                    <Link to={`/projects/${projectId}/candidates/${row.id}`}>
                        {row.application_version}
                    </Link>
                )
            },
            {
                label: "Runtime configuration", render: (row) => (
                    <Digest label="sha256" value={row.runtime_configuration_digest} />
                )
            },
            { label: "Created", render: (row) => timestamp(row.created_at) },
        ]}
    />;
}

// Dataset releases show scenario counts without claiming coverage or outcomes.
export function DatasetTable({ datasets, projectId }: {
    datasets: DatasetRelease[];
    projectId: string;
}): ReactElement {
    return <RecordTable
        label="Dataset releases"
        rows={datasets}
        searchText={(row) => [row.id, row.dataset_name, row.version, row.content_digest].join(" ")}
        columns={[
            {
                label: "Release", render: (row) => (
                    <Link to={`/projects/${projectId}/datasets/${row.id}`}>
                        {row.dataset_name}
                        <span className="version">v{row.version}</span>
                    </Link>
                )
            },
            { label: "Scenarios", render: (row) => row.scenarios.length },
            {
                label: "Content",
                render: (row) => <Digest label="sha256" value={row.content_digest} />,
            },
            { label: "Created", render: (row) => timestamp(row.created_at) },
        ]}
    />;
}

// Scoring configurations retain the default repeated-attempt policy.
export function ConfigTable({ configs, projectId }: {
    configs: Config[];
    projectId: string;
}): ReactElement {
    return <RecordTable
        label="Scoring configurations"
        rows={configs}
        searchText={(row) => [row.id, row.name, row.version, row.digest].join(" ")}
        columns={[
            {
                label: "Release", render: (row) => (
                    <Link to={`/projects/${projectId}/configs/${row.id}`}>
                        {row.name}
                        <span className="version">v{row.version}</span>
                    </Link>
                )
            },
            { label: "Default attempts", render: (row) => row.default_attempts },
            {
                label: "Configuration",
                render: (row) => <Digest label="sha256" value={row.digest} />,
            },
            { label: "Created", render: (row) => timestamp(row.created_at) },
        ]}
    />;
}

// Evaluations identify frozen sources without inventing run status or results.
export function EvaluationTable({ evaluations, projectId }: {
    evaluations: Evaluation[];
    projectId: string;
}): ReactElement {
    return <RecordTable
        label="Frozen evaluations"
        rows={evaluations}
        searchText={(row) => [
            row.id, row.candidate_snapshot.application_version,
            row.dataset_release_snapshot.dataset_name, row.dataset_release_snapshot.version,
            row.config_snapshot.name, row.config_snapshot.version,
        ].join(" ")}
        columns={[
            {
                label: "Evaluation record", render: (row) => (
                    <div className="table-cell-stack">
                        <Link className="evaluation-id"
                            title={row.id} to={`/projects/${projectId}/evaluations/${row.id}`}>
                            {row.id}
                        </Link>
                        <small>{timestamp(row.created_at)}</small>
                    </div>
                ),
            },
            {
                label: "Candidate & dataset", render: (row) => (
                    <div className="table-cell-stack">
                        <strong>{row.candidate_snapshot.application_version}</strong>
                        <small>{row.dataset_release_snapshot.dataset_name}
                            <span className="version">v{row.dataset_release_snapshot.version}</span>
                        </small>
                        <small>{row.dataset_release_snapshot.scenarios.length} scenarios</small>
                    </div>
                ),
            },
            {
                label: "Configuration", render: (row) => (
                    <div className="table-cell-stack">
                        <strong>{row.config_snapshot.name}
                            <span className="version">v{row.config_snapshot.version}</span>
                        </strong>
                        <small>
                            {row.config_snapshot.default_attempts} planned attempts / scenario
                        </small>
                    </div>
                ),
            },
            {
                label: "Input status", render: () => (
                    <span className="badge badge-cyan"><Icon name="lock" />Frozen</span>
                ),
            },
            {
                label: "Actions", render: (row) => (
                    <Link className="table-action"
                        aria-label={`View evaluation ${row.id}`}
                        to={`/projects/${projectId}/evaluations/${row.id}`}>
                        View record
                    </Link>
                ),
            },
        ]}
    />;
}
