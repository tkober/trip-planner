import { describe, expect, it } from 'vitest';
import {
  activeDayFromScroll,
  buildDayMapContent,
  buildMapContent,
  collectPoints,
  countWithoutLocation,
  initialSelectedDate,
  selectionRange,
} from './map-layout';
import { TripDayModel, TripDayEntryItem } from './trip-day-model';
import {
  AccommodationDto,
  ActivityDto,
  TimelineEntry,
  TransportDto,
} from '../../models/trip.model';

function activity(partial: Partial<ActivityDto> = {}): ActivityDto {
  return {
    id: 'a1',
    title: 'Visit castle',
    start: { dateTime: '2026-11-22T09:00', zone: 'Asia/Tokyo' },
    ...partial,
  };
}

function transport(partial: Partial<TransportDto> = {}): TransportDto {
  return {
    id: 't1',
    mode: 'car',
    start: { dateTime: '2026-11-22T10:00', zone: 'Asia/Tokyo' },
    ...partial,
  };
}

function entryItem(entry: TimelineEntry, sortMillis = 0): TripDayEntryItem {
  return { kind: 'entry', entry, sortMillis };
}

function accommodation(partial: Partial<AccommodationDto> = {}): AccommodationDto {
  return {
    id: 'acc1',
    name: 'Dormy Inn',
    checkInDate: '2026-11-22',
    checkOutDate: '2026-11-23',
    ...partial,
  };
}

function day(partial: Partial<TripDayModel> = {}): TripDayModel {
  return {
    index: 1,
    date: '2026-11-22',
    weekday: 'Sun',
    dayOfMonth: '22',
    month: 'Nov',
    items: [],
    stay: { text: '', color: '' },
    ...partial,
  };
}

describe('buildDayMapContent', () => {
  it('numbers located activities and counts a missing one', () => {
    const act1: TimelineEntry = {
      kind: 'activity',
      activity: activity({ id: 'a1', geo: { lat: 1, lng: 1 } }),
      start: { dateTime: '2026-11-22T08:00', zone: 'Asia/Tokyo' },
    };
    const act2: TimelineEntry = {
      kind: 'activity',
      activity: activity({ id: 'a2' }), // no geo
      start: { dateTime: '2026-11-22T09:00', zone: 'Asia/Tokyo' },
    };
    const d = day({ items: [entryItem(act1, 1), entryItem(act2, 2)] });

    const result = buildDayMapContent(d, true);

    expect(result.markers).toHaveLength(1);
    expect(result.markers[0].number).toBe(1);
    expect(result.markers[0].active).toBe(true);
    expect(result.missing).toBe(1);
    expect(result.lines).toHaveLength(0);
    expect(result.stay).toBeUndefined();
  });

  it('draws a line for a transport leg with both endpoints, dashed for flights', () => {
    const leg: TimelineEntry = {
      kind: 'transport',
      transport: transport({
        id: 't1',
        mode: 'flight',
        fromGeo: { lat: 1, lng: 1 },
        toGeo: { lat: 2, lng: 2 },
      }),
      start: { dateTime: '2026-11-22T08:00', zone: 'Asia/Tokyo' },
    };
    const d = day({ items: [entryItem(leg)] });

    const result = buildDayMapContent(d, false);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].dashed).toBe(true);
    expect(result.lines[0].number).toBe(1);
    expect(result.lines[0].active).toBe(false);
    expect(result.markers).toHaveLength(0);
    expect(result.missing).toBe(0);
  });

  it('draws a single marker for a transport leg with only one located endpoint', () => {
    const leg: TimelineEntry = {
      kind: 'transport',
      transport: transport({ id: 't1', fromGeo: { lat: 1, lng: 1 } }),
      start: { dateTime: '2026-11-22T08:00', zone: 'Asia/Tokyo' },
    };
    const d = day({ items: [entryItem(leg)] });

    const result = buildDayMapContent(d, false);

    expect(result.markers).toHaveLength(1);
    expect(result.markers[0].point).toEqual({ lat: 1, lng: 1 });
    expect(result.lines).toHaveLength(0);
    expect(result.missing).toBe(0);
  });

  it('adds a bed marker for the covering stay, only when it has a geo', () => {
    const d = day({
      stay: {
        text: 'Dormy Inn',
        color: '#1565c0',
        accommodation: accommodation({ geo: { lat: 3, lng: 3 } }),
      },
    });

    const result = buildDayMapContent(d, true);

    expect(result.stay).toBeDefined();
    expect(result.stay!.point).toEqual({ lat: 3, lng: 3 });
    expect(result.stay!.color).toBe('#1565c0');
  });

  it('omits the stay marker when the accommodation has no geo', () => {
    const d = day({
      stay: { text: 'Dormy Inn', color: '#1565c0', accommodation: accommodation() },
    });

    expect(buildDayMapContent(d, true).stay).toBeUndefined();
  });
});

