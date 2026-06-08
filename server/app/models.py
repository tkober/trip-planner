"""Pydantic schema for a trip payload.

Mirrors the frontend ``TripDto`` loosely: the known fields are validated so the
scalar columns can be projected, but unknown / nested fields are accepted and
round-tripped verbatim (``extra="allow"``).
"""
from typing import Any

from pydantic import BaseModel, ConfigDict


class Trip(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    schemaVersion: int
    title: str
    startDate: str
    endDate: str
    homeTimeZone: str
    destinationTimeZone: str
    description: str | None = None
    accommodations: list[dict[str, Any]] = []
    activities: list[dict[str, Any]] = []
    transport: list[dict[str, Any]] = []
    createdAt: str
    updatedAt: str
