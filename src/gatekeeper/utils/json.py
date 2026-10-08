"""Canonical JSON encoding and digest helpers."""

from __future__ import annotations

import hashlib
import json
from typing import Any


# Canonical JSON encoder.
def canonical_json(value: Any) -> str:
    """Encode JSON consistently before persistence and hashing."""
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


# SHA-256 JSON digest generator.
def digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()
