/**
 * Reservation windows for trains.
 *
 * Japanese railways (JR) sell reserved seats — Shinkansen and limited express
 * alike — from **10:00 local time exactly one calendar month before the
 * departure date** (not 30 days). When that day-of-month does not exist in the
 * previous month (e.g. 31 March → "31 February"), sales instead start on the
 * **1st of the departure month**. The same window applies to the online
 * services (smartEX for the Tokaido/Sanyo/Kyushu Shinkansen).
 *
 * Which train kinds get a window is configurable via the
 * `RESERVABLE_TRAIN_KINDS` env var (see `environment.reservableTrainKinds`),
 * because "reservable" is a property of the operator's rules, not of our data.
 *
 * Everything here is a pure function of the trip data so it can be unit-tested
 * and reused by the details dialog, the Reservations view and the ICS export.
 */
import { DateTime } from 'luxon';
import { TransportDto, TripDto, ZonedTime } from '../../models/trip.model';

/** Hour of day — in the departure's own zone — at which booking opens. */
export const RESERVATION_OPENING_HOUR = 10;

/** Booking portal for the Tokaido / Sanyo / Kyushu Shinkansen. */
export const SMART_EX_URL = 'https://smart-ex.jp/en/';

/** A train whose reservation window we can compute, with that window. */
export interface ReservationWindow {
  transport: TransportDto;
  /** Departure, copied over for convenience. */
  departure: ZonedTime;
  /** The moment booking opens, anchored in the departure's own zone. */
  opensAt: ZonedTime;
}

/** Where a window sits relative to "now". Precedence: departed > booked > open / upcoming. */
export type ReservationStatus = 'upcoming' | 'open' | 'booked' | 'departed';

/** Case-insensitive membership test for the configured kinds. */
export function isReservable(
  transport: TransportDto,
  reservableKinds: readonly string[],
): boolean {
  if (transport.mode !== 'train' || !transport.trainKind) return false;
  const kind = transport.trainKind.trim().toLowerCase();
  return reservableKinds.some((k) => k.trim().toLowerCase() === kind);
}

/**
 * The moment reservations open for a departure, in the departure's own zone,
 * or undefined when the departure itself is unparseable.
 */
export function reservationOpensAt(
  departure: ZonedTime,
): ZonedTime | undefined {
  const dep = DateTime.fromISO(departure.dateTime, { zone: departure.zone });
  if (!dep.isValid) return undefined;
  // Luxon clamps an overflowing day ("31 March" minus a month → 28 February),
  // which is exactly how we detect the missing-day case the JR rule covers.
  const sameDayPreviousMonth = dep.minus({ months: 1 });
  const opens =
    sameDayPreviousMonth.day === dep.day
      ? sameDayPreviousMonth
      : dep.startOf('month');
  return {
    dateTime: opens
      .set({
        hour: RESERVATION_OPENING_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0,
      })
      .toFormat("yyyy-MM-dd'T'HH:mm"),
    zone: departure.zone,
  };
}

/** Every reservable leg of the trip, ordered by when its booking opens. */
export function reservationWindows(
  trip: TripDto,
  reservableKinds: readonly string[],
): ReservationWindow[] {
  return trip.transport
    .filter((t) => isReservable(t, reservableKinds))
    .flatMap((transport) => {
      const opensAt = reservationOpensAt(transport.start);
      return opensAt
        ? [{ transport, departure: transport.start, opensAt }]
        : [];
    })
    .sort((a, b) => millis(a.opensAt) - millis(b.opensAt));
}

/**
 * Whether booking has opened yet, whether the leg is already booked, and
 * whether the train has already left. Precedence: departed > booked > open /
 * upcoming — a booked seat on a departed train still reads as "departed".
 */
export function reservationStatus(
  window: ReservationWindow,
  now: DateTime = DateTime.now(),
): ReservationStatus {
  if (millis(window.departure) <= now.toMillis()) return 'departed';
  if (window.transport.booked) return 'booked';
  return millis(window.opensAt) <= now.toMillis() ? 'open' : 'upcoming';
}

/**
 * Whole days from `now` until booking opens (0 once it has opened). Rounded up,
 * so "opens in 1 day" stays 1 until the window actually opens.
 */
