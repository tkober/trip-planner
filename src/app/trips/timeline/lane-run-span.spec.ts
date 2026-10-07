import { runRowSpan } from './lane-run-span';

describe('runRowSpan', () => {
  it('spans the full run when it is not a switch start', () => {
    expect(runRowSpan(2, 5, false, 0)).toBe('3 / 7');
  });

  it('adds the row offset for a trip with a leading virtual day', () => {
    expect(runRowSpan(2, 5, false, 1)).toBe('4 / 8');
  });

  it('skips the first day row when it is a switch start, handing it to the earlier run', () => {
    // Hakone Ginyu checks in the day Shinjuku Granbell checks out: its box
    // must not claim that shared day, so its own first row is the day after.
    expect(runRowSpan(5, 10, true, 0)).toBe('7 / 12');
  });

  it('keeps at least the last row for a 1-day run whose start is a switch', () => {
    // A same-day pickup/dropoff car reservation immediately following
    // another's dropoff: shrinking the start past the end would invert the
    // span, so it clamps to just the shared day.
    expect(runRowSpan(4, 4, true, 0)).toBe('5 / 6');
  });

  it('is order-independent for start/end (mirrors Math.min/Math.max use elsewhere)', () => {
    expect(runRowSpan(5, 2, false, 0)).toBe('3 / 7');
  });

  it('two adjacent runs never claim the same row', () => {
    // Run A: days 0-3 (checks out day 3). Run B: days 3-6 (checks in day 3,
    // a switch). Their spans must be disjoint.
    const a = runRowSpan(0, 3, false, 0);
    const b = runRowSpan(3, 6, true, 0);
    expect(a).toBe('1 / 5'); // rows 1-4 (days 0-3)
    expect(b).toBe('5 / 8'); // rows 5-7 (days 4-6) — row 4 (day 3) excluded
  });
});
