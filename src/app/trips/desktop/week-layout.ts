/**
 * Pure helpers for the Week view (D4, #48): how many day columns to show at a
 * given width, splitting a day-crossing entry's local time span into one
 * segment per calendar day it touches, lane-packing same-day overlaps, and
 * sizing the hour grid. Kept free of Angular/DOM (plain functions over plain
 * data) so they're independently unit-tested — `WeekView` only wires them to
 * a `ResizeObserver`, `TimeZoneService` conversions and the template.
 *
 * Window navigation (clamping/advancing the visible window inside the trip's
 * bounds) reuses `columns-layout.ts`'s `clampWindowStart`/`navigateWindow`/
 * `windowContaining`/`initialWindowStart` directly — the Week window just has
 * a fixed size (5 or 7) instead of one computed from the available width.
 */

/** Below this width the week shows 5 days instead of 7 (see the issue). */
const NARROW_WIDTH_THRESHOLD = 1100;

/** `7` days, or `5` below `NARROW_WIDTH_THRESHOLD`. */
export function computeWeekWindowSize(availableWidth: number): 5 | 7 {
  return availableWidth < NARROW_WIDTH_THRESHOLD ? 5 : 7;
}

// --- Date-key arithmetic (UTC-anchored so it never drifts with the host's
// own local time zone) -------------------------------------------------------

/** Add (or subtract, for a negative `days`) whole days to a "YYYY-MM-DD" key. */
export function addDaysToDateKey(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (positive when `b` is later). */
export function dayKeyDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * An end reading as exactly midnight (minute 0) is the close of the day
 * before, not the opening instant of the next one — same "end at midnight
 * doesn't cross" rule as `day-span.ts`'s `localDayKey`. Normalizes a raw
 * end date/minute pair before splitting, so "21:00 → 00:00" reads as one
 * block ending at the bottom of its day rather than a one-instant sliver of
 * the next.
 */
export function normalizeEndOfDay(date: string, minutes: number): { date: string; minutes: number } {
  if (minutes !== 0) return { date, minutes };
  return { date: addDaysToDateKey(date, -1), minutes: 1440 };
}

// --- Splitting a day-crossing entry into per-day segments -------------------

export interface DaySegment {
  /** Destination-tz calendar date this segment is drawn on. */
  date: string;
  /** Minutes from midnight (0-1440) where the segment starts on `date`. */
  startMin: number;
  /** Minutes from midnight (0-1440) where the segment ends on `date`. */
  endMin: number;
  /** True for every segment after the first — render the "continues from
   * the previous day" arrow marker at its top. */
  continuesFromPrev: boolean;
  /** True for every segment before the last — render the "continues onto
   * the next day" arrow marker at its bottom. */
  continuesToNext: boolean;
}

/**
 * Split a start/end local time span (already resolved to destination-tz wall
 * time) into one segment per calendar day it touches. A span within one day
 * returns a single segment; a span crossing N midnights returns N+1 segments,
 * the first running to 1440 and the last starting at 0, with any full days in
 * between spanning 0-1440.
 */
export function splitAcrossDays(
  startDate: string,
  startMin: number,
  rawEndDate: string,
  rawEndMin: number,
): DaySegment[] {
  const { date: endDate, minutes: endMin } = normalizeEndOfDay(rawEndDate, rawEndMin);
  const span = dayKeyDiff(startDate, endDate);

  if (span <= 0) {
    return [
      {
        date: startDate,
        startMin,
        endMin: Math.max(endMin, startMin),
        continuesFromPrev: false,
        continuesToNext: false,
      },
    ];
  }

  const segments: DaySegment[] = [
    { date: startDate, startMin, endMin: 1440, continuesFromPrev: false, continuesToNext: true },
  ];
  for (let i = 1; i < span; i++) {
    segments.push({
      date: addDaysToDateKey(startDate, i),
      startMin: 0,
      endMin: 1440,
      continuesFromPrev: true,
      continuesToNext: true,
    });
  }
  segments.push({ date: endDate, startMin: 0, endMin, continuesFromPrev: true, continuesToNext: false });
  return segments;
}

// --- Lane packing (same-day overlaps stand side by side, never overlap) -----

export interface LanePlacement {
  /** 0-based lane index within its overlap cluster. */
  lane: number;
  /** Total lanes in the cluster — width = `100 / lanes`%. */
  lanes: number;
}

/**
 * Assign each block a lane so overlapping blocks stand side by side instead
 * of covering one another — a classic greedy interval-graph packing: sweep
 * blocks by start time, give each the lowest-numbered lane whose current
 * occupant has already ended; blocks that never overlap (a gap in time) form
 * a fresh cluster and don't inflate each other's lane count.
 */
export function packLanes(
  blocks: readonly { id: string; startMin: number; endMin: number }[],
): Map<string, LanePlacement> {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result = new Map<string, LanePlacement>();

  let laneEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  let clusterMembers: string[] = [];
  let clusterLaneOf = new Map<string, number>();
  let clusterMaxLane = 0;

  const flushCluster = (): void => {
    for (const id of clusterMembers) {
      result.set(id, { lane: clusterLaneOf.get(id)!, lanes: clusterMaxLane + 1 });
    }
    laneEnds = [];
    clusterMembers = [];
    clusterLaneOf = new Map();
    clusterMaxLane = 0;
  };

  for (const b of sorted) {
    if (b.startMin >= clusterEnd) {
      flushCluster();
      clusterEnd = Number.NEGATIVE_INFINITY;
    }
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > b.startMin) lane++;
    laneEnds[lane] = b.endMin;
    clusterLaneOf.set(b.id, lane);
    clusterMembers.push(b.id);
    clusterMaxLane = Math.max(clusterMaxLane, lane);
    clusterEnd = Math.max(clusterEnd, b.endMin);
  }
  flushCluster();

  return result;
}

// --- Hour range + row height -------------------------------------------------

export interface HourRange {
  startHour: number;
  endHour: number;
}

const MIN_RANGE_START_HOUR = 8;
const MIN_RANGE_END_HOUR = 20;

/**
 * The grid's hour range: the earliest start / latest end across the visible
 * days' blocks, rounded outward to full hours, but never narrower than
 * 08:00-20:00 (see the issue).
 */
export function computeHourRange(
  blocks: readonly { startMin: number; endMin: number }[],
): HourRange {
  if (!blocks.length) return { startHour: MIN_RANGE_START_HOUR, endHour: MIN_RANGE_END_HOUR };
  const earliest = Math.min(...blocks.map((b) => b.startMin));
  const latest = Math.max(...blocks.map((b) => b.endMin));
  const startHour = Math.max(0, Math.min(MIN_RANGE_START_HOUR, Math.floor(earliest / 60)));
  const endHour = Math.min(24, Math.max(MIN_RANGE_END_HOUR, Math.ceil(latest / 60)));
  return { startHour, endHour };
}

/** Minimum px per hour row — below this the grid scrolls instead of shrinking further. */
const MIN_ROW_HEIGHT = 28;

/**
 * Row height (px/hour) that fits `hourCount` hours into `availableHeight`
 * without scrolling, down to a floor of 28px/hour — once the floor is hit the
 * grid's total height exceeds `availableHeight` and the caller scrolls it.
 */
export function computeRowHeight(hourCount: number, availableHeight: number): number {
  if (hourCount <= 0) return MIN_ROW_HEIGHT;
  return Math.max(MIN_ROW_HEIGHT, Math.floor(availableHeight / hourCount));
}