export function daysUntilOpening(
  window: ReservationWindow,
  now: DateTime = DateTime.now(),
): number {
  const diffMs = millis(window.opensAt) - now.toMillis();
  return diffMs <= 0 ? 0 : Math.ceil(diffMs / 86_400_000);
}

/** "Booking opens in 12 days" / "Bookable now" / "Booked" / "Departed". */
export function reservationStatusLabel(
  window: ReservationWindow,
  now: DateTime = DateTime.now(),
): string {
  switch (reservationStatus(window, now)) {
    case 'open':
      return 'Bookable now';
    case 'booked':
      return 'Booked';
    case 'departed':
      return 'Departed';
    default: {
      const days = daysUntilOpening(window, now);
      return `Booking opens in ${days} day${days === 1 ? '' : 's'}`;
    }
  }
}

/**
 * Summary counts for the Reservations view's lead line, e.g.
 * "1 of 5 booked · 1 bookable now · 3 not open yet". `booked` counts every
 * booked leg, departed or not, so the lead stays true after the trip; the
 * other two buckets only count legs that still need booking.
 */
export interface ReservationSummary {
  /** Total reservable legs, departed or not (the "of N" in the lead). */
  total: number;
  booked: number;
  bookableNow: number;
  notOpenYet: number;
}

export function reservationSummary(
  windows: ReservationWindow[],
  now: DateTime = DateTime.now(),
): ReservationSummary {
  const statuses = windows.map((w) => reservationStatus(w, now));
  return {
    total: windows.length,
    booked: windows.filter((w) => w.transport.booked).length,
    bookableNow: statuses.filter((s) => s === 'open').length,
    notOpenYet: statuses.filter((s) => s === 'upcoming').length,
  };
}

/**
 * ["1 of 5 booked", "1 bookable now", "3 not open yet"] — zero parts are
 * omitted, except the leading "x of y booked" count, which always shows (the
 * view sets it in bold). Undefined when there is nothing to summarize.
 */
export function reservationSummaryParts(
  summary: ReservationSummary,
): string[] | undefined {
  if (summary.total === 0) return undefined;
  const parts = [`${summary.booked} of ${summary.total} booked`];
  if (summary.bookableNow > 0) parts.push(`${summary.bookableNow} bookable now`);
  if (summary.notOpenYet > 0) parts.push(`${summary.notOpenYet} not open yet`);
  return parts;
}

/** Windows whose reminder is still useful: not booked, not departed. */
export function remindableWindows(
  windows: ReservationWindow[],
  now: DateTime = DateTime.now(),
): ReservationWindow[] {
  return windows.filter((w) => {
    const status = reservationStatus(w, now);
    return status !== 'booked' && status !== 'departed';
  });
}

/**
 * A prefilled timetable search for the leg on Jorudan's English route planner
 * (station, date and time are query params). Station names are used as typed;
 * a common name such as "Kyoto" lands on Jorudan's disambiguation list, which
 * still carries the date and time over.
 */
export function timetableSearchUrl(
  transport: TransportDto,
): string | undefined {
  const from = stationQuery(transport.fromStation ?? transport.fromLocation);
  const to = stationQuery(transport.toStation ?? transport.toLocation);
  const dep = DateTime.fromISO(transport.start.dateTime, {
    zone: transport.start.zone,
  });
  if (!from || !to || !dep.isValid) return undefined;
  const params = new URLSearchParams({
    p: '0',
    xpd: '1',
    from,
    to,
    date: dep.toFormat('MM/dd/yyyy'),
    time: dep.toFormat('HH:mm'),
    // Ticket fare, reserved seat, no flights — the settings that match a
    // Shinkansen seat reservation.
    ft: '0',
    ic: '0',
    us: '0',
  });
  return `https://world.jorudan.co.jp/mln/en/?${params.toString()}`;
}

/** Jorudan knows stations without the "Station" suffix our data carries. */
function stationQuery(name?: string): string | undefined {
  const cleaned = name?.replace(/\s+(station|sta\.?)$/i, '').trim();
  return cleaned || undefined;
}

function millis(zt: ZonedTime): number {
  const dt = DateTime.fromISO(zt.dateTime, { zone: zt.zone });
  return dt.isValid ? dt.toMillis() : 0;
}
