"""Shared base for request schemas.

`StrictModel` rejects unknown fields with a 422 instead of silently dropping
them. This surfaces frontend/backend contract mismatches immediately (e.g. the
frontend sends a field the schema forgot to declare) rather than letting the
value quietly disappear.

Use it for REQUEST bodies. Leave response schemas on plain BaseModel.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
