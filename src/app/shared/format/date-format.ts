/**
 * Pure date / zone display helpers for the UI (mirrors the style of
 * `cost.ts` / `anonymize.ts`). These render human-friendly English strings
 * from the app's stored `"YYYY-MM-DD"` dates and IANA zone ids — never used
 * for form inputs or the JSON/Markdown export, which keep the raw values.
 */
import { DateTime } from 'luxon';

/** "Thu, 9 Apr" — a day without its year. */
export function formatDay(isoDate: string): string {
  const dt = DateTime.fromISO(isoDate);
  return dt.isValid ? dt.toFormat('ccc, d LLL') : isoDate;
}

/** "Thu, 9 Apr 2026" — a day with its year, for places that need it. */
export function formatDate(isoDate: string): string {
  const dt = DateTime.fromISO(isoDate);
  return dt.isValid ? dt.toFormat('ccc, d LLL yyyy') : isoDate;
}

/**
 * A date range as one compact string, with an en dash:
 *  - same day: "9 Apr 2026"
 *  - same month: "3–18 Apr 2026"
 *  - across months (same year): "28 Mar – 3 Apr 2026"
 *  - across years: "28 Dec 2026 – 3 Jan 2027"
 */
export function formatRange(start: string, end: string): string {
  const a = DateTime.fromISO(start);
  const b = DateTime.fromISO(end);
  if (!a.isValid || !b.isValid) return `${start} – ${end}`;

  if (a.hasSame(b, 'day')) {
    return a.toFormat('d LLL yyyy');
  }
  if (a.year !== b.year) {
    return `${a.toFormat('d LLL yyyy')} – ${b.toFormat('d LLL yyyy')}`;
  }
  if (a.month !== b.month) {
    return `${a.toFormat('d LLL')} – ${b.toFormat('d LLL yyyy')}`;
  }
  return `${a.toFormat('d')}–${b.toFormat('d LLL yyyy')}`;
}

/** Friendly city name from an IANA id: "Asia/Tokyo" → "Tokyo". */
export function zoneCity(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

/**
 * "Tokyo · GMT+9" — the zone's city plus its UTC offset at `at` (a Luxon
 * DateTime, an ISO string, or omitted for the current offset — zones with a
 * DST schedule can differ by date).
 */
export function zoneLabel(zone: string, at?: DateTime | string): string {
  const base =
    typeof at === 'string' ? DateTime.fromISO(at) : at ?? DateTime.now();
  const offset = base.setZone(zone).toFormat('ZZZZ');
  return `${zoneCity(zone)} · ${offset}`;
}
