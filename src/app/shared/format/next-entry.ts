/**
 * Pure "what's next today" lookup for the R11 hero card: the first
 * activity/transport entry whose start is after `now`, on today's calendar
 * date **in the trip's destination zone**. Standalone from the timeline's
 * `now-line.ts` (which works off the already-laid-out, per-day `DayItem`
 * list) since the dashboard has no timeline layout to hand — this derives
 * straight from the trip's `activities`/`transport` arrays.
 */
import { DateTime } from 'luxon';
import { ActivityDto, TransportDto, TripDto } from '../../models/trip.model';
import { transportLabel } from '../transport-format';

export interface NextEntryInfo {
  /** Activity title, or the transport route ("Tokyo → Kyoto"). */
  label: string;
  /** "HH:mm" in the destination zone. */
  time: string;
}

type TripForNextEntry = Pick<
  TripDto,
  'activities' | 'transport' | 'destinationTimeZone'
>;

/** The soonest activity/transport entry starting after `now`, today. */
export function nextEntryToday(
  trip: TripForNextEntry,
  now: DateTime,
): NextEntryInfo | undefined {
  const zone = trip.destinationTimeZone;
  const today = now.setZone(zone).startOf('day');
  const nowMillis = now.toMillis();

  let best: { label: string; time: string; millis: number } | undefined;

  const consider = (startIso: string, startZone: string, label: string) => {
    const start = DateTime.fromISO(startIso, { zone: startZone });
    if (!start.isValid) return;
    const millis = start.toMillis();
    if (millis <= nowMillis) return;
    const inDest = start.setZone(zone);
    if (!inDest.hasSame(today, 'day')) return;
    if (!best || millis < best.millis) {
      best = { label, time: inDest.toFormat('HH:mm'), millis };
    }
  };

  for (const a of trip.activities as ActivityDto[]) {
    consider(a.start.dateTime, a.start.zone, a.title);
  }
  for (const t of trip.transport as TransportDto[]) {
    consider(t.start.dateTime, t.start.zone, transportLabel(t));
  }

  return best ? { label: best.label, time: best.time } : undefined;
}
