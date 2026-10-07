/**
 * The mobile app bar's subtitle (R3): a one-line "where am I in the trip"
 * label shown under the trip title. Pure function so it's independently
 * testable — "today" is resolved in the trip's **destination** zone, not the
 * device's, so a trip that has already turned over there (e.g. it's still
 * the 8th at home but already the 9th in Tokyo) reports the right day.
 */
import { DateTime } from 'luxon';
import { TripDto } from '../../models/trip.model';
import { formatDay, formatRange } from './date-format';

/**
 * - Before the trip: "Starts in N days" ("Starts tomorrow" for N = 1; there's
 *   no separate "starts today" wording — that's just Day 1 of the during-trip
 *   case below).
 * - During the trip (inclusive of the first and last day): "Day 7 of 16 ·
 *   Thu, 9 Apr".
 * - After the trip: the date range, e.g. "3–18 Apr 2026".
 */
export function tripContextLabel(
  trip: Pick<TripDto, 'startDate' | 'endDate' | 'destinationTimeZone'>,
  now: DateTime,
): string {
  const zone = trip.destinationTimeZone;
  const start = DateTime.fromISO(trip.startDate, { zone }).startOf('day');
  const end = DateTime.fromISO(trip.endDate, { zone }).startOf('day');
  const today = now.setZone(zone).startOf('day');
  if (!start.isValid || !end.isValid || !today.isValid) return '';

  if (today < start) {
    const days = Math.round(start.diff(today, 'days').days);
    return days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`;
  }
  if (today > end) {
    return formatRange(trip.startDate, trip.endDate);
  }
  const totalDays = Math.round(end.diff(start, 'days').days) + 1;
  const dayIndex = Math.round(today.diff(start, 'days').days) + 1;
  return `Day ${dayIndex} of ${totalDays} · ${formatDay(today.toISODate()!)}`;
}
