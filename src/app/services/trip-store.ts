import { Signal } from '@angular/core';
import {
  AccommodationDto,
  ActivityDto,
  CarReservationDto,
  TransportDto,
  TripDto,
} from '../models/trip.model';

/**
 * Abstraction over the trip persistence layer.
 *
 * Doubles as the DI token: the concrete implementation
 * ({@link IndexedDbTripStore} or {@link HttpTripStore}) is selected in
 * `app.config.ts` based on the build-time `environment.storageBackend`. All views
 * and services depend on this type, never on a concrete store.
 *
 * Every nested mutation funnels through `saveTrip()` (a full-trip write), so an
 * HTTP backend only needs whole-trip endpoints.
 */
export abstract class TripStore {
  /** Reactive list of all trips (most recently updated first). */
  abstract readonly trips: Signal<TripDto[]>;
  abstract readonly loaded: Signal<boolean>;

  /** Reload all trips from the backing store into the `trips` signal. */
  abstract refresh(): Promise<void>;
  abstract getTrip(id: string): Promise<TripDto | undefined>;

  // --- Trip-level CRUD -----------------------------------------------------

  abstract createTrip(
    data: Pick<
      TripDto,
      | 'title'
      | 'startDate'
      | 'endDate'
      | 'homeTimeZone'
      | 'destinationTimeZone'
      | 'description'
    >,
  ): Promise<TripDto>;

  /** Persist a full trip object (used by import and by nested mutations). */
  abstract saveTrip(trip: TripDto): Promise<TripDto>;
  abstract deleteTrip(id: string): Promise<void>;

  // --- Accommodation CRUD --------------------------------------------------

  abstract upsertAccommodation(
    trip: TripDto,
    accommodation: AccommodationDto,
  ): Promise<TripDto>;
  abstract removeAccommodation(trip: TripDto, id: string): Promise<TripDto>;

  // --- Car reservation CRUD ------------------------------------------------

  abstract upsertCarReservation(
    trip: TripDto,
    car: CarReservationDto,
  ): Promise<TripDto>;
  abstract removeCarReservation(trip: TripDto, id: string): Promise<TripDto>;

  // --- Activity CRUD -------------------------------------------------------

  abstract upsertActivity(
    trip: TripDto,
    activity: ActivityDto,
  ): Promise<TripDto>;
  abstract removeActivity(trip: TripDto, id: string): Promise<TripDto>;

  // --- Transport CRUD ------------------------------------------------------

  abstract upsertTransport(
    trip: TripDto,
    transport: TransportDto,
  ): Promise<TripDto>;
  abstract removeTransport(trip: TripDto, id: string): Promise<TripDto>;

  /** Generate a new id for nested entities created in the UI. */
  abstract newId(): string;
}
