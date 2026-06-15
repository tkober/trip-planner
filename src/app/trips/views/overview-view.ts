import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TransportDto, TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { TransportCard } from '../../shared/transport-card/transport-card';

/** Trip summary: dates, length, zones, description and the departure/return flights. */
@Component({
  selector: 'app-overview-view',
  imports: [MatButtonModule, MatIconModule, TransportCard],
  templateUrl: './overview-view.html',
  styleUrl: './overview-view.scss',
})
export class OverviewView {
  /** Parent route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);

  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
  );

  readonly dayCount = computed(() => {
    const t = this.trip();
    return t ? this.tz.enumerateDays(t).length : 0;
  });
  readonly nightCount = computed(() => Math.max(0, this.dayCount() - 1));

  /** Chronologically sorted flights; first = departure, last = return. */
  private readonly flights = computed(() => {
    const t = this.trip();
    if (!t) return [] as TransportDto[];
    return t.transport
      .filter((x) => x.mode === 'flight')
      .slice()
      .sort((a, b) => this.tz.toMillis(a.start) - this.tz.toMillis(b.start));
  });

  readonly departureFlight = computed<TransportDto | undefined>(
    () => this.flights()[0],
  );
  readonly returnFlight = computed<TransportDto | undefined>(() => {
    const f = this.flights();
    return f.length > 1 ? f[f.length - 1] : undefined;
  });

  editTrip(): void {
    const trip = this.trip();
    if (trip) this.actions.editTrip(trip);
  }

  openFlight(flight: TransportDto): void {
    const trip = this.trip();
    if (trip) this.actions.openFlight(trip, flight);
  }

  editFlight(flight: TransportDto): void {
    const trip = this.trip();
    if (trip) this.actions.editTransport(trip, flight);
  }

  deleteFlight(flight: TransportDto): void {
    const trip = this.trip();
    if (trip) void this.actions.deleteTransport(trip, flight);
  }
}