describe('buildMapContent / collectPoints / countWithoutLocation', () => {
  const days: TripDayModel[] = [
    day({
      date: '2026-11-22',
      items: [
        entryItem({
          kind: 'activity',
          activity: activity({ id: 'a1', geo: { lat: 1, lng: 1 } }),
          start: { dateTime: '2026-11-22T08:00', zone: 'Asia/Tokyo' },
        }),
      ],
    }),
    day({
      date: '2026-11-23',
      items: [
        entryItem({
          kind: 'activity',
          activity: activity({ id: 'a2' }),
          start: { dateTime: '2026-11-23T08:00', zone: 'Asia/Tokyo' },
        }),
      ],
    }),
  ];

  it('builds content only for the selected days, marking the active one', () => {
    const result = buildMapContent(days, ['2026-11-22', '2026-11-23'], '2026-11-23');
    expect(result).toHaveLength(2);
    expect(result[0].active).toBe(false);
    expect(result[1].active).toBe(true);
  });

  it('excludes days outside the selection', () => {
    const result = buildMapContent(days, ['2026-11-22'], '2026-11-22');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-11-22');
  });

  it('collects every marker/line endpoint/stay point', () => {
    const content = buildMapContent(days, ['2026-11-22'], '2026-11-22');
    expect(collectPoints(content)).toEqual([{ lat: 1, lng: 1 }]);
  });

  it('sums missing entries across the selection', () => {
    const content = buildMapContent(days, ['2026-11-22', '2026-11-23'], '2026-11-22');
    expect(countWithoutLocation(content)).toBe(1);
  });
});

describe('initialSelectedDate', () => {
  const days = [day({ date: '2026-11-22' }), day({ date: '2026-11-23' })];

  it('picks today when the trip is running', () => {
    expect(initialSelectedDate('2026-11-23', days)).toBe('2026-11-23');
  });

  it('falls back to day 1 when today is outside the trip', () => {
    expect(initialSelectedDate('2026-12-01', days)).toBe('2026-11-22');
    expect(initialSelectedDate(undefined, days)).toBe('2026-11-22');
  });

  it('returns undefined with no days', () => {
    expect(initialSelectedDate('2026-11-22', [])).toBeUndefined();
  });
});

describe('selectionRange', () => {
  const days = [
    day({ date: '2026-11-20' }),
    day({ date: '2026-11-21' }),
    day({ date: '2026-11-22' }),
    day({ date: '2026-11-23' }),
  ];

  it('returns the inclusive range regardless of click order', () => {
    expect(selectionRange(days, '2026-11-21', '2026-11-23')).toEqual([
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
    ]);
    expect(selectionRange(days, '2026-11-23', '2026-11-21')).toEqual([
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
    ]);
  });

  it('falls back to just the clicked date for an unknown anchor', () => {
    expect(selectionRange(days, '2099-01-01', '2026-11-22')).toEqual(['2026-11-22']);
  });
});

describe('activeDayFromScroll', () => {
  it('picks the last header that has scrolled to/above the viewport top', () => {
    const positions = [
      { date: 'd1', top: -120 },
      { date: 'd2', top: -10 },
      { date: 'd3', top: 340 },
    ];
    expect(activeDayFromScroll(positions, 0)).toBe('d2');
  });

  it('returns the first day before anything has scrolled', () => {
    const positions = [
      { date: 'd1', top: 0 },
      { date: 'd2', top: 400 },
    ];
    expect(activeDayFromScroll(positions, 0)).toBe('d1');
  });

  it('returns undefined with no days', () => {
    expect(activeDayFromScroll([], 0)).toBeUndefined();
  });
});
