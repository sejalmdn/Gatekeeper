"""Consistent project-scoped reads for on-demand comparisons without persistence."""

from uuid import UUID

from fastapi import HTTPException

from gatekeeper.contracts.comparisons import ComparisonRun, RunComparison
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.reporting import TERMINAL_STATUSES, read_reporting_attempts
from gatekeeper.reporting.comparison import compare_runs


# Read both snapshots and observations inside the same SQLite read transaction.
def read_comparison(
    database: Database, project_id: UUID, run_a_id: UUID, run_b_id: UUID
) -> RunComparison:
    """Read project-scoped run identities from database and return comparison or a typed error."""
    with database.connection() as connection:
        connection.execute("BEGIN")
        rows = [
            connection.execute(
                "SELECT r.*, d.name AS dataset_name FROM evaluation_runs r "
                "JOIN datasets d ON d.id = r.dataset_id WHERE r.id = ? AND r.project_id = ?",
                (str(run_id), str(project_id)),
            ).fetchone()
            for run_id in (run_a_id, run_b_id)
        ]

        if any(row is None for row in rows):
            raise HTTPException(404, detail="evaluation run not found")

        if run_a_id == run_b_id:
            raise HTTPException(422, detail={"reason": "identical_run_ids"})

        if any(row["status"] not in TERMINAL_STATUSES for row in rows):
            raise HTTPException(409, detail={"reason": "nonterminal_run"})

        if rows[0]["dataset_id"] != rows[1]["dataset_id"]:
            raise HTTPException(409, detail={"reason": "different_datasets"})

        snapshots = []
        metadata = []

        for row in rows:
            frozen = connection.execute(
                "SELECT configuration FROM execution_snapshots WHERE run_id = ?", (row["id"],)
            ).fetchone()
            snapshot = (
                ExecutionSnapshot.model_validate_json(frozen["configuration"]) if frozen else None
            )
            snapshots.append(snapshot)
            metadata.append(
                ComparisonRun(
                    id=row["id"],
                    candidate_id=row["candidate_id"],
                    candidate_name=snapshot.candidate.name if snapshot else None,
                    model=snapshot.candidate.model_name if snapshot else None,
                    dataset_id=row["dataset_id"],
                    dataset_name=row["dataset_name"],
                    status=row["status"],
                    created_at=row["created_at"],
                    started_at=row["started_at"],
                    completed_at=row["completed_at"],
                    settings=snapshot.settings if snapshot else None,
                )
            )

        a, b = snapshots
        reason = None

        if a is None or b is None:
            reason = "frozen_snapshot_unavailable"
        elif a.scenarios != b.scenarios:
            reason = "frozen_scenario_collections_disagree"

        if reason:
            return RunComparison(
                project_id=project_id,
                run_a=metadata[0],
                run_b=metadata[1],
                availability="unavailable",
                reason=reason,
            )

        return compare_runs(
            project_id,
            *metadata,
            a,
            b,
            read_reporting_attempts(connection, run_a_id),
            read_reporting_attempts(connection, run_b_id),
        )
