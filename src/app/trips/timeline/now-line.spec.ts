import { DateTime } from 'luxon';
import { computeNowLine } from './now-line';
import { CarDeadline, DayItem } from './day-section';
import { ActivityDto, CarReservationDto, TimelineEntry } from '../../models/trip.model';

const DEST = 'Asia/Tokyo';

function millis(iso: string, zone = DEST): number {
  return DateTime.fromISO(iso, { zone }).toMillis();
}

function activityItem(key: string, startIso: string, zone = DEST): DayItem {
  const activity = { id: key, title: key, start: { dateTime: startIso, zone } } as ActivityDto;
  const entry: TimelineEntry = { kind: 'activity', activity, start: activity.start };
  return { key, sortMillis: millis(startIso, zone), entry };
}

function deadlineItem(key: string, sortMillis: number): DayItem {
  const deadline: CarDeadline = {
    car: { id: 'c1', name: 'Car' } as CarReservationDto,
    kind: 'pickup',
    label: 'Fetch by',
    time: '',
    company: '',
    location: '',
    color: '',
  };
  return { key, sortMillis, deadline };
}

describe('computeNowLine', () => {
  it('inserts before the first item that starts after now', () => {
    const items = [
      activityItem('a', '2026-10-07T09:00'),
      activityItem('b', '2026-10-07T15:00'),
      activityItem('c', '2026-10-07T20:00'),
    ];
    const now = millis('2026-10-07T12:00');
    const result = computeNowLine(items, now, DEST);
    expect(result.insertIndex).toBe(1);
    expect(result.upNextKey).toBe('b');
    expect(result.label).toBe('Now 12:00');
  });

  it('places the line at the top when now is before the first item', () => {
    const items = [activityItem('a', '2026-10-07T09:00')];
    const now = millis('2026-10-07T06:00');
    const result = computeNowLine(items, now, DEST);
    expect(result.insertIndex).toBe(0);
    expect(result.upNextKey).toBe('a');
  });

  it('places the line at the bottom with no "Up next" when now is after the last item', () => {
    const items = [
      activityItem('a', '2026-10-07T09:00'),
      activityItem('b', '2026-10-07T15:00'),
    ];
    const now = millis('2026-10-07T23:00');
    const result = computeNowLine(items, now, DEST);
    expect(result.insertIndex).toBe(items.length);
    expect(result.upNextKey).toBeUndefined();
  });

  it('treats an item with no end the same as any other — only start matters', () => {
    const items = [activityItem('a', '2026-10-07T09:00')];
    const now = millis('2026-10-07T23:00');
    const result = computeNowLine(items, now, DEST);
    expect(result.insertIndex).toBe(1);
  });

  it('counts an untimed deadline (sortMillis -Infinity) as before now', () => {
    const items = [
      deadlineItem('d', Number.NEGATIVE_INFINITY),
      activityItem('a', '2026-10-07T15:00'),
    ];
    const now = millis('2026-10-07T09:00');
    const result = computeNowLine(items, now, DEST);
    expect(result.insertIndex).toBe(1);
    expect(result.upNextKey).toBe('a');
  });

  it('never marks a deadline pill as "Up next", only an entry', () => {
    const items = [
      activityItem('a', '2026-10-07T08:00'),
      deadlineItem('d', millis('2026-10-07T10:00')),
      activityItem('b', '2026-10-07T15:00'),
    ];
    const now = millis('2026-10-07T09:00');
    const result = computeNowLine(items, now, DEST);
    expect(result.insertIndex).toBe(1); // the deadline is the first item after now
    expect(result.upNextKey).toBe('b'); // but it's skipped for "Up next"
  });

  it('compares absolute instants, so a transport entry in another zone still orders correctly', () => {
    // Departs Berlin 08:00 (= 15:00 Tokyo that same instant), well before "now".
    const items = [
      activityItem('berlin-leg', '2026-10-07T08:00', 'Europe/Berlin'),
      activityItem('tokyo-evening', '2026-10-07T20:00', DEST),
    ];
    const now = millis('2026-10-07T16:00'); // 16:00 Tokyo
    const result = computeNowLine(items, now, DEST);
    expect(result.insertIndex).toBe(1);
    expect(result.upNextKey).toBe('tokyo-evening');
  });
});
