import { DateTime } from 'luxon';

/**
 * Pure ±1-day nudge rules for accommodations and car reservations, shared by
 * the desktop timeline's lane right-click menu (`TimelineView`'s
 * `canPlus`/`canMinus`/`nudge`) and the R9 details-view steppers. An
 * accommodation's check-in/check-out must bracket at least one night (they
 * can never meet); a car reservation's pickup/dropoff may meet (a same-day
 * rental), so only pickup > dropoff is disallowed.
 */
export type StayKind = 'accommodation' | 'car';
export type StaySide = 'start' | 'end';

/** The two dates a nudge acts on — check-in/out or pickup/dropoff. */
export interface StayDates {
  start: string;
  end: string;
}

/** Add N calendar days to a "YYYY-MM-DD" date string. */
function addDays(date: string, delta: number): string {
  return DateTime.fromISO(date).plus({ days: delta }).toISODate() ?? date;
}

/**
 * Whether `side`'s date may move by `delta` without collapsing the span.
 * Widening (start −1, end +1) is always allowed; the guarded direction
 * depends on `side` and `kind`.
 */
export function canShift(
  kind: StayKind,
  side: StaySide,
  delta: 1 | -1,
  dates: StayDates,
): boolean {
  if (side === 'start') {
    if (delta < 0) return true; // start −1 always widens
    const moved = addDays(dates.start, 1);
    return kind === 'accommodation' ? moved < dates.end : moved <= dates.end;
  }
  // side === 'end'
  if (delta > 0) return true; // end +1 always widens
  const moved = addDays(dates.end, -1);
  return kind === 'accommodation' ? moved > dates.start : moved >= dates.start;
}

/**
 * Apply the nudge, returning the updated `StayDates`. Callers should check
 * `canShift` first; an illegal shift here just returns the unclamped result
 * (same as the previous `TimelineView.nudge` behaviour).
 */
export function shift(
  side: StaySide,
  delta: 1 | -1,
  dates: StayDates,
): StayDates {
  return side === 'start'
    ? { ...dates, start: addDays(dates.start, delta) }
    : { ...dates, end: addDays(dates.end, delta) };
}
