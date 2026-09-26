import { DateTime } from 'luxon';
import { TransportDto } from '../../models/trip.model';
import { buildIcs } from './ics';
import { reservationEvent, reservationIcsFilename } from './reservation-ics';
import { ReservationWindow } from '../reservation/reservation';

const NOW = DateTime.fromISO('2026-09-26T12:00', { zone: 'UTC' });

function unfold(ics: string): string {
  // Reverse RFC 5545 folding so assertions can match whole property values.
  return ics.replace(/\r\n /g, '');
}

describe('buildIcs', () => {
  const event = {
    uid: 'abc@trip-planner',
    start: DateTime.fromISO('2026-10-21T10:00', { zone: 'Asia/Tokyo' }),
    durationMinutes: 30,
    summary: 'Book seats: Tokyo → Okayama',
    description: ['Line one', 'Line two'],
    alarmMinutesBefore: 15,
  };

  it('wraps events in a VCALENDAR with CRLF line endings', () => {
    const ics = buildIcs([event], NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:abc@trip-planner');
  });

  it('writes times as UTC stamps of the underlying instant', () => {
    const ics = buildIcs([event], NOW);
    // 10:00 in Tokyo is 01:00 UTC; the event lasts 30 minutes.
    expect(ics).toContain('DTSTART:20261021T010000Z');
    expect(ics).toContain('DTEND:20261021T013000Z');
    expect(ics).toContain('DTSTAMP:20260926T120000Z');
  });

  it('joins description lines and escapes reserved characters', () => {
    const ics = unfold(
      buildIcs([{ ...event, description: ['a; b, c', 'second\\line'] }], NOW),
    );
    expect(ics).toContain('DESCRIPTION:a\; b\\, c\\nsecond\\\\line');
  });

  it('adds a display alarm ahead of the start', () => {
    const ics = buildIcs([event], NOW);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT15M');
  });

  it('folds long lines to 75 octets without splitting characters', () => {
    const ics = buildIcs([{ ...event, summary: '東京'.repeat(40) }], NOW);
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Folding is reversible: no character was cut in half.
    expect(unfold(ics)).toContain('SUMMARY:' + '東京'.repeat(40));
  });

  it('leaves a URL unescaped so query separators survive', () => {
    const ics = unfold(
      buildIcs([{ ...event, url: 'https://x.test/?a=1&b=2,3' }], NOW),
    );
    expect(ics).toContain('URL:https://x.test/?a=1&b=2,3');
  });
});

describe('reservationEvent', () => {
  const transport: TransportDto = {
    id: 'leg-1',
    mode: 'train',
    trainKind: 'Shinkansen',
    trainName: 'Nozomi 3',
    line: 'Tokaido-Sanyo Shinkansen',
    operator: 'JR Central / JR West',
    fromStation: 'Tokyo Station',
    toStation: 'Okayama Station',
    fromLocation: 'Tokyo',
    toLocation: 'Okayama',
    totalPrice: 17770,
    currency: 'JPY',
    start: { dateTime: '2026-11-21T06:15', zone: 'Asia/Tokyo' },
    end: { dateTime: '2026-11-21T09:25', zone: 'Asia/Tokyo' },
  };
  const window: ReservationWindow = {
    transport,
    departure: transport.start,
    opensAt: { dateTime: '2026-10-21T10:00', zone: 'Asia/Tokyo' },
  };

  it('summarises the leg and starts when booking opens', () => {
    const event = reservationEvent(window, 'Europe/Berlin');
    expect(event.summary).toBe('Book seats: Tokyo → Okayama · Nozomi 3');
    expect(event.start.toISO()).toBe(
      DateTime.fromISO('2026-10-21T10:00', { zone: 'Asia/Tokyo' }).toISO(),
    );
    expect(event.uid).toBe('leg-1-reservation@trip-planner');
  });

  it('describes the train in both zones and links the booking sites', () => {
    const text = (
      reservationEvent(window, 'Europe/Berlin').description ?? []
    ).join('\n');
    // Still CEST on 21 October, hence 03:00 rather than the winter 02:00.
    expect(text).toContain('10:00 (Asia/Tokyo) · 03:00 (Europe/Berlin)');
    expect(text).toContain('Nozomi 3 · Tokaido-Sanyo Shinkansen · Shinkansen');
    expect(text).toContain('Tokyo Station');
    // 06:15 in Tokyo is the previous evening at home — say so explicitly.
    expect(text).toContain('22:15 on 20 Nov (Europe/Berlin)');
    expect(text).toContain('17,770');
    expect(text).toContain('https://smart-ex.jp/en/');
    expect(text).toContain('world.jorudan.co.jp');
  });

  it("points URL at the leg's own booking link when it has one", () => {
    const own = {
      ...window,
      transport: { ...transport, bookingUrl: 'https://jr.test/x' },
    };
    expect(reservationEvent(own, 'Europe/Berlin').url).toBe(
      'https://jr.test/x',
    );
    expect(reservationEvent(window, 'Europe/Berlin').url).toBe(
      'https://smart-ex.jp/en/',
    );
  });

  it('derives a file name from the route', () => {
    expect(reservationIcsFilename(transport)).toBe('book-tokyo-okayama.ics');
  });
});
