import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
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

/**
 * Server-backed persistence via the FastAPI/Postgres backend.
 *
 * Selected when `environment.storageBackend === 'http'`. The backend is dumb
 * whole-trip storage; migration stays a frontend concern, so every fetched trip
 * is passed through {@link migrateTrip}.
 */
@Injectable()
export class HttpTripStore extends TripStore {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl.replace(/\/+$/, '');

  readonly trips = signal<TripDto[]>([]);
  readonly loaded = signal(false);

  constructor() {
    super();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const all = (
      await firstValueFrom(this.http.get<TripDto[]>(`${this.base}/trips`))
    ).map(migrateTrip);
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.trips.set(all);
    this.loaded.set(true);
  }

  async getTrip(id: string): Promise<TripDto | undefined> {
    const trip = await firstValueFrom(
      this.http.get<TripDto>(`${this.base}/trips/${id}`),
    );
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
    const saved = await firstValueFrom(
      this.http.post<TripDto>(`${this.base}/trips`, trip),
    );
    await this.refresh();
    return saved ?? trip;
  }

  /** Persist a full trip object (used by import and by nested mutations). */
  async saveTrip(trip: TripDto): Promise<TripDto> {
    const next = { ...trip, updatedAt: new Date().toISOString() };
    await firstValueFrom(
      this.http.put<TripDto>(`${this.base}/trips/${next.id}`, next),
    );
    await this.refresh();
    return next;
  }

  async deleteTrip(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/trips/${id}`));
    await this.refresh();
  }

  // --- Accommodation CRUD --------------------------------------------------

  async upsertAccommodation(
    trip: TripDto,
    accommodation: AccommodationDto,
  ): Promise<TripDto> {
    return this.saveTrip({
      ...trip,
      accommodations: upsertById(trip.accommodations, accommodation),
    });
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
