"""Shared FastAPI dependencies."""

from __future__ import annotations

from fastapi import Request

from gatekeeper.persistence.database import Database


# Application database dependency.
async def get_database(request: Request) -> Database:
    return request.app.state.database  # type: ignore[no-any-return]
