import { computeEntrySpan, localDayKey, zoneDiffers } from './day-span';
import { ActivityDto, TimelineEntry, TransportDto } from '../../models/trip.model';

const TOKYO = 'Asia/Tokyo';
const BERLIN = 'Europe/Berlin';

function activityEntry(startIso: string, endIso?: string, zone = TOKYO): TimelineEntry {
  const activity = {
    id: 'a1',
    title: 'Bar crawl',
    start: { dateTime: startIso, zone },
    end: endIso ? { dateTime: endIso, zone } : undefined,
  } as ActivityDto;
  return { kind: 'activity', activity, start: activity.start };
}

function transportEntry(
  startIso: string,
  startZone: string,
  endIso?: string,
  endZone = startZone,
): TimelineEntry {
  const transport = {
    id: 't1',
    mode: 'bus',
    start: { dateTime: startIso, zone: startZone },
    end: endIso ? { dateTime: endIso, zone: endZone } : undefined,
  } as TransportDto;
  return { kind: 'transport', transport, start: transport.start };
}

describe('localDayKey', () => {
  it('reads an ordinary time as its own calendar day', () => {
    expect(localDayKey({ dateTime: '2026-04-13T22:30', zone: TOKYO })).toBe(
      '2026-04-13',
    );
  });

  it('reads exactly midnight as the PREVIOUS day, not the next', () => {
    expect(localDayKey({ dateTime: '2026-04-14T00:00', zone: TOKYO })).toBe(
      '2026-04-13',
    );
  });

  it('a moment one minute after midnight is still the new day', () => {
    expect(localDayKey({ dateTime: '2026-04-14T00:01', zone: TOKYO })).toBe(
      '2026-04-14',
    );
  });
});

describe('computeEntrySpan', () => {
  it('does not cross when there is no end', () => {
    const span = computeEntrySpan(activityEntry('2026-04-13T09:00'));
    expect(span.crosses).toBe(false);
    expect(span.startKey).toBe(span.endKey);
  });

  it('a night bus crossing one boundary (Osaka→Tokyo, Day 13 22:30 → Day 14 06:50)', () => {
    const entry = transportEntry('2026-04-13T22:30', TOKYO, '2026-04-14T06:50');
    const span = computeEntrySpan(entry);
    expect(span.crosses).toBe(true);
    expect(span.startKey).toBe('2026-04-13');
    expect(span.endKey).toBe('2026-04-14');
  });

  it('an activity crossing midnight (bar crawl Sun 21:00 → Mon 01:00)', () => {
    const entry = activityEntry('2026-04-12T21:00', '2026-04-13T01:00');
    const span = computeEntrySpan(entry);
    expect(span.crosses).toBe(true);
    expect(span.startKey).toBe('2026-04-12');
    expect(span.endKey).toBe('2026-04-13');
  });

  it('an entry ending at exactly 00:00 does NOT split (counts as the start day)', () => {
    const entry = activityEntry('2026-04-12T21:00', '2026-04-13T00:00');
    const span = computeEntrySpan(entry);
    expect(span.crosses).toBe(false);
    expect(span.startKey).toBe('2026-04-12');
    expect(span.endKey).toBe('2026-04-12');
  });

  it('a 3-day span (start / continues / end)', () => {
    const entry = activityEntry('2026-04-12T09:00', '2026-04-14T18:00');
    const span = computeEntrySpan(entry);
    expect(span.crosses).toBe(true);
    expect(span.startKey).toBe('2026-04-12');
    expect(span.endKey).toBe('2026-04-14');
  });

  it('a boundary flight with virtual days: home-zone departure, destination-zone arrival', () => {
    // FRA 22:00 (home) -> HND 17:20 next day (destination), the virtual
    // "Departure Day" straddling into real Day 1.
    const entry = transportEntry('2026-04-09T22:00', BERLIN, '2026-04-10T17:20', TOKYO);
    const span = computeEntrySpan(entry);
    expect(span.crosses).toBe(true);
    expect(span.startKey).toBe('2026-04-09');
    expect(span.endKey).toBe('2026-04-10');
  });
});

describe('zoneDiffers', () => {
  it('is false when the time is already in the reference zone', () => {
    expect(zoneDiffers({ dateTime: '2026-04-13T13:30', zone: TOKYO }, TOKYO)).toBe(
      false,
    );
  });

  it('is true when the start zone differs from the destination zone', () => {
    expect(zoneDiffers({ dateTime: '2026-04-13T13:30', zone: BERLIN }, TOKYO)).toBe(
      true,
    );
  });
});
