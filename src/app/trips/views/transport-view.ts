import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TransportDto, TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { TransportCard } from '../../shared/transport-card/transport-card';

/** All transport as a list, ordered by departure time, in the timeline card style. */
@Component({
  selector: 'app-transport-view',
  imports: [MatButtonModule, MatIconModule, TransportCard],
  templateUrl: './transport-view.html',
  styleUrl: './transport-view.scss',
})
export class TransportView {
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

  /** Transport ordered by departure time. */
  readonly transports = computed<TransportDto[]>(() => {
    const t = this.trip();
    if (!t) return [];
    return t.transport
      .slice()
      .sort((a, b) => this.tz.toMillis(a.start) - this.tz.toMillis(b.start));
  });

  add(): void {
    const trip = this.trip();
    if (trip) this.actions.addTransport(trip, trip.startDate);
  }

  open(transport: TransportDto): void {
    const trip = this.trip();
    if (trip) this.actions.openFlight(trip, transport);
  }

  edit(transport: TransportDto): void {
    const trip = this.trip();
    if (trip) this.actions.editTransport(trip, transport);
  }

  remove(transport: TransportDto): void {
    const trip = this.trip();
    if (trip) void this.actions.deleteTransport(trip, transport);
  }
}
