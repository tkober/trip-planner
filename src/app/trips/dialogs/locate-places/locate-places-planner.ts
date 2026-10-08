/**
 * Pure planning logic for the trip-menu "Locate places…" bulk geocode (D5,
 * #49): which entities/endpoints still have no `GeoPoint`, and what text to
 * geocode for each. No DI, no Google Maps API — `LocatePlacesDialog` runs
 * the actual (throttled, sequential) geocoding over this plan and lets the
 * user accept/discard each result before anything is saved.
 */
import { TransportDto, TripDto } from '../../../models/trip.model';

export type LocateEntityKind =
  | 'accommodation'
  | 'car-pickup'
  | 'car-dropoff'
  | 'activity'
  | 'transport-from'
  | 'transport-to';

export interface LocateTarget {
  /** Stable, unique key (e.g. `car:c1:pickup`) — used as the review list's row id. */
  id: string;
  kind: LocateEntityKind;
  /** The owning entity's id (the accommodation/car/activity/transport). */
  entityId: string;
  /** Short label for the review list, e.g. "Park Hotel Tokyo" or "Shinkansen · from". */
  label: string;
  /** Free-text query to geocode. */
  query: string;
}

/** The station/airport/stop specific to one end of a transport leg, if any. */
function transportEndpointSpecific(t: TransportDto, end: 'from' | 'to'): string | undefined {
  switch (t.mode) {
    case 'flight':
      return end === 'from' ? t.fromAirport : t.toAirport;
    case 'train':
      return end === 'from' ? t.fromStation : t.toStation;
    case 'bus':
      return end === 'from' ? t.fromStop : t.toStop;
    default:
      return undefined;
  }
}

/** Geocode query for one end of a transport leg: station/airport/stop, else the city. */
export function transportEndpointQuery(t: TransportDto, end: 'from' | 'to'): string | undefined {
  const specific = transportEndpointSpecific(t, end);
  const location = end === 'from' ? t.fromLocation : t.toLocation;
  const parts = [specific, location].filter((v): v is string => !!v?.trim());
  if (!parts.length) return undefined;
  return parts.join(', ');
}

function transportEndpointLabel(t: TransportDto, end: 'from' | 'to'): string {
  const specific = transportEndpointSpecific(t, end);
  const location = end === 'from' ? t.fromLocation : t.toLocation;
  const place = specific || location || (end === 'from' ? 'Departure' : 'Arrival');
  return `${place} (${end === 'from' ? 'from' : 'to'})`;
}

/**
 * Every entity/endpoint in `trip` that has no `GeoPoint` yet but has enough
 * text to geocode, in a stable order (accommodations, car reservations,
 * activities, transport — each in storage order).
 */
export function planLocateTargets(trip: TripDto): LocateTarget[] {
  const targets: LocateTarget[] = [];

  for (const a of trip.accommodations) {
    if (a.geo) continue;
    const query = a.address?.trim() || a.fullName?.trim() || a.name?.trim();
    if (query) {
      targets.push({
        id: `accommodation:${a.id}`,
        kind: 'accommodation',
        entityId: a.id,
        label: a.name,
        query,
      });
    }
  }

  for (const c of trip.carReservations) {
    if (!c.pickupGeo && c.pickupLocation?.trim()) {
      targets.push({
        id: `car:${c.id}:pickup`,
        kind: 'car-pickup',
        entityId: c.id,
        label: `${c.name} · Pickup`,
        query: c.pickupLocation.trim(),
      });
    }
    if (!c.dropoffGeo && c.dropoffLocation?.trim()) {
      targets.push({
        id: `car:${c.id}:dropoff`,
        kind: 'car-dropoff',
        entityId: c.id,
        label: `${c.name} · Return`,
        query: c.dropoffLocation.trim(),
      });
    }
  }

  for (const act of trip.activities) {
    if (act.geo) continue;
    const query = act.location?.trim() || act.title?.trim();
    if (query) {
      targets.push({
        id: `activity:${act.id}`,
        kind: 'activity',
        entityId: act.id,
        label: act.title,
        query,
      });
    }
  }

  for (const t of trip.transport) {
    if (!t.fromGeo) {
      const query = transportEndpointQuery(t, 'from');
      if (query) {
        targets.push({
          id: `transport:${t.id}:from`,
          kind: 'transport-from',
          entityId: t.id,
          label: transportEndpointLabel(t, 'from'),
          query,
        });
      }
    }
    if (!t.toGeo) {
      const query = transportEndpointQuery(t, 'to');
      if (query) {
        targets.push({
          id: `transport:${t.id}:to`,
          kind: 'transport-to',
          entityId: t.id,
          label: transportEndpointLabel(t, 'to'),
          query,
        });
      }
    }
  }

  return targets;
}
