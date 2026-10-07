import { DateTime } from 'luxon';
import { DayItem } from './day-section';

/** Where today's now-line goes and which item (if any) is "Up next". */
export interface NowLineResult {
  /**
   * Index in `items` to render the line before (`items.length` when now is
   * after every item — the line then renders at the bottom of the day).
   */
  insertIndex: number;
  /** "Now 14:05" label, in the destination tz. */
  label: string;
  /** Key of the first entry (not a deadline pill) whose start is after now. */
  upNextKey?: string;
}

/**
 * Pure placement logic for the mobile-only "now" line + "Up next" card (R4),
 * given today's items (already chronologically sorted by `TimelineView.layout`,
 * untimed deadlines first via `sortMillis: -Infinity`) and the current instant
 * as epoch millis (zone-independent — a transport entry whose own zone differs
 * from the destination tz still compares correctly since `sortMillis` is an
 * absolute instant). No DOM/service dependency, so it's unit-testable with a
 * fixed `nowMillis`.
 */
export function computeNowLine(
  items: DayItem[],
  nowMillis: number,
  destZone: string,
): NowLineResult {
  let insertIndex = items.length;
  for (let i = 0; i < items.length; i++) {
    if (items[i].sortMillis > nowMillis) {
      insertIndex = i;
      break;
    }
  }
  // "Up next" only ever marks an entry card, never a deadline pill.
  const upNext = items.slice(insertIndex).find((it) => it.entry);
  const label = `Now ${DateTime.fromMillis(nowMillis, { zone: destZone }).toFormat('HH:mm')}`;
  return { insertIndex, label, upNextKey: upNext?.key };
}
