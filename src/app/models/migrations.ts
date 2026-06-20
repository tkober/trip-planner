/**
 * Schema migrations for persisted / imported trips.
 *
 * Every trip that enters the app — read from IndexedDB, fetched from the API, or
 * imported from a JSON file — is passed through {@link migrateTrip}, which detects
 * its `schemaVersion` and upgrades it step-by-step to the current
 * {@link SCHEMA_VERSION}.
 *
 * To introduce a new version:
 *   1. Change the shape in `trip.model.ts` and bump `SCHEMA_VERSION`.
 *   2. Add a `MIGRATIONS[<new version>]` entry that converts a document from the
 *      previous version into the new shape.
 * The migrations run in ascending order, so each entry only has to handle the
 * single step from `version - 1` to `version`.
 */
import { SCHEMA_VERSION, TripDto } from './trip.model';

/** Upgrades a trip document from version `target - 1` to version `target`. */
export type TripMigration = (old: any) => any;

/**
 * Versioned upgrade steps, keyed by the version they produce.
 *
 * Example for a future v4:
 *   [4]: (old) => ({ ...old, newField: defaultValue }),
 *
 * v2 is the first versioned shape, so there is no `[2]` step — documents at or
 * below v2 are treated as the v2 baseline.
 */
const MIGRATIONS: Record<number, TripMigration> = {
  // v3 adds optional mode-specific transport fields (airport/terminal, station/
  // platform, stop, line, operator, train/bus kind). They are absent on older
  // documents, so no data transform is needed — this is an identity upgrade.
  [3]: (old) => old,
  // v4 adds the `carReservations` array (rental cars). Older documents lack it,
  // so seed an empty array.
  [4]: (old) => ({ ...old, carReservations: old.carReservations ?? [] }),
  // v5 drops the redundant `title` from each transport entry — the route is now
  // derived from from/to (city) + mode-specific fields. Strip it on upgrade.
  [5]: (old) => ({
    ...old,
    transport: Array.isArray(old.transport)
      ? old.transport.map(({ title, ...rest }: any) => rest)
      : old.transport,
  }),
  // v6 adds optional car-rental fields (pickup/return station links, booking
  // reference, price), a transport booking reference, and an accommodation
  // price. They are absent on older documents, so this is an identity upgrade.
  [6]: (old) => old,
};

/**
 * Normalize a raw trip-shaped object to the current schema version.
 *
 * Treats a missing or `< 2` `schemaVersion` as the v2 baseline (the app's first
 * versioned shape), then applies each `MIGRATIONS` step in order up to
 * `SCHEMA_VERSION`. Throws if the document was created by a newer app version.
 */
export function migrateTrip(raw: any): TripDto {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Trip is not an object.');
  }

  let version =
    typeof raw.schemaVersion === 'number' && raw.schemaVersion >= 2
      ? raw.schemaVersion
      : 2;

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `This file was created with a newer version (schema ${version}).`,
    );
  }

  let trip = raw;
  while (version < SCHEMA_VERSION) {
    const next = version + 1;
    const step = MIGRATIONS[next];
    trip = step ? step(trip) : trip; // missing step = identity upgrade
    version = next;
  }

  return { ...trip, schemaVersion: SCHEMA_VERSION } as TripDto;
}
