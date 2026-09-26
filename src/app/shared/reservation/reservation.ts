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

/** Where a window sits relative to "now". */
export type ReservationStatus = 'upcoming' | 'open' | 'departed';

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

/** Whether booking has opened yet — and whether the train has already left. */
export function reservationStatus(
  window: ReservationWindow,
  now: DateTime = DateTime.now(),
): ReservationStatus {
  if (millis(window.departure) <= now.toMillis()) return 'departed';
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

/** "Booking opens in 12 days" / "Bookable now" / "Departed". */
export function reservationStatusLabel(
  window: ReservationWindow,
  now: DateTime = DateTime.now(),
): string {
  switch (reservationStatus(window, now)) {
    case 'open':
      return 'Bookable now';
    case 'departed':
      return 'Departed';
    default: {
      const days = daysUntilOpening(window, now);
      return `Booking opens in ${days} day${days === 1 ? '' : 's'}`;
    }
  }
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
