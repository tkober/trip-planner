/**
 * Grid-row span for a lane label (hotel stay name / car reservation name),
 * R10.1. `startIndex`/`endIndex` are the 0-based day indices the run (a stay
 * or a car reservation) covers; `offset` is `TimelineView.rowOffset()` (the
 * number of prepended virtual rows).
 *
 * A lane run's *colour* follows the half-day handoff (it starts in the
 * bottom half of its first day, ends in the top half of its last — see
 * `HotelCell`), but a CSS grid row can't be split sub-row without a per-day
 * subgrid. So two adjacent runs that share a switch day (one ends the day
 * the other begins) can't both own that day's full grid row — if they did,
 * their sticky names would render in the same grid cell and garble
 * together. `switchStart` (true when some OTHER run's end date equals this
 * run's start date) resolves that: the row is handed to the EARLIER
 * (ending) run only, and the LATER (starting) run's box begins the day
 * after. A 1-day run whose start is itself a switch still gets at least its
 * own last row (`Math.min(..., endIndex)`), rather than an inverted,
 * invalid span.
 */
export function runRowSpan(
  startIndex: number,
  endIndex: number,
  switchStart: boolean,
  offset: number,
): string {
  const lo = Math.min(startIndex, endIndex);
  const hi = Math.max(startIndex, endIndex);
  const start = Math.min(switchStart ? lo + 1 : lo, hi);
  return `${start + 1 + offset} / ${hi + 2 + offset}`;
}
