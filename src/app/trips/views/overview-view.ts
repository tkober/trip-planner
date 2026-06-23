import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TransportDto, TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { TransportCard } from '../../shared/transport-card/transport-card';
import { formatEur, tripCostSummary } from '../../shared/cost/cost';

/** Trip summary: dates, length, zones, description and the departure/return flights. */
@Component({
  selector: 'app-overview-view',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TransportCard,
  ],
  templateUrl: './overview-view.html',
  styleUrl: './overview-view.scss',
})
export class OverviewView {
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

  readonly dayCount = computed(() => {
    const t = this.trip();
    return t ? this.tz.enumerateDays(t).length : 0;
  });
  readonly nightCount = computed(() => Math.max(0, this.dayCount() - 1));

  /** Aggregated trip cost (totals in EUR, breakdown, currencies needing rates). */
  readonly costSummary = computed(() => {
    const t = this.trip();
    return t ? tripCostSummary(t, t.exchangeRates ?? {}) : undefined;
  });

  /** Expose EUR formatting to the template. */
  protected readonly formatEur = formatEur;

  /** Current "1 EUR = X" units-per-EUR value for a currency, or '' when unset. */
  rateDisplay(code: string): string {
    const rate = this.trip()?.exchangeRates?.[code];
    if (!rate || rate <= 0) return '';
    // Invert EUR-per-unit back to the natural units-per-EUR, trimming FP noise.
    return String(Number((1 / rate).toPrecision(8)));
  }

  /** Persist an edited "1 EUR = X" rate (empty / invalid clears it). */
  onRateChange(code: string, value: string): void {
    const trip = this.trip();
    if (!trip) return;
    const units = Number(value.replace(',', '.').trim());
    const eurPerUnit =
      value.trim() && Number.isFinite(units) && units > 0 ? 1 / units : 0;
    void this.actions.setExchangeRate(trip, code, eurPerUnit);
  }

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
