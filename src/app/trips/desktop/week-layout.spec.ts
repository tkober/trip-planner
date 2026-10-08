import { describe, expect, it } from 'vitest';
import {
  addDaysToDateKey,
  computeHourRange,
  computeRowHeight,
  computeWeekWindowSize,
  dayKeyDiff,
  normalizeEndOfDay,
  packLanes,
  splitAcrossDays,
} from './week-layout';

describe('computeWeekWindowSize', () => {
  it('shows 5 days below 1100px', () => {
    expect(computeWeekWindowSize(0)).toBe(5);
    expect(computeWeekWindowSize(1099)).toBe(5);
  });

  it('shows 7 days at/above 1100px', () => {
    expect(computeWeekWindowSize(1100)).toBe(7);
    expect(computeWeekWindowSize(3440)).toBe(7);
  });
});

describe('addDaysToDateKey / dayKeyDiff', () => {
  it('adds and subtracts whole days, including across months/years', () => {
    expect(addDaysToDateKey('2026-11-23', 1)).toBe('2026-11-24');
    expect(addDaysToDateKey('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysToDateKey('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('diffs two date keys in whole days', () => {
    expect(dayKeyDiff('2026-11-23', '2026-11-24')).toBe(1);
    expect(dayKeyDiff('2026-11-24', '2026-11-23')).toBe(-1);
    expect(dayKeyDiff('2026-11-23', '2026-11-23')).toBe(0);
    expect(dayKeyDiff('2026-11-23', '2026-11-26')).toBe(3);
  });
});

describe('normalizeEndOfDay', () => {
  it('leaves a non-midnight minute unchanged', () => {
    expect(normalizeEndOfDay('2026-11-24', 90)).toEqual({ date: '2026-11-24', minutes: 90 });
  });

  it('reads exact midnight as the close of the previous day', () => {
    expect(normalizeEndOfDay('2026-11-24', 0)).toEqual({ date: '2026-11-23', minutes: 1440 });
  });
});

describe('splitAcrossDays', () => {
  it('returns one segment for a same-day span', () => {
    expect(splitAcrossDays('2026-11-23', 540, '2026-11-23', 600)).toEqual([
      { date: '2026-11-23', startMin: 540, endMin: 600, continuesFromPrev: false, continuesToNext: false },
    ]);
  });

  it('does not split when the end reads exactly at midnight (same-day rule)', () => {
    // "21:00 -> 00:00" is one evening, not a sliver of the next day.
    expect(splitAcrossDays('2026-11-23', 1260, '2026-11-24', 0)).toEqual([
      { date: '2026-11-23', startMin: 1260, endMin: 1440, continuesFromPrev: false, continuesToNext: false },
    ]);
  });

  it('splits an entry crossing one midnight into two segments', () => {
    expect(splitAcrossDays('2026-11-23', 1380, '2026-11-24', 60)).toEqual([
      { date: '2026-11-23', startMin: 1380, endMin: 1440, continuesFromPrev: false, continuesToNext: true },
      { date: '2026-11-24', startMin: 0, endMin: 60, continuesFromPrev: true, continuesToNext: false },
    ]);
  });

  it('splits a multi-day entry into one segment per day, full days in between', () => {
    const segments = splitAcrossDays('2026-11-23', 1200, '2026-11-25', 120);
    expect(segments).toEqual([
      { date: '2026-11-23', startMin: 1200, endMin: 1440, continuesFromPrev: false, continuesToNext: true },
      { date: '2026-11-24', startMin: 0, endMin: 1440, continuesFromPrev: true, continuesToNext: true },
      { date: '2026-11-25', startMin: 0, endMin: 120, continuesFromPrev: true, continuesToNext: false },
    ]);
  });
});

describe('packLanes', () => {
  it('gives a single lane to non-overlapping blocks', () => {
    const result = packLanes([
      { id: 'a', startMin: 0, endMin: 60 },
      { id: 'b', startMin: 60, endMin: 120 },
      { id: 'c', startMin: 200, endMin: 260 },
    ]);
    expect(result.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(result.get('b')).toEqual({ lane: 0, lanes: 1 });
    expect(result.get('c')).toEqual({ lane: 0, lanes: 1 });
  });

  it('puts two overlapping blocks side by side (2 lanes)', () => {
    const result = packLanes([
      { id: 'a', startMin: 0, endMin: 120 },
      { id: 'b', startMin: 60, endMin: 180 },
    ]);
    expect(result.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(result.get('b')).toEqual({ lane: 1, lanes: 2 });
  });

  it('gives three mutually overlapping blocks three lanes', () => {
    const result = packLanes([
      { id: 'a', startMin: 0, endMin: 180 },
      { id: 'b', startMin: 30, endMin: 150 },
      { id: 'c', startMin: 60, endMin: 120 },
    ]);
    expect(result.get('a')!.lanes).toBe(3);
    expect(result.get('b')!.lanes).toBe(3);
    expect(result.get('c')!.lanes).toBe(3);
    expect(new Set([result.get('a')!.lane, result.get('b')!.lane, result.get('c')!.lane]).size).toBe(3);
  });

  it('starts a fresh cluster once every lane has freed up (touching, not overlapping)', () => {
    const result = packLanes([
      { id: 'a', startMin: 0, endMin: 60 },
      { id: 'b', startMin: 0, endMin: 60 },
      { id: 'c', startMin: 60, endMin: 120 }, // starts exactly as a/b end -> own cluster
    ]);
    expect(result.get('c')!.lane).toBe(0);
    expect(result.get('a')!.lanes).toBe(2);
    expect(result.get('c')!.lanes).toBe(1);
  });

  it('keeps overlapping blocks in one cluster when a third starts before the first ends', () => {
    const result = packLanes([
      { id: 'a', startMin: 0, endMin: 90 },
      { id: 'b', startMin: 0, endMin: 60 },
      { id: 'c', startMin: 60, endMin: 120 }, // overlaps `a` (still running), not `b`
    ]);
    expect(result.get('a')!.lanes).toBe(2);
    expect(result.get('b')!.lanes).toBe(2);
    expect(result.get('c')!.lanes).toBe(2);
    expect(result.get('c')!.lane).toBe(0); // b's lane (0) freed at minute 60
  });

  it('does not let a later, unrelated cluster inflate an earlier one', () => {
    const result = packLanes([
      { id: 'a', startMin: 0, endMin: 60 },
      { id: 'b', startMin: 0, endMin: 60 },
      { id: 'x', startMin: 200, endMin: 260 },
      { id: 'y', startMin: 200, endMin: 260 },
      { id: 'z', startMin: 200, endMin: 260 },
    ]);
    expect(result.get('a')!.lanes).toBe(2);
    expect(result.get('x')!.lanes).toBe(3);
  });
});

describe('computeHourRange', () => {
  it('defaults to 08:00-20:00 with no blocks', () => {
    expect(computeHourRange([])).toEqual({ startHour: 8, endHour: 20 });
  });

  it('never narrows below 08:00-20:00', () => {
    expect(computeHourRange([{ startMin: 9 * 60, endMin: 17 * 60 }])).toEqual({
      startHour: 8,
      endHour: 20,
    });
  });

  it('widens outward to full hours for an earlier/later block', () => {
    expect(computeHourRange([{ startMin: 6 * 60 + 30, endMin: 21 * 60 + 15 }])).toEqual({
      startHour: 6,
      endHour: 22,
    });
  });
});

describe('computeRowHeight', () => {
  it('fits the range into the viewport when that keeps it above the floor', () => {
    expect(computeRowHeight(12, 500)).toBe(41);
  });

  it('floors at 28px/hour even when that overflows the viewport', () => {
    expect(computeRowHeight(20, 400)).toBe(28);
  });

  it('falls back to the floor for a degenerate hour count', () => {
    expect(computeRowHeight(0, 500)).toBe(28);
  });
});
