"""REST endpoints mirroring the frontend ``TripStore`` (whole-trip writes)."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import TripRow, get_session, parse_instant
from .models import Trip

router = APIRouter(prefix="/trips", tags=["trips"])


def _row_from_trip(trip: Trip) -> TripRow:
    data = trip.model_dump()
    return TripRow(
        id=trip.id,
        schema_version=trip.schemaVersion,
        title=trip.title,
        start_date=trip.startDate,
        updated_at=parse_instant(trip.updatedAt),
        data=data,
    )


@router.get("")
async def list_trips(session: AsyncSession = Depends(get_session)) -> list[dict]:
    result = await session.execute(
        select(TripRow).order_by(TripRow.updated_at.desc())
    )
    return [row.data for row in result.scalars().all()]


@router.get("/{trip_id}")
async def get_trip(
    trip_id: str, session: AsyncSession = Depends(get_session)
) -> dict:
    row = await session.get(TripRow, trip_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return row.data


@router.post("", status_code=201)
async def create_trip(
    trip: Trip, session: AsyncSession = Depends(get_session)
) -> dict:
    row = await session.merge(_row_from_trip(trip))
    await session.commit()
    return row.data


@router.put("/{trip_id}")
async def update_trip(
    trip_id: str, trip: Trip, session: AsyncSession = Depends(get_session)
) -> dict:
    if trip.id != trip_id:
        raise HTTPException(status_code=400, detail="Trip id mismatch")
    row = await session.merge(_row_from_trip(trip))
    await session.commit()
    return row.data


@router.delete("/{trip_id}", status_code=204)
async def delete_trip(
    trip_id: str, session: AsyncSession = Depends(get_session)
) -> Response:
    row = await session.get(TripRow, trip_id)
    if row is not None:
        await session.delete(row)
        await session.commit()
    return Response(status_code=204)
