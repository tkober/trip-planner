import { DateTime } from 'luxon';
import { TimelineEntry, ZonedTime } from '../../models/trip.model';

/**
 * The calendar date (in the ZonedTime's OWN zone) a moment belongs to, for
 * deciding whether an entry crosses a day boundary from the traveller's point
 * of view (R6). This is the same "own zone" convention
 * `TimeZoneService.dayKeyLocal` uses, with one addition: an end at EXACTLY
 * midnight (00:00:00.000) is read as the close of the day before, not the
 * opening instant of the next one — "21:00 → 00:00" describes a night that
 * ends at midnight, not a one-instant sliver of the following day, so it does
 * NOT split. This matters for the common case of an itinerary entered as
 * ending "at midnight": without the rule, every such entry would wrongly
 * straddle/split into the next (otherwise empty, for that entry) day.
 */
export function localDayKey(zt: ZonedTime): string {
  const dt = DateTime.fromISO(zt.dateTime, { zone: zt.zone });
  if (!dt.isValid) return '';
  if (dt.hour === 0 && dt.minute === 0 && dt.second === 0 && dt.millisecond === 0) {
    return dt.minus({ days: 1 }).toISODate() ?? '';
  }
  return dt.toISODate() ?? '';
}

/** The day-crossing decision for one entry, in its own (per-endpoint) zones. */
export interface EntrySpan {
  /** Local-day key of the start. */
  startKey: string;
  /**
   * Local-day key of the effective end — equal to `startKey` when the entry
   * doesn't cross a boundary (no `end`, or `end` within the same local day,
   * or `end` reads as the start day under the midnight rule above).
   */
  endKey: string;
  /** Whether the entry crosses at least one day boundary. */
  crosses: boolean;
}

/**
 * Whether an activity/transport entry crosses a day boundary (R6: feeds both
 * the mobile top/bottom split and the desktop straddle/continues/arrives
 * rows). Pure — no day-array/grid knowledge, so it's independently testable;
 * `TimelineView.layout()` maps the returned keys onto day-array indices via
 * its own `clampIndex`.
 */
export function computeEntrySpan(entry: TimelineEntry): EntrySpan {
  const end = entry.activity?.end ?? entry.transport?.end;
  const startKey = localDayKey(entry.start);
  if (!end) return { startKey, endKey: startKey, crosses: false };
  const endKey = localDayKey(end);
  return { startKey, endKey, crosses: endKey > startKey };
}

/**
 * Whether a moment's own zone differs from a day's reference zone (the
 * destination zone for a real day, the home zone for a virtual
 * departure/return day) — drives the highlighted zone tag (R6).
 */
export function zoneDiffers(zt: ZonedTime, refZone: string): boolean {
  return zt.zone !== refZone;
}
