import { DateTime } from 'luxon';
import { TransportDto, TripDto } from '../../models/trip.model';
import {
  daysUntilOpening,
  isReservable,
  remindableWindows,
  reservationOpensAt,
  reservationStatus,
  reservationStatusLabel,
  reservationSummary,
  reservationSummaryParts,
  reservationWindows,
  timetableSearchUrl,
} from './reservation';

const KINDS = ['Shinkansen', 'Limited express'];

function train(overrides: Partial<TransportDto> = {}): TransportDto {
  return {
    id: 't1',
    mode: 'train',
    trainKind: 'Shinkansen',
    start: { dateTime: '2026-11-21T06:15', zone: 'Asia/Tokyo' },
    end: { dateTime: '2026-11-21T09:25', zone: 'Asia/Tokyo' },
    fromStation: 'Tokyo Station',
    toStation: 'Okayama Station',
    ...overrides,
  };
}

describe('reservationOpensAt', () => {
  it('opens at 10:00 on the same day one month earlier', () => {
    expect(
      reservationOpensAt({ dateTime: '2026-11-21T06:15', zone: 'Asia/Tokyo' }),
    ).toEqual({
      dateTime: '2026-10-21T10:00',
      zone: 'Asia/Tokyo',
    });
  });

  it('falls back to the 1st of the departure month when that day is missing', () => {
    // 31 March: "31 February" does not exist, so sales start 1 March.
    expect(
      reservationOpensAt({ dateTime: '2027-03-31T08:00', zone: 'Asia/Tokyo' }),
    ).toEqual({
      dateTime: '2027-03-01T10:00',
      zone: 'Asia/Tokyo',
    });
    // 29 March 2027 hits the same rule (February 2027 has 28 days).
    expect(
      reservationOpensAt({ dateTime: '2027-03-29T08:00', zone: 'Asia/Tokyo' }),
    ).toEqual({
      dateTime: '2027-03-01T10:00',
      zone: 'Asia/Tokyo',
    });
  });

  it('keeps a day that does exist in a shorter previous month', () => {
    // 28 March exists in February, so the normal rule applies.
    expect(
      reservationOpensAt({ dateTime: '2027-03-28T08:00', zone: 'Asia/Tokyo' }),
    ).toEqual({
      dateTime: '2027-02-28T10:00',
      zone: 'Asia/Tokyo',
    });
  });

  it('crosses the year boundary', () => {
    expect(
      reservationOpensAt({ dateTime: '2027-01-03T09:00', zone: 'Asia/Tokyo' }),
    ).toEqual({
      dateTime: '2026-12-03T10:00',
      zone: 'Asia/Tokyo',
    });
  });

  it('anchors the window in the departure zone, not the device zone', () => {
    const opens = reservationOpensAt({
      dateTime: '2026-11-21T06:15',
      zone: 'Asia/Tokyo',
    })!;
    expect(opens.zone).toBe('Asia/Tokyo');
    // 10:00 in Tokyo is 03:00 in Berlin — 21 October is still CEST (DST ends
    // on the 25th), so the offset is 7 hours, not the winter 8.
    expect(
      DateTime.fromISO(opens.dateTime, { zone: opens.zone })
        .setZone('Europe/Berlin')
        .toFormat('yyyy-MM-dd HH:mm'),
    ).toBe('2026-10-21 03:00');
  });

  it('returns undefined for an unparseable departure', () => {
    expect(
      reservationOpensAt({ dateTime: 'not-a-date', zone: 'Asia/Tokyo' }),
    ).toBeUndefined();
  });
});

describe('isReservable', () => {
  it('matches a configured kind, ignoring case and padding', () => {
    expect(isReservable(train({ trainKind: ' shinkansen ' }), KINDS)).toBe(
      true,
    );
    expect(isReservable(train({ trainKind: 'Limited express' }), KINDS)).toBe(
      true,
    );
  });

  it('rejects other kinds, other modes and trains without a kind', () => {
    expect(isReservable(train({ trainKind: 'Local train' }), KINDS)).toBe(
      false,
    );
    expect(isReservable(train({ trainKind: undefined }), KINDS)).toBe(false);
    expect(isReservable(train({ mode: 'flight' }), KINDS)).toBe(false);
  });

  it('honours an empty configuration (feature switched off)', () => {
    expect(isReservable(train(), [])).toBe(false);
  });
});

