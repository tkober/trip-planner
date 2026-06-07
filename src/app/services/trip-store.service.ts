import { Injectable, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  AccommodationDto,
  ActivityDto,
  SCHEMA_VERSION,
  TransportDto,
  TripDto,
} from '../models/trip.model';

class TripPlannerDB extends Dexie {
  trips!: Table<TripDto, string>;

  constructor() {
    super('TripPlannerDB');
    this.version(1).stores({
      // Primary key `id`; index updatedAt for sorting the list.
      trips: 'id, updatedAt, startDate',
    });
  }
}

/** Generate a uuid, with a fallback for older runtimes. */
function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Injectable({ providedIn: 'root' })
export class TripStoreService {
  private readonly db = new TripPlannerDB();

  /** Reactive list of all trips (most recently updated first). */
  readonly trips = signal<TripDto[]>([]);
  readonly loaded = signal(false);

  constructor() {
    void this.refresh();
  }

  /** Reload all trips from IndexedDB into the signal. */
  async refresh(): Promise<void> {
    const all = await this.db.trips.toArray();
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.trips.set(all);
    this.loaded.set(true);
  }

  async getTrip(id: string): Promise<TripDto | undefined> {
    return this.db.trips.get(id);
  }

  // --- Trip-level CRUD -----------------------------------------------------

  async createTrip(
    data: Pick<
      TripDto,
      | 'title'
      | 'startDate'
      | 'endDate'
      | 'homeTimeZone'
      | 'destinationTimeZone'
      | 'description'
    >,
  ): Promise<TripDto> {
    const now = new Date().toISOString();
    const trip: TripDto = {
      id: uuid(),
      schemaVersion: SCHEMA_VERSION,
      title: data.title,
      startDate: data.startDate,
      endDate: data.endDate,
      homeTimeZone: data.homeTimeZone,
      destinationTimeZone: data.destinationTimeZone,
      description: data.description,
      accommodations: [],
      activities: [],
      transport: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.db.trips.put(trip);
    await this.refresh();
    return trip;
  }

  /** Persist a full trip object (used by import and by nested mutations). */
  async saveTrip(trip: TripDto): Promise<TripDto> {
    const next = { ...trip, updatedAt: new Date().toISOString() };
    await this.db.trips.put(next);
    await this.refresh();
    return next;
  }

  async deleteTrip(id: string): Promise<void> {
    await this.db.trips.delete(id);
    await this.refresh();
  }

  // --- Accommodation CRUD --------------------------------------------------

  async upsertAccommodation(
    trip: TripDto,
    accommodation: AccommodationDto,
  ): Promise<TripDto> {
    const list = upsertById(trip.accommodations, accommodation);
    return this.saveTrip({ ...trip, accommodations: list });
  }

  async removeAccommodation(trip: TripDto, id: string): Promise<TripDto> {
    return this.saveTrip({
      ...trip,
      accommodations: trip.accommodations.filter((a) => a.id !== id),
    });
  }

  // --- Activity CRUD -------------------------------------------------------

  async upsertActivity(trip: TripDto, activity: ActivityDto): Promise<TripDto> {
    return this.saveTrip({
      ...trip,
      activities: upsertById(trip.activities, activity),
    });
  }

  async removeActivity(trip: TripDto, id: string): Promise<TripDto> {
    return this.saveTrip({
      ...trip,
      activities: trip.activities.filter((a) => a.id !== id),
    });
  }

  // --- Transport CRUD ------------------------------------------------------

  async upsertTransport(
    trip: TripDto,
    transport: TransportDto,
  ): Promise<TripDto> {
    return this.saveTrip({
      ...trip,
      transport: upsertById(trip.transport, transport),
    });
  }

  async removeTransport(trip: TripDto, id: string): Promise<TripDto> {
    return this.saveTrip({
      ...trip,
      transport: trip.transport.filter((t) => t.id !== id),
    });
  }

  /** Generate a new id for nested entities created in the UI. */
  newId(): string {
    return uuid();
  }
}

/** Replace an item with the same id, or append it if new. Returns a new array. */
function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) {
    return [...list, item];
  }
  const next = list.slice();
  next[idx] = item;
  return next;
}
