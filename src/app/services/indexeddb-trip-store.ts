import { Injectable, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { migrateTrip } from '../models/migrations';
import {
  AccommodationDto,
  ActivityDto,
  SCHEMA_VERSION,
  TransportDto,
  TripDto,
} from '../models/trip.model';
import { TripStore } from './trip-store';
import { upsertById, uuid } from './trip-store-util';

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

/** Browser-local persistence (IndexedDB via Dexie) — the default backend. */
@Injectable()
export class IndexedDbTripStore extends TripStore {
  private readonly db = new TripPlannerDB();

  readonly trips = signal<TripDto[]>([]);
  readonly loaded = signal(false);

  constructor() {
    super();
    void this.refresh();
  }

  /** Reload all trips from IndexedDB into the signal. */
  async refresh(): Promise<void> {
    const all = (await this.db.trips.toArray()).map(migrateTrip);
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.trips.set(all);
    this.loaded.set(true);
  }

  async getTrip(id: string): Promise<TripDto | undefined> {
    const trip = await this.db.trips.get(id);
    return trip ? migrateTrip(trip) : undefined;
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

  newId(): string {
    return uuid();
  }
}