describe('reservationWindows', () => {
  const trip = {
    id: 'trip',
    schemaVersion: 7,
    title: 'Autumn',
    startDate: '2026-11-16',
    endDate: '2026-12-04',
    homeTimeZone: 'Europe/Berlin',
    destinationTimeZone: 'Asia/Tokyo',
    accommodations: [],
    carReservations: [],
    activities: [],
    transport: [
      train({
        id: 'late',
        start: { dateTime: '2026-11-30T12:07', zone: 'Asia/Tokyo' },
      }),
      train({ id: 'local', trainKind: 'Local train' }),
      train({
        id: 'early',
        start: { dateTime: '2026-11-21T06:15', zone: 'Asia/Tokyo' },
      }),
    ],
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
  } satisfies TripDto;

  it('keeps only reservable trains, ordered by when booking opens', () => {
    const windows = reservationWindows(trip, KINDS);
    expect(windows.map((w) => w.transport.id)).toEqual(['early', 'late']);
    expect(windows[0].opensAt.dateTime).toBe('2026-10-21T10:00');
    expect(windows[1].opensAt.dateTime).toBe('2026-10-30T10:00');
  });
});

describe('reservationStatus / daysUntilOpening', () => {
  const window = {
    transport: train(),
    departure: { dateTime: '2026-11-21T06:15', zone: 'Asia/Tokyo' },
    opensAt: { dateTime: '2026-10-21T10:00', zone: 'Asia/Tokyo' },
  };

  it('is upcoming before the window opens', () => {
    const now = DateTime.fromISO('2026-10-09T10:00', { zone: 'Asia/Tokyo' });
    expect(reservationStatus(window, now)).toBe('upcoming');
    expect(daysUntilOpening(window, now)).toBe(12);
  });

  it('rounds a partial day up so "in 1 day" lasts until the window opens', () => {
    const now = DateTime.fromISO('2026-10-20T23:59', { zone: 'Asia/Tokyo' });
    expect(daysUntilOpening(window, now)).toBe(1);
  });

  it('is open between the opening and the departure', () => {
    const now = DateTime.fromISO('2026-10-21T10:00', { zone: 'Asia/Tokyo' });
    expect(reservationStatus(window, now)).toBe('open');
    expect(daysUntilOpening(window, now)).toBe(0);
  });

  it('is departed once the train has left', () => {
    const now = DateTime.fromISO('2026-11-21T06:16', { zone: 'Asia/Tokyo' });
    expect(reservationStatus(window, now)).toBe('departed');
  });

  it('is booked once the leg is booked, even before/after the window opens', () => {
    const booked = { ...window, transport: train({ booked: true }) };
    expect(
      reservationStatus(booked, DateTime.fromISO('2026-10-09T10:00', { zone: 'Asia/Tokyo' })),
    ).toBe('booked');
    expect(
      reservationStatus(booked, DateTime.fromISO('2026-10-21T10:00', { zone: 'Asia/Tokyo' })),
    ).toBe('booked');
  });

  it('precedence: departed beats booked', () => {
    const booked = { ...window, transport: train({ booked: true }) };
    const now = DateTime.fromISO('2026-11-21T06:16', { zone: 'Asia/Tokyo' });
    expect(reservationStatus(booked, now)).toBe('departed');
  });

  it('labels each status', () => {
    const at = (iso: string) => DateTime.fromISO(iso, { zone: 'Asia/Tokyo' });
    expect(reservationStatusLabel(window, at('2026-10-09T10:00'))).toBe(
      'Booking opens in 12 days',
    );
    expect(reservationStatusLabel(window, at('2026-10-20T23:59'))).toBe(
      'Booking opens in 1 day',
    );
    expect(reservationStatusLabel(window, at('2026-10-21T10:00'))).toBe(
      'Bookable now',
    );
    expect(reservationStatusLabel(window, at('2026-11-21T06:16'))).toBe(
      'Departed',
    );
    expect(
      reservationStatusLabel(
        { ...window, transport: train({ booked: true }) },
        at('2026-10-21T10:00'),
      ),
    ).toBe('Booked');
  });
});

