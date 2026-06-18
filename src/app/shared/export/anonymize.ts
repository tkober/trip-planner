import { TripDto } from '../../models/trip.model';

/**
 * Which categories of sensitive information to black out when exporting a trip
 * for public sharing. Chosen per-export in the export dialog.
 */
export interface AnonymizeOptions {
  /** Flight numbers only (no train names, no booking URLs). */
  flightNumbers: boolean;
  /** Accommodation address & full name, all Google Maps URLs. */
  addresses: boolean;
  /** Free-text notes / remarks on every entity. */
  notes: boolean;
  /** Activity locations and car pickup / drop-off station names. */
  locations: boolean;
}

/**
 * Sentinel used for redacted *visible text* fields. Block glyphs render as a
 * solid bar in any font, so the field reads as "blacked out" on every export
 * surface (timeline PNG and the printable sections) without per-component logic.
 * URL fields are instead removed (set to undefined) so their link disappears.
 */
const REDACTED = '█████';

/**
 * Return a deep copy of `trip` with the selected categories of sensitive fields
 * redacted. IDs, dates, times, zones and colours are left untouched so the
 * timeline geometry and section grouping render identically to the real plan.
 *
 * This is a pure transform: every export surface renders the returned copy via
 * its existing `tripOverride` input, so no rendering code needs to know about
 * anonymization.
 */
export function anonymizeTrip(trip: TripDto, opts: AnonymizeOptions): TripDto {
  const t = structuredClone(trip);

  for (const a of t.accommodations) {
    if (opts.addresses) {
      if (a.fullName) a.fullName = REDACTED;
      if (a.address) a.address = REDACTED;
      a.googleMapsUrl = undefined;
    }
    if (opts.notes && a.remarks) a.remarks = REDACTED;
  }

  for (const c of t.carReservations) {
    if (opts.addresses) {
      c.pickupGoogleMapsUrl = undefined;
      c.dropoffGoogleMapsUrl = undefined;
      c.pickupStationUrl = undefined;
      c.dropoffStationUrl = undefined;
    }
    if (opts.notes && c.remarks) c.remarks = REDACTED;
    if (opts.locations) {
      if (c.pickupLocation) c.pickupLocation = REDACTED;
      if (c.dropoffLocation) c.dropoffLocation = REDACTED;
    }
  }

  for (const a of t.activities) {
    if (opts.addresses) a.googleMapsUrl = undefined;
    if (opts.notes && a.notes) a.notes = REDACTED;
    if (opts.locations && a.location) a.location = REDACTED;
  }

  for (const tr of t.transport) {
    if (opts.flightNumbers && tr.flightNumber) tr.flightNumber = REDACTED;
    if (opts.notes && tr.notes) tr.notes = REDACTED;
  }

  return t;
}
