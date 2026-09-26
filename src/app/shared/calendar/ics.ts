/**
 * Minimal iCalendar (RFC 5545) writer — enough for the reservation reminders
 * the Reservations view exports, with no dependency beyond Luxon.
 *
 * Times are written as UTC stamps (`...Z`) rather than with a VTIMEZONE block:
 * a reservation opens at one absolute instant, and every calendar app renders
 * a UTC stamp in the user's own zone (10:00 in Tokyo → 02:00 in Berlin).
 */
import { DateTime } from 'luxon';

export interface IcsEvent {
  /** Globally unique, stable across re-exports so re-imports update in place. */
  uid: string;
  /** Absolute start of the event. */
  start: DateTime;
  /** Event length in minutes. */
  durationMinutes: number;
  summary: string;
  /** Description lines, joined with newlines inside the single DESCRIPTION. */
  description?: string[];
  location?: string;
  url?: string;
  /** When set, a display alarm this many minutes before the start. */
  alarmMinutesBefore?: number;
}

/** Render one or more events as a complete .ics document. */
export function buildIcs(
  events: readonly IcsEvent[],
  now: DateTime = DateTime.now(),
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trip Planner//Reservations//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const event of events) {
    lines.push(...eventLines(event, now));
  }
  lines.push('END:VCALENDAR');
  // RFC 5545 wants CRLF line endings, and a trailing one closes the last line.
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** The MIME type + extension calendar apps expect. */
export const ICS_MIME_TYPE = 'text/calendar;charset=utf-8';

function eventLines(event: IcsEvent, now: DateTime): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.start.plus({ minutes: event.durationMinutes }))}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description?.length) {
    lines.push(`DESCRIPTION:${escapeText(event.description.join('\n'))}`);
  }
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  // URL is a property, not text: it must not be escaped (commas in a query
  // string are legal) — only folded.
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.alarmMinutesBefore != null) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(event.summary)}`,
      `TRIGGER:-PT${event.alarmMinutesBefore}M`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

/** UTC timestamp in the basic format iCalendar uses: 20261021T010000Z. */
function stamp(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

/** Escape the characters RFC 5545 reserves inside a TEXT value. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line to 75 octets, continuing with a leading space. Folding
 * counts bytes, not characters, so multi-byte text (Japanese station names)
 * stays inside the limit — and a character is never split across the fold.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  // A continuation line starts with one space, so it can hold 74 more octets.
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}
