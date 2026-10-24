import type { ReactElement, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Candidate, Dataset, Provider } from "../types";
import { timestamp } from "../utils/format";
import "../styles/RecordTable.css";

// Column definitions keep domain-specific data separate from table presentation.
interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
}

interface RecordTableProps<T> {
  label: string;
  rows: T[];
  columns: Column<T>[];
  searchText: (row: T) => string;
  className?: string;
}

// Shared semantic table with a keyboard-scrollable container for narrow screens.
export function RecordTable<T extends { id: string }>({
  label,
  rows,
  columns,
  searchText,
  className = "",
}: RecordTableProps<T>): ReactElement {
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const visibleRows = rows.filter((row) =>
    searchText(row).toLowerCase().includes(query),
  );
  return (
    <div
      className="record-table-scroll"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className={`record-table ${className}`.trim()}>
        <caption className="record-table-caption">{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.label}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
          {!visibleRows.length && (
            <tr>
              <td colSpan={columns.length} className="record-table-empty">
                No matching records. Try another search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Provider table shows connection identity without exposing secret values.
export function ProviderTable({
  providers,
  projectId,
}: {
  providers: Provider[];
  projectId: string;
}): ReactElement {
  return (
    <RecordTable
      label="Provider records"
      rows={providers}
      searchText={(row) =>
        [row.id, row.name, row.provider_type, row.base_url].join(" ")
      }
      columns={[
        {
          label: "Provider",
          render: (row) => (
            <Link to={`/projects/${projectId}/providers/${row.id}`}>
              {row.name}
            </Link>
          ),
        },
        { label: "Type", render: (row) => row.provider_type },
        {
          label: "Base URL",
          render: (row) => row.base_url ?? "Provider default",
        },
        { label: "Created", render: (row) => timestamp(row.created_at) },
      ]}
    />
  );
}

// Candidate table highlights the configured model or agent target.
export function CandidateTable({
  candidates,
  projectId,
}: {
  candidates: Candidate[];
  projectId: string;
}): ReactElement {
  return (
    <RecordTable
      label="Candidate records"
      rows={candidates}
      searchText={(row) => [row.id, row.name, row.model_name].join(" ")}
      columns={[
        {
          label: "Candidate",
          render: (row) => (
            <Link to={`/projects/${projectId}/candidates/${row.id}`}>
              {row.name}
            </Link>
          ),
        },
        { label: "Model", render: (row) => row.model_name },
        { label: "Created", render: (row) => timestamp(row.created_at) },
      ]}
    />
  );
}

// Dataset table presents containers without implying embedded scenario data.
export function DatasetTable({
  datasets,
  projectId,
}: {
  datasets: Dataset[];
  projectId: string;
}): ReactElement {
  return (
    <RecordTable
      label="Dataset records"
      className="record-table--datasets"
      rows={datasets}
      searchText={(row) => [row.id, row.name, row.description].join(" ")}
      columns={[
        {
          label: "Dataset",
          render: (row) => (
            <Link to={`/projects/${projectId}/datasets/${row.id}`}>
              {row.name}
            </Link>
          ),
        },
        { label: "Description", render: (row) => row.description ?? "—" },
        { label: "Created", render: (row) => timestamp(row.created_at) },
      ]}
    />
  );
}
