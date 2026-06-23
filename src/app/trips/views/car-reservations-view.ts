import { Component, computed, inject, input } from '@angular/core';
import { DateTime } from 'luxon';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { CarReservationDto, TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { carReservationColors } from '../../shared/color/color';
import { formatMoney } from '../../shared/cost/cost';

interface CarReservationRow {
  car: CarReservationDto;
  pickup: string;
  dropoff: string;
  days: number;
  color: string;
}

/** All car rentals as a list, ordered by pickup date, with details. */
@Component({
  selector: 'app-car-reservations-view',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './car-reservations-view.html',
  styleUrl: './car-reservations-view.scss',
})
export class CarReservationsView {
  /** Parent route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();
  /** When set, render this trip instead of looking it up in the store (export). */
  readonly tripOverride = input<TripDto | undefined>(undefined);

  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);

  readonly trip = computed<TripDto | undefined>(
    () => this.tripOverride() ?? this.store.trips().find((t) => t.id === this.id()),
  );

  readonly rows = computed<CarReservationRow[]>(() => {
    const t = this.trip();
    if (!t) return [];
    // Colour is keyed off storage order so it matches the timeline.
    const colorById = carReservationColors(t.carReservations);
    return t.carReservations
      .slice()
      .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate))
      .map((c) => ({
        car: c,
        pickup: this.formatStamp(c.pickupDate, c.pickupTime),
        dropoff: this.formatStamp(c.dropoffDate, c.dropoffTime),
        days: this.tz.nightsBetween(c.pickupDate, c.dropoffDate) + 1,
        color: colorById.get(c.id) ?? '',
      }));
  });

  private formatStamp(date: string, time?: string): string {
    const dt = DateTime.fromISO(date);
    const dateStr = dt.isValid ? dt.toFormat('ccc, d LLL yyyy') : date;
    return time ? `${dateStr} · ${time}` : dateStr;
  }

  /** Format an optional amount in its currency, or '' when unset. */
  money(amount?: number, currency?: string): string {
    return amount != null ? formatMoney(amount, currency) : '';
  }

  add(): void {
    const trip = this.trip();
    if (trip) this.actions.addCarReservation(trip);
  }

  open(car: CarReservationDto): void {
    const trip = this.trip();
    if (trip) this.actions.openCarReservation(trip, car);
  }

  edit(car: CarReservationDto): void {
    const trip = this.trip();
    if (trip) this.actions.editCarReservation(trip, car);
  }

  remove(car: CarReservationDto): void {
    const trip = this.trip();
    if (trip) void this.actions.deleteCarReservation(trip, car);
  }
}
