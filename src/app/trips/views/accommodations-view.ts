import { Component, computed, inject, input } from '@angular/core';
import { DateTime } from 'luxon';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AccommodationDto, TripDto } from '../../models/trip.model';
import { TripStoreService } from '../../services/trip-store.service';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { accommodationColors } from '../../shared/color/color';

interface AccommodationRow {
  accommodation: AccommodationDto;
  checkIn: string;
  checkOut: string;
  nights: number;
  color: string;
}

/** All accommodations as a list, ordered by check-in date, with details. */
@Component({
  selector: 'app-accommodations-view',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './accommodations-view.html',
  styleUrl: './accommodations-view.scss',
})
export class AccommodationsView {
  /** Parent route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly store = inject(TripStoreService);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);

  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
  );

  readonly rows = computed<AccommodationRow[]>(() => {
    const t = this.trip();
    if (!t) return [];
    // Colour is keyed off storage order so it matches the timeline.
    const colorById = accommodationColors(t.accommodations);
    return t.accommodations
      .slice()
      .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))
      .map((a) => ({
        accommodation: a,
        checkIn: this.formatDate(a.checkInDate),
        checkOut: this.formatDate(a.checkOutDate),
        nights: this.tz.nightsBetween(a.checkInDate, a.checkOutDate),
        color: colorById.get(a.id) ?? '',
      }));
  });

  private formatDate(date: string): string {
    const dt = DateTime.fromISO(date);
    return dt.isValid ? dt.toFormat('ccc, d LLL yyyy') : date;
  }

  add(): void {
    const trip = this.trip();
    if (trip) this.actions.addAccommodation(trip);
  }

  open(accommodation: AccommodationDto): void {
    const trip = this.trip();
    if (trip) this.actions.openAccommodation(trip, accommodation);
  }

  edit(accommodation: AccommodationDto): void {
    const trip = this.trip();
    if (trip) this.actions.editAccommodation(trip, accommodation);
  }

  remove(accommodation: AccommodationDto): void {
    const trip = this.trip();
    if (trip) void this.actions.deleteAccommodation(trip, accommodation);
  }
}
