"""Shared ASGI client fixtures for API tests."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import httpx
import pytest

from gatekeeper.app import create_app


# Synchronous wrapper for the ASGI test client.
class ApiClient:
    # Initialize the ASGI client wrapper.
    def __init__(self, app: Any) -> None:
        self.app = app

    # Send an HTTP request to the ASGI application.
    def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        # Run the asynchronous ASGI request.
        async def send() -> httpx.Response:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=self.app), base_url="http://test"
            ) as client:
                return await client.request(method, url, **kwargs)

        return asyncio.run(send())

    # Send a GET request.
    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    # Send a POST request.
    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("POST", url, **kwargs)

    # Send a PUT request.
    def put(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("PUT", url, **kwargs)

    # Send a PATCH request.
    def patch(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("PATCH", url, **kwargs)

    # Send a DELETE request.
    def delete(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("DELETE", url, **kwargs)


# Temporary-database API client fixture.
@pytest.fixture
def client(tmp_path: Path) -> ApiClient:
    return ApiClient(create_app(tmp_path / "gatekeeper.db"))


# Create a project through the public API.
def create_project(client: ApiClient, name: str = "Payments") -> dict[str, object]:
    response = client.post("/v1/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()
