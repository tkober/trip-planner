/**
 * Turns reservation windows into calendar events: one VEVENT per train, placed
 * at the moment its booking opens, carrying the leg's details and the links
 * needed to actually book it.
 *
 * A pure data transform (like `anonymizeTrip` / `tripToMarkdown`) — the caller
 * downloads the string via `download.ts`.
 */
import { DateTime } from 'luxon';
import { TransportDto, TripDto } from '../../models/trip.model';
import {
  ReservationWindow,
  SMART_EX_URL,
  timetableSearchUrl,
} from '../reservation/reservation';
import { transportLabel } from '../transport-format';
import { formatMoney } from '../cost/cost';
import { slugify } from '../download';
import { buildIcs, IcsEvent } from './ics';

/** How long the reminder blocks in the calendar. */
const EVENT_MINUTES = 30;
/** Lead time of the reminder alarm, so you are logged in when booking opens. */
const ALARM_MINUTES_BEFORE = 15;

/** One reservation reminder as a calendar event. */
export function reservationEvent(
  window: ReservationWindow,
  homeZone: string,
): IcsEvent {
  const t = window.transport;
  const opens = DateTime.fromISO(window.opensAt.dateTime, {
    zone: window.opensAt.zone,
  });
  return {
    uid: `${t.id}-reservation@trip-planner`,
    start: opens,
    durationMinutes: EVENT_MINUTES,
    summary: `Book seats: ${transportLabel(t)}${t.trainName ? ` · ${t.trainName}` : ''}`,
    description: descriptionLines(window, homeZone),
    location: t.fromStation || t.fromLocation || undefined,
    url: t.bookingUrl || SMART_EX_URL,
    alarmMinutesBefore: ALARM_MINUTES_BEFORE,
  };
}

/** A whole trip's reservation reminders as one .ics document. */
export function reservationsIcs(
  windows: readonly ReservationWindow[],
  homeZone: string,
  now?: DateTime,
): string {
  return buildIcs(
    windows.map((w) => reservationEvent(w, homeZone)),
    now,
  );
}

/** File name for a single leg's reminder, e.g. "book-tokyo-okayama.ics". */
export function reservationIcsFilename(transport: TransportDto): string {
  return `book-${slugify(transportLabel(transport)) || 'train'}.ics`;
}

/** File name for the whole trip's reminders. */
export function reservationsIcsFilename(trip: TripDto): string {
  return `${slugify(trip.title) || 'trip'}-reservations.ics`;
}

function descriptionLines(
  window: ReservationWindow,
  homeZone: string,
): string[] {
  const t = window.transport;
  const lines: string[] = [
    `Reservations open ${dual(window.opensAt.dateTime, window.opensAt.zone, homeZone)}.`,
    '',
    `Train: ${[t.trainName, t.line, t.trainKind].filter(Boolean).join(' · ') || 'Train'}`,
  ];
  if (t.operator) lines.push(`Operator: ${t.operator}`);
  lines.push(
    `Departure: ${dual(t.start.dateTime, t.start.zone, homeZone)} — ${endpoint(t.fromStation ?? t.fromLocation, t.fromPlatform)}`,
  );
  if (t.end) {
    lines.push(
      `Arrival: ${dual(t.end.dateTime, t.end.zone, homeZone)} — ${endpoint(t.toStation ?? t.toLocation, t.toPlatform)}`,
    );
  }
  if (t.bookingReference) lines.push(`Booking ref.: ${t.bookingReference}`);
  if (t.totalPrice != null) {
    lines.push(`Price: ${formatMoney(t.totalPrice, t.currency)}`);
  }
  if (t.notes) lines.push('', t.notes);

  lines.push('', 'Book / check the timetable:');
  if (t.bookingUrl) lines.push(`Booking: ${t.bookingUrl}`);
  lines.push(`smartEX (Tokaido/Sanyo/Kyushu Shinkansen): ${SMART_EX_URL}`);
  const timetable = timetableSearchUrl(t);
  if (timetable) lines.push(`Timetable for this train: ${timetable}`);
  return lines;
}

/**
 * "Sat, 21 Nov 2026 06:15 (Asia/Tokyo) · 22:15 on 20 Nov (Europe/Berlin)" —
 * the home-zone date is spelled out whenever it differs, so a night train or
 * an early Shinkansen does not read as happening on the wrong day at home.
 */
function dual(dateTime: string, zone: string, homeZone: string): string {
  const own = DateTime.fromISO(dateTime, { zone });
  if (!own.isValid) return dateTime;
  const local = own.toFormat('ccc, d LLL yyyy HH:mm');
  if (zone === homeZone) return `${local} (${zone})`;
  const home = own.setZone(homeZone);
  const homeTime =
    home.toISODate() === own.toISODate()
      ? home.toFormat('HH:mm')
      : `${home.toFormat('HH:mm')} on ${home.toFormat('d LLL')}`;
  return `${local} (${zone}) · ${homeTime} (${homeZone})`;
}

/** "Tokyo Station · Track 4" when a platform is known. */
function endpoint(place?: string, platform?: string): string {
  return [place, platform].filter(Boolean).join(' · ') || '?';
}
