/**
 * Pure classification of a trip list into "current" (running today),
 * "upcoming" (not started yet) and "past" (already ended) — the R11 trip
 * dashboard's hero + grouping logic. "Today" is resolved per-trip in its own
 * **destination** zone (same rule as `tripContextLabel`), so a trip whose
 * destination has already turned over (e.g. it's still the 8th at home but
 * already the 9th in Tokyo) is classified against the 9th, not the device's
 * today.
 */
import { DateTime } from 'luxon';
import { TripDto } from '../../models/trip.model';

export type TripForStatus = Pick<
  TripDto,
  'startDate' | 'endDate' | 'destinationTimeZone'
>;

export interface TripStatusGroups<T extends TripForStatus> {
  /** Running today (inclusive of the first/last day), started-last first. */
  current: T[];
  /** Not started yet, soonest first. */
  upcoming: T[];
  /** Already ended, most-recently-ended first. */
  past: T[];
}

/** Splits `trips` into current/upcoming/past as of `now`. */
export function classifyTrips<T extends TripForStatus>(
  trips: T[],
  now: DateTime,
): TripStatusGroups<T> {
  const current: T[] = [];
  const upcoming: T[] = [];
  const past: T[] = [];

  for (const trip of trips) {
    const zone = trip.destinationTimeZone;
    const start = DateTime.fromISO(trip.startDate, { zone }).startOf('day');
    const end = DateTime.fromISO(trip.endDate, { zone }).startOf('day');
    const today = now.setZone(zone).startOf('day');
    if (!start.isValid || !end.isValid || !today.isValid) continue;

    if (today < start) {
      upcoming.push(trip);
    } else if (today > end) {
      past.push(trip);
    } else {
      current.push(trip);
    }
  }

  // Dates are "YYYY-MM-DD" strings, so lexicographic order is chronological.
  current.sort((a, b) => b.startDate.localeCompare(a.startDate));
  upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  past.sort((a, b) => b.endDate.localeCompare(a.endDate));

  return { current, upcoming, past };
}
