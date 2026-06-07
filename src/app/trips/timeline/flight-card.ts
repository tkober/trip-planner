import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TransportDto } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { transportColor } from '../../shared/color/color';

interface FlightEndpoint {
  dateLabel: string;
  primary: string;
  primaryZone: string;
  secondary: string;
  secondaryZone: string;
  sameZone: boolean;
}

/**
 * Prominent card for the trip's departure / return flight, showing departure and
 * arrival times in both home and destination zones (the entry's own zone is the
 * highlighted one).
 */
@Component({
  selector: 'app-flight-card',
  imports: [MatIconModule],
  template: `
    <button
      class="flight-card"
      [style.--accent]="accent()"
      (click)="open.emit(flight())"
      type="button"
    >
      <div class="role">
        <mat-icon>flight_takeoff</mat-icon>
        <span>{{ role() }}</span>
      </div>
      <div class="title">{{ flight().title }}</div>
      @if (flight().airline || flight().flightNumber) {
        <div class="airline">
          {{ flight().airline }} {{ flight().flightNumber }}
        </div>
      }
      <div class="legs">
        <div class="leg">
          <div class="endpoint-label">
            {{ flight().fromLocation || 'Departure' }}
          </div>
          <div class="time">
            {{ departure().primary }}
            <span class="zone">{{ departure().primaryZone }}</span>
          </div>
          @if (!departure().sameZone) {
            <div class="alt">
              {{ departure().secondary }}
              <span class="zone">{{ departure().secondaryZone }}</span>
            </div>
          }
          <div class="date">{{ departure().dateLabel }}</div>
        </div>

        <mat-icon class="arrow">arrow_forward</mat-icon>

        @if (arrival(); as arr) {
          <div class="leg">
            <div class="endpoint-label">
              {{ flight().toLocation || 'Arrival' }}
            </div>
            <div class="time">
              {{ arr.primary }}
              <span class="zone">{{ arr.primaryZone }}</span>
            </div>
            @if (!arr.sameZone) {
              <div class="alt">
                {{ arr.secondary }}
                <span class="zone">{{ arr.secondaryZone }}</span>
              </div>
            }
            <div class="date">{{ arr.dateLabel }}</div>
          </div>
        } @else {
          <div class="leg muted">
            <div class="endpoint-label">
              {{ flight().toLocation || 'Arrival' }}
            </div>
            <div class="time">—</div>
          </div>
        }
      </div>
    </button>
  `,
  styleUrl: './flight-card.scss',
})
export class FlightCard {
  private readonly tz = inject(TimeZoneService);

  readonly flight = input.required<TransportDto>();
  readonly role = input<string>('Flight');
  readonly homeZone = input.required<string>();
  readonly destZone = input.required<string>();
  readonly open = output<TransportDto>();

  /** Effective accent colour: explicit colour or the flight default. */
  readonly accent = computed(() => transportColor(this.flight()));

  readonly departure = computed(() =>
    this.endpoint(this.flight().start),
  );
  readonly arrival = computed<FlightEndpoint | undefined>(() => {
    const end = this.flight().end;
    return end ? this.endpoint(end) : undefined;
  });

  private endpoint(zt: { dateTime: string; zone: string }): FlightEndpoint {
    const dual = this.tz.dualLabel(zt, this.homeZone(), this.destZone());
    return {
      dateLabel: this.tz.toDateTime(zt).toFormat('ccc, d LLL'),
      primary: dual.primary,
      primaryZone: dual.primaryZoneAbbr,
      secondary: dual.secondary,
      secondaryZone: dual.secondaryZoneAbbr,
      sameZone: dual.sameZone,
    };
  }
}
