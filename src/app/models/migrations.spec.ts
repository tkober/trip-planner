import { migrateTrip } from './migrations';
import { SCHEMA_VERSION } from './trip.model';

function baseTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc',
    schemaVersion: SCHEMA_VERSION,
    title: 'Trip',
    startDate: '2026-04-01',
    endDate: '2026-04-10',
    homeTimeZone: 'Europe/Berlin',
    destinationTimeZone: 'Asia/Tokyo',
    accommodations: [],
    carReservations: [],
    activities: [],
    transport: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('migrateTrip', () => {
  it('stamps the current schema version on a current document', () => {
    const result = migrateTrip(baseTrip());
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('treats a missing schemaVersion as the v2 baseline and upgrades it', () => {
    const { schemaVersion, ...withoutVersion } = baseTrip();
    const result = migrateTrip(withoutVersion);
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.title).toBe('Trip');
  });

  it('upgrades a document older than the current version', () => {
    const result = migrateTrip(baseTrip({ schemaVersion: 1 }));
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('seeds an empty carReservations array on a pre-v4 document', () => {
    const { carReservations, ...withoutCars } = baseTrip({ schemaVersion: 3 });
    const result = migrateTrip(withoutCars);
    expect(result.carReservations).toEqual([]);
  });

  it('strips the redundant transport title on a pre-v5 document', () => {
    const result = migrateTrip(
      baseTrip({
        schemaVersion: 4,
        transport: [
          {
            id: 't1',
            mode: 'train',
            title: 'Shinkansen to Kyoto',
            start: { dateTime: '2026-04-02T09:00', zone: 'Asia/Tokyo' },
            fromLocation: 'Odawara',
            toLocation: 'Kyoto',
          },
        ],
      }),
    );
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect((result.transport[0] as Record<string, unknown>)['title']).toBeUndefined();
    expect(result.transport[0].fromLocation).toBe('Odawara');
  });

  it('rejects a document from a newer app version', () => {
    expect(() => migrateTrip(baseTrip({ schemaVersion: SCHEMA_VERSION + 1 }))).toThrow(
      /newer version/,
    );
  });

  it('throws on a non-object input', () => {
    expect(() => migrateTrip(null)).toThrow();
  });
});
