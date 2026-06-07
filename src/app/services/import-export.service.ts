import { Injectable } from '@angular/core';
import { SCHEMA_VERSION, TripDto } from '../models/trip.model';

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

  /** Validate the shape and coerce into a TripDto with a fresh id. */
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
    if (
      typeof t.schemaVersion === 'number' &&
      t.schemaVersion > SCHEMA_VERSION
    ) {
      throw new Error(
        `This file was created with a newer version (schema ${t.schemaVersion}).`,
      );
    }
    const now = new Date().toISOString();
    return {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`,
      schemaVersion: SCHEMA_VERSION,
      title: t.title!,
      startDate: t.startDate!,
      endDate: t.endDate!,
      homeTimeZone: t.homeTimeZone!,
      destinationTimeZone: t.destinationTimeZone!,
      description: typeof t.description === 'string' ? t.description : undefined,
      accommodations: Array.isArray(t.accommodations) ? t.accommodations : [],
      activities: Array.isArray(t.activities) ? t.activities : [],
      transport: Array.isArray(t.transport) ? t.transport : [],
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : now,
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
