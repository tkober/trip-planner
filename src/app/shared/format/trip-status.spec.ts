import { DateTime } from 'luxon';
import { classifyTrips, TripForStatus } from './trip-status';

function trip(
  id: string,
  startDate: string,
  endDate: string,
  zone = 'Asia/Tokyo',
): TripForStatus & { id: string } {
  return { id, startDate, endDate, destinationTimeZone: zone };
}

describe('classifyTrips', () => {
  it('classifies a trip before it starts as upcoming', () => {
    const now = DateTime.fromISO('2026-03-01T10:00', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips([trip('a', '2026-04-09', '2026-04-24')], now);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['a']);
    expect(groups.current).toEqual([]);
    expect(groups.past).toEqual([]);
  });

  it('classifies a trip during its range as current', () => {
    const now = DateTime.fromISO('2026-04-15T10:00', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips([trip('a', '2026-04-09', '2026-04-24')], now);
    expect(groups.current.map((t) => t.id)).toEqual(['a']);
  });

  it('classifies a trip after it ends as past', () => {
    const now = DateTime.fromISO('2026-05-01T10:00', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips([trip('a', '2026-04-09', '2026-04-24')], now);
    expect(groups.past.map((t) => t.id)).toEqual(['a']);
  });

  it('includes the first day as current', () => {
    const now = DateTime.fromISO('2026-04-09T00:05', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips([trip('a', '2026-04-09', '2026-04-24')], now);
    expect(groups.current.map((t) => t.id)).toEqual(['a']);
  });

  it('includes the last day as current, up to its end', () => {
    const now = DateTime.fromISO('2026-04-24T23:55', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips([trip('a', '2026-04-09', '2026-04-24')], now);
    expect(groups.current.map((t) => t.id)).toEqual(['a']);
  });

  it('moves to past right after midnight on the day after it ends', () => {
    const now = DateTime.fromISO('2026-04-25T00:05', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips([trip('a', '2026-04-09', '2026-04-24')], now);
    expect(groups.past.map((t) => t.id)).toEqual(['a']);
  });

  it('resolves "today" in the destination zone, not the instant\'s own zone', () => {
    // 23:30 in Berlin on the 8th is already 06:30 on the 9th in Tokyo — the
    // trip should already read as running, not upcoming.
    const now = DateTime.fromISO('2026-04-08T23:30', { zone: 'Europe/Berlin' });
    const groups = classifyTrips([trip('a', '2026-04-09', '2026-04-24')], now);
    expect(groups.current.map((t) => t.id)).toEqual(['a']);
    expect(groups.upcoming).toEqual([]);
  });

  it('sorts upcoming trips soonest-first', () => {
    const now = DateTime.fromISO('2026-01-01T00:00', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips(
      [
        trip('late', '2026-12-01', '2026-12-10'),
        trip('soon', '2026-03-01', '2026-03-10'),
        trip('mid', '2026-06-01', '2026-06-10'),
      ],
      now,
    );
    expect(groups.upcoming.map((t) => t.id)).toEqual(['soon', 'mid', 'late']);
  });

  it('sorts past trips most-recently-ended-first', () => {
    const now = DateTime.fromISO('2027-01-01T00:00', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips(
      [
        trip('old', '2026-01-01', '2026-01-10'),
        trip('recent', '2026-11-01', '2026-11-10'),
        trip('mid', '2026-06-01', '2026-06-10'),
      ],
      now,
    );
    expect(groups.past.map((t) => t.id)).toEqual(['recent', 'mid', 'old']);
  });

  it('sorts several current trips by the one that started last first', () => {
    const now = DateTime.fromISO('2026-06-15T00:00', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips(
      [
        trip('early-start', '2026-06-01', '2026-06-30'),
        trip('late-start', '2026-06-10', '2026-06-20'),
      ],
      now,
    );
    expect(groups.current.map((t) => t.id)).toEqual([
      'late-start',
      'early-start',
    ]);
  });

  it('handles a mix of current, upcoming and past trips together', () => {
    const now = DateTime.fromISO('2026-06-15T00:00', { zone: 'Asia/Tokyo' });
    const groups = classifyTrips(
      [
        trip('running', '2026-06-01', '2026-06-30'),
        trip('future', '2026-08-01', '2026-08-10'),
        trip('done', '2026-01-01', '2026-01-10'),
      ],
      now,
    );
    expect(groups.current.map((t) => t.id)).toEqual(['running']);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['future']);
    expect(groups.past.map((t) => t.id)).toEqual(['done']);
  });
});
