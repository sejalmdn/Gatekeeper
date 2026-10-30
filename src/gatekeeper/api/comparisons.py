"""Project-scoped read-only saved-run comparison endpoint."""

from uuid import UUID

from fastapi import APIRouter, Depends

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.comparisons import RunComparison
from gatekeeper.persistence.comparisons import read_comparison
from gatekeeper.persistence.database import Database

# Comparisons are computed on demand and never invoke or evaluate candidates.
router = APIRouter(prefix="/v1/projects/{project_id}/run-comparisons")


# Compare two terminal runs against their shared frozen dataset and effective rule identities.
@router.get("", response_model=RunComparison)
async def get_comparison(
    project_id: UUID,
    run_a_id: UUID,
    run_b_id: UUID,
    database: Database = Depends(get_database),
) -> RunComparison:
    """Compare run_a_id and run_b_id in project_id using database; return statistics."""
    return read_comparison(database, project_id, run_a_id, run_b_id)