describe('reservationSummary / reservationSummaryParts', () => {
  const at = (iso: string) => DateTime.fromISO(iso, { zone: 'Asia/Tokyo' });
  const windowFor = (
    id: string,
    opensAt: string,
    departure: string,
    overrides: Partial<TransportDto> = {},
  ) => ({
    transport: train({ id, ...overrides }),
    departure: { dateTime: departure, zone: 'Asia/Tokyo' },
    opensAt: { dateTime: opensAt, zone: 'Asia/Tokyo' },
  });

  it('buckets booked / bookable now / not open yet; departed only counts when booked', () => {
    const windows = [
      windowFor('booked', '2026-10-01T10:00', '2026-11-01T06:00', { booked: true }),
      windowFor('open', '2026-10-01T10:00', '2026-11-21T06:00'),
      windowFor('upcoming', '2026-12-01T10:00', '2026-12-21T06:00'),
      windowFor('departed', '2026-01-01T10:00', '2026-01-02T06:00'),
      windowFor('departed-booked', '2026-01-01T10:00', '2026-01-02T06:00', { booked: true }),
    ];
    const now = at('2026-10-21T10:00');
    const summary = reservationSummary(windows, now);
    expect(summary).toEqual({ total: 5, booked: 2, bookableNow: 1, notOpenYet: 1 });
  });

  it('formats the lead line, omitting zero parts but keeping the "x of y booked" lead', () => {
    expect(
      reservationSummaryParts({ total: 5, booked: 1, bookableNow: 1, notOpenYet: 3 }),
    ).toEqual(['1 of 5 booked', '1 bookable now', '3 not open yet']);
    expect(
      reservationSummaryParts({ total: 2, booked: 2, bookableNow: 0, notOpenYet: 0 }),
    ).toEqual(['2 of 2 booked']);
    expect(
      reservationSummaryParts({ total: 0, booked: 0, bookableNow: 0, notOpenYet: 0 }),
    ).toBeUndefined();
  });
});

describe('remindableWindows', () => {
  it('excludes booked and departed windows', () => {
    const now = DateTime.fromISO('2026-10-21T10:00', { zone: 'Asia/Tokyo' });
    const windows = [
      {
        transport: train({ id: 'booked', booked: true }),
        departure: { dateTime: '2026-11-21T06:15', zone: 'Asia/Tokyo' },
        opensAt: { dateTime: '2026-10-21T10:00', zone: 'Asia/Tokyo' },
      },
      {
        transport: train({ id: 'departed' }),
        departure: { dateTime: '2026-10-01T06:15', zone: 'Asia/Tokyo' },
        opensAt: { dateTime: '2026-09-01T10:00', zone: 'Asia/Tokyo' },
      },
      {
        transport: train({ id: 'open' }),
        departure: { dateTime: '2026-11-21T06:15', zone: 'Asia/Tokyo' },
        opensAt: { dateTime: '2026-10-21T10:00', zone: 'Asia/Tokyo' },
      },
    ];
    expect(remindableWindows(windows, now).map((w) => w.transport.id)).toEqual(['open']);
  });
});

describe('timetableSearchUrl', () => {
  it('prefills stations, date and time, dropping the "Station" suffix', () => {
    const url = new URL(timetableSearchUrl(train())!);
    expect(url.origin + url.pathname).toBe(
      'https://world.jorudan.co.jp/mln/en/',
    );
    expect(url.searchParams.get('from')).toBe('Tokyo');
    expect(url.searchParams.get('to')).toBe('Okayama');
    expect(url.searchParams.get('date')).toBe('11/21/2026');
    expect(url.searchParams.get('time')).toBe('06:15');
  });

  it('falls back to the generic locations when no station is set', () => {
    const url = new URL(
      timetableSearchUrl(
        train({
          fromStation: undefined,
          toStation: undefined,
          fromLocation: 'Takamatsu',
          toLocation: 'Okayama',
        }),
      )!,
    );
    expect(url.searchParams.get('from')).toBe('Takamatsu');
  });

  it('is undefined when an endpoint is unknown', () => {
    expect(
      timetableSearchUrl(
        train({ toStation: undefined, toLocation: undefined }),
      ),
    ).toBeUndefined();
  });
});
