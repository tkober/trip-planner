import { DateTime } from 'luxon';
import { nextEntryToday } from './next-entry';
import { ActivityDto, TransportDto } from '../../models/trip.model';

const DEST = 'Asia/Tokyo';

function activity(title: string, dateTime: string, zone = DEST): ActivityDto {
  return { id: title, title, start: { dateTime, zone } } as ActivityDto;
}

function transport(
  id: string,
  dateTime: string,
  zone = DEST,
  extra: Partial<TransportDto> = {},
): TransportDto {
  return {
    id,
    mode: 'train',
    start: { dateTime, zone },
    fromLocation: 'Tokyo',
    toLocation: 'Kyoto',
    ...extra,
  } as TransportDto;
}

function trip(activities: ActivityDto[], transport: TransportDto[]) {
  return { activities, transport, destinationTimeZone: DEST };
}

describe('nextEntryToday', () => {
  it('finds the soonest activity after now, today', () => {
    const t = trip(
      [
        activity('Shrine visit', '2026-10-07T09:00'),
        activity('Dinner', '2026-10-07T19:00'),
      ],
      [],
    );
    const now = DateTime.fromISO('2026-10-07T12:00', { zone: DEST });
    expect(nextEntryToday(t, now)).toEqual({
      label: 'Dinner',
      time: '19:00',
    });
  });

  it('returns transport via its route label', () => {
    const t = trip([], [transport('tr1', '2026-10-07T14:30')]);
    const now = DateTime.fromISO('2026-10-07T12:00', { zone: DEST });
    expect(nextEntryToday(t, now)).toEqual({
      label: 'Tokyo → Kyoto',
      time: '14:30',
    });
  });

  it('picks the earliest of mixed activities and transport', () => {
    const t = trip(
      [activity('Late lunch', '2026-10-07T18:00')],
      [transport('tr1', '2026-10-07T14:30')],
    );
    const now = DateTime.fromISO('2026-10-07T12:00', { zone: DEST });
    expect(nextEntryToday(t, now)?.label).toBe('Tokyo → Kyoto');
  });

  it('ignores entries that already started', () => {
    const t = trip([activity('Breakfast', '2026-10-07T08:00')], []);
    const now = DateTime.fromISO('2026-10-07T12:00', { zone: DEST });
    expect(nextEntryToday(t, now)).toBeUndefined();
  });

  it('ignores entries on a different day', () => {
    const t = trip([activity('Tomorrow trip', '2026-10-08T09:00')], []);
    const now = DateTime.fromISO('2026-10-07T12:00', { zone: DEST });
    expect(nextEntryToday(t, now)).toBeUndefined();
  });

  it('returns undefined when nothing is left today', () => {
    const t = trip([], []);
    const now = DateTime.fromISO('2026-10-07T12:00', { zone: DEST });
    expect(nextEntryToday(t, now)).toBeUndefined();
  });

  it('resolves "today" in the destination zone for an entry stored in a different zone', () => {
    // 23:00 UTC on the 7th is already 08:00 on the 8th in Tokyo.
    const t = trip(
      [activity('Early walk', '2026-10-08T08:30', DEST)],
      [],
    );
    const now = DateTime.fromISO('2026-10-07T23:00', { zone: 'UTC' });
    expect(nextEntryToday(t, now)).toEqual({
      label: 'Early walk',
      time: '08:30',
    });
  });
});
