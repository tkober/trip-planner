import { DateTime } from 'luxon';
import { tripContextLabel } from './trip-context';

function trip(startDate: string, endDate: string, zone = 'Asia/Tokyo') {
  return { startDate, endDate, destinationTimeZone: zone };
}

describe('tripContextLabel', () => {
  it('reports days until a trip that starts later', () => {
    expect(
      tripContextLabel(
        trip('2026-04-09', '2026-04-24'),
        DateTime.fromISO('2026-03-28T10:00', { zone: 'Asia/Tokyo' }),
      ),
    ).toBe('Starts in 12 days');
  });

  it('says "Starts tomorrow" exactly one day out', () => {
    expect(
      tripContextLabel(
        trip('2026-04-09', '2026-04-24'),
        DateTime.fromISO('2026-04-08T10:00', { zone: 'Asia/Tokyo' }),
      ),
    ).toBe('Starts tomorrow');
  });

  it('reports Day 1 on the first day', () => {
    expect(
      tripContextLabel(
        trip('2026-04-09', '2026-04-24'),
        DateTime.fromISO('2026-04-09T08:00', { zone: 'Asia/Tokyo' }),
      ),
    ).toBe('Day 1 of 16 · Thu, 9 Apr');
  });

  it('reports a middle day', () => {
    expect(
      tripContextLabel(
        trip('2026-04-09', '2026-04-24'),
        DateTime.fromISO('2026-04-15T08:00', { zone: 'Asia/Tokyo' }),
      ),
    ).toBe('Day 7 of 16 · Wed, 15 Apr');
  });

  it('reports the last day', () => {
    expect(
      tripContextLabel(
        trip('2026-04-09', '2026-04-24'),
        DateTime.fromISO('2026-04-24T20:00', { zone: 'Asia/Tokyo' }),
      ),
    ).toBe('Day 16 of 16 · Fri, 24 Apr');
  });

  it('reports the date range after the trip has ended', () => {
    expect(
      tripContextLabel(
        trip('2026-04-09', '2026-04-24'),
        DateTime.fromISO('2026-04-25T00:30', { zone: 'Asia/Tokyo' }),
      ),
    ).toBe('9–24 Apr 2026');
  });

  it('resolves "today" in the destination zone, not the instant\'s own zone', () => {
    // 23:30 in Berlin on the 8th is already 06:30 on the 9th in Tokyo (+7h,
    // no DST in Japan) — the trip should already read as "Day 1".
    expect(
      tripContextLabel(
        trip('2026-04-09', '2026-04-24'),
        DateTime.fromISO('2026-04-08T23:30', { zone: 'Europe/Berlin' }),
      ),
    ).toBe('Day 1 of 16 · Thu, 9 Apr');
  });
});
