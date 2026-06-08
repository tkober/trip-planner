import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  TransportDto,
  TransportMode,
  TripDto,
  ZonedTime,
} from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { transportColor } from '../../shared/color/color';

const MODE_ICON: Record<TransportMode, string> = {
  flight: 'flight',
  train: 'train',
  bus: 'directions_bus',
  car: 'directions_car',
};

const MODE_LABEL: Record<TransportMode, string> = {
  flight: 'Flight',
  train: 'Train',
  bus: 'Bus',
  car: 'Car',
};

interface TimeLabel {
  date: string;
  primary: string;
  primaryZone: string;
  secondary: string;
  secondaryZone: string;
  sameZone: boolean;
}

interface TransportRow {
  transport: TransportDto;
  icon: string;
  modeLabel: string;
  departure: TimeLabel;
  arrival?: TimeLabel;
  color: string;
}

/** All transport as a list, ordered by departure time, with details. */
@Component({
  selector: 'app-transport-view',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './transport-view.html',
  styleUrl: './transport-view.scss',
})
export class TransportView {
  /** Parent route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);

  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
  );

  readonly rows = computed<TransportRow[]>(() => {
    const t = this.trip();
    if (!t) return [];
    return t.transport
      .slice()
      .sort((a, b) => this.tz.toMillis(a.start) - this.tz.toMillis(b.start))
      .map((x) => ({
        transport: x,
        icon: MODE_ICON[x.mode],
        modeLabel: MODE_LABEL[x.mode],
        departure: this.timeLabel(x.start, t),
        arrival: x.end ? this.timeLabel(x.end, t) : undefined,
        color: transportColor(x),
      }));
  });

  private timeLabel(zt: ZonedTime, trip: TripDto): TimeLabel {
    const dual = this.tz.dualLabel(
      zt,
      trip.homeTimeZone,
      trip.destinationTimeZone,
    );
    return {
      date: this.tz.toDateTime(zt).toFormat('ccc, d LLL yyyy'),
      primary: dual.primary,
      primaryZone: dual.primaryZoneAbbr,
      secondary: dual.secondary,
      secondaryZone: dual.secondaryZoneAbbr,
      sameZone: dual.sameZone,
    };
  }

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
