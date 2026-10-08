/**
 * Pure helpers for the Columns view (D3, #47): how many day columns fit at a
 * given width, and how the visible window (the first visible day + the
 * column count) moves on resize/navigation/strip clicks. Kept free of
 * Angular/DOM so they're plain, unit-tested functions — `ColumnsView` only
 * wires them to a `ResizeObserver` and the toolbar/strip/keyboard events.
 */

/** Minimum width (px) a column needs before another one fits (see the issue). */
const COLUMN_MIN_WIDTH = 380;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 7;

/** `N = clamp(2, floor(availableWidth / 380), 7)`. */
export function computeColumnCount(availableWidth: number): number {
  if (!(availableWidth > 0)) return MIN_COLUMNS;
  const raw = Math.floor(availableWidth / COLUMN_MIN_WIDTH);
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, raw));
}

/** Clamp a window start so `[start, start + windowSize)` stays inside `[0, totalDays)`. */
export function clampWindowStart(
  start: number,
  windowSize: number,
  totalDays: number,
): number {
  if (totalDays <= 0) return 0;
  const maxStart = Math.max(0, totalDays - windowSize);
  return Math.min(Math.max(0, start), maxStart);
}

/**
 * Move the window by `delta` days (negative = earlier), clamped to the trip's
 * bounds — used for prev/next (`delta = ±1`) and shift-prev/next (`delta = ±windowSize`).
 */
export function navigateWindow(
  start: number,
  delta: number,
  windowSize: number,
  totalDays: number,
): number {
  return clampWindowStart(start + delta, windowSize, totalDays);
}

/**
 * Smallest adjustment to `start` that brings `index` into the visible window
 * (moves the window just enough, rather than re-centering) — used when a day
 * is clicked in the strip. `start` is returned unchanged when `index` is
 * already visible.
 */
export function windowContaining(
  index: number,
  start: number,
  windowSize: number,
  totalDays: number,
): number {
  if (totalDays <= 0) return 0;
  const clampedIndex = Math.min(Math.max(0, index), totalDays - 1);
  let next = start;
  if (clampedIndex < start) {
    next = clampedIndex;
  } else if (clampedIndex > start + windowSize - 1) {
    next = clampedIndex - windowSize + 1;
  }
  return clampWindowStart(next, windowSize, totalDays);
}

/**
 * Initial window start: today's index when the trip is running (so today is
 * the first visible day), else Day 1 (index 0) — see the issue's "beim
 * ersten Öffnen" rule. `todayIndex` is `undefined` when today falls outside
 * the trip.
 */
export function initialWindowStart(
  todayIndex: number | undefined,
  windowSize: number,
  totalDays: number,
): number {
  if (todayIndex === undefined) return 0;
  return clampWindowStart(todayIndex, windowSize, totalDays);
}
