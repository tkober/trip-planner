import { Injectable } from '@angular/core';
import { migrateTrip } from '../models/migrations';
import { SCHEMA_VERSION, TripDto } from '../models/trip.model';
import { uuid } from './trip-store-util';

@Injectable({ providedIn: 'root' })
export class ImportExportService {
  /** Trigger a browser download of the trip as a pretty-printed JSON file. */
  exportTrip(trip: TripDto): void {
    const json = JSON.stringify(trip, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(trip.title) || 'trip'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Read a File, validate it, and return a normalized TripDto (new id). */
  async importFile(file: File): Promise<TripDto> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }
    return this.normalize(parsed);
  }

  /** Validate the shape, migrate to the current schema, and assign a fresh id. */
  normalize(input: unknown): TripDto {
    if (!input || typeof input !== 'object') {
      throw new Error('File does not contain a trip object.');
    }
    const t = input as Partial<TripDto>;
    const required: (keyof TripDto)[] = [
      'title',
      'startDate',
      'endDate',
      'homeTimeZone',
      'destinationTimeZone',
    ];
    for (const key of required) {
      if (typeof t[key] !== 'string' || !t[key]) {
        throw new Error(`Trip is missing required field "${key}".`);
      }
    }
    // Upgrade older documents (and reject newer ones) before coercing.
    const migrated = migrateTrip(input);
    const now = new Date().toISOString();
    return {
      ...migrated,
      id: uuid(),
      schemaVersion: SCHEMA_VERSION,
      description:
        typeof migrated.description === 'string'
          ? migrated.description
          : undefined,
      accommodations: Array.isArray(migrated.accommodations)
        ? migrated.accommodations
        : [],
      activities: Array.isArray(migrated.activities) ? migrated.activities : [],
      transport: Array.isArray(migrated.transport) ? migrated.transport : [],
      createdAt:
        typeof migrated.createdAt === 'string' ? migrated.createdAt : now,
      updatedAt: now,
    };
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
