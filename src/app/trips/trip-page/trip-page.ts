import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { ExportHost } from '../export/export-host';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

/**
 * The trip page shell: a fixed left side panel (back button, trip name + compact
 * details, and the section nav) plus a `<router-outlet>` that hosts the active
 * section view (overview / timeline / accommodations / car rentals / transport).
 */
@Component({
  selector: 'app-trip-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    ExportHost,
  ],
  templateUrl: './trip-page.html',
  styleUrl: './trip-page.scss',
})
export class TripPage {
  /** Route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);
  private readonly router = inject(Router);

  readonly loaded = this.store.loaded;
  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
  );

  readonly nav: NavItem[] = [
    { path: 'overview', label: 'Overview', icon: 'info' },
    { path: 'timeline', label: 'Timeline', icon: 'calendar_view_day' },
    { path: 'accommodations', label: 'Accommodations', icon: 'hotel' },
    { path: 'car-reservations', label: 'Car Rentals', icon: 'directions_car' },
    { path: 'transport', label: 'Transport', icon: 'commute' },
  ];

  /** Trip length as "N days · M nights". */
  readonly lengthLabel = computed(() => {
    const t = this.trip();
    if (!t) return '';
    const days = this.tz.enumerateDays(t).length;
    const nights = Math.max(0, days - 1);
    return `${days} day${days === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'}`;
  });

  back(): void {
    void this.router.navigate(['/trips']);
  }

  editTrip(): void {
    const trip = this.trip();
    if (trip) this.actions.editTrip(trip);
  }

  addAccommodation(): void {
    const trip = this.trip();
    if (trip) this.actions.addAccommodation(trip);
  }

  exportTrip(): void {
    const trip = this.trip();
    if (trip) this.actions.exportTrip(trip);
  }

  exportPlan(): void {
    const trip = this.trip();
    if (trip) this.actions.exportPlan(trip);
  }
}
