import { canShift, shift, StayDates } from './stay-nudge';

describe('canShift / shift — accommodation', () => {
  it('allows start −1 (always widens)', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-14' };
    expect(canShift('accommodation', 'start', -1, dates)).toBe(true);
    expect(shift('start', -1, dates)).toEqual({
      start: '2026-04-12',
      end: '2026-04-14',
    });
  });

  it('allows end +1 (always widens)', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-14' };
    expect(canShift('accommodation', 'end', 1, dates)).toBe(true);
    expect(shift('end', 1, dates)).toEqual({
      start: '2026-04-13',
      end: '2026-04-15',
    });
  });

  it('allows start +1 when it still leaves a night', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-15' };
    expect(canShift('accommodation', 'start', 1, dates)).toBe(true);
    expect(shift('start', 1, dates)).toEqual({
      start: '2026-04-14',
      end: '2026-04-15',
    });
  });

  it('blocks start +1 on a 1-night stay (would collapse to 0 nights)', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-14' };
    expect(canShift('accommodation', 'start', 1, dates)).toBe(false);
  });

  it('allows end −1 when it still leaves a night', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-15' };
    expect(canShift('accommodation', 'end', -1, dates)).toBe(true);
    expect(shift('end', -1, dates)).toEqual({
      start: '2026-04-13',
      end: '2026-04-14',
    });
  });

  it('blocks end −1 on a 1-night stay (would collapse to 0 nights)', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-14' };
    expect(canShift('accommodation', 'end', -1, dates)).toBe(false);
  });

  it('handles a month boundary (start −1 from the 1st)', () => {
    const dates: StayDates = { start: '2026-05-01', end: '2026-05-03' };
    expect(shift('start', -1, dates)).toEqual({
      start: '2026-04-30',
      end: '2026-05-03',
    });
  });

  it('handles a year boundary (end +1 into January)', () => {
    const dates: StayDates = { start: '2025-12-30', end: '2025-12-31' };
    expect(shift('end', 1, dates)).toEqual({
      start: '2025-12-30',
      end: '2026-01-01',
    });
  });
});

describe('canShift / shift — car reservation', () => {
  it('allows start +1 up to meeting dropoff (same-day rental is OK)', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-14' };
    expect(canShift('car', 'start', 1, dates)).toBe(true);
    expect(shift('start', 1, dates)).toEqual({
      start: '2026-04-14',
      end: '2026-04-14',
    });
  });

  it('blocks start +1 once pickup would pass dropoff', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-13' };
    expect(canShift('car', 'start', 1, dates)).toBe(false);
  });

  it('allows end −1 down to meeting pickup (same-day rental is OK)', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-14' };
    expect(canShift('car', 'end', -1, dates)).toBe(true);
    expect(shift('end', -1, dates)).toEqual({
      start: '2026-04-13',
      end: '2026-04-13',
    });
  });

  it('blocks end −1 once dropoff would pass pickup', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-13' };
    expect(canShift('car', 'end', -1, dates)).toBe(false);
  });

  it('allows start −1 (always widens)', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-13' };
    expect(canShift('car', 'start', -1, dates)).toBe(true);
  });

  it('allows end +1 (always widens)', () => {
    const dates: StayDates = { start: '2026-04-13', end: '2026-04-13' };
    expect(canShift('car', 'end', 1, dates)).toBe(true);
  });

  it('handles a month boundary (end +1 into May)', () => {
    const dates: StayDates = { start: '2026-04-29', end: '2026-04-30' };
    expect(shift('end', 1, dates)).toEqual({
      start: '2026-04-29',
      end: '2026-05-01',
    });
  });

  it('handles a year boundary (start −1 from Jan 1)', () => {
    const dates: StayDates = { start: '2026-01-01', end: '2026-01-02' };
    expect(shift('start', -1, dates)).toEqual({
      start: '2025-12-31',
      end: '2026-01-02',
    });
  });
});
