import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TransportDto, TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { TransportCard } from '../../shared/transport-card/transport-card';
import {
  formatEur,
  formatRateAge,
  isRateStale,
  tripCostSummary,
} from '../../shared/cost/cost';
import { formatDate, zoneLabel } from '../../shared/format/date-format';

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
  /** Expose the date/zone format helpers to the template. */
  protected readonly formatDate = formatDate;
  protected readonly zoneLabel = zoneLabel;

  /** True while the online rate refresh is in flight (disables the button). */
  readonly refreshing = signal(false);

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

  /** ISO instant a rate was last set, or undefined when never set/no timestamp. */
  rateUpdatedAt(code: string): string | undefined {
    return this.trip()?.exchangeRatesUpdatedAt?.[code];
  }

  /** "Updated today/yesterday/N days ago" for a rate with a known timestamp. */
  rateAgeLabel(code: string): string {
    const updatedAt = this.rateUpdatedAt(code);
    return updatedAt ? formatRateAge(updatedAt) : '';
  }

  /** Full local date/time for a rate's timestamp (used as a `title` tooltip). */
  rateUpdatedAtTitle(code: string): string {
    const updatedAt = this.rateUpdatedAt(code);
    return updatedAt ? new Date(updatedAt).toLocaleString() : '';
  }

  /**
   * True when the rate is stale (older than a week) or its rate is set but
   * its update date is unknown (legacy data, set before this field existed) —
   * both are shown as a yellow warning.
   */
  rateIsStale(code: string): boolean {
    if (!this.trip()?.exchangeRates?.[code]) return false;
    const updatedAt = this.rateUpdatedAt(code);
    return !updatedAt || isRateStale(updatedAt);
  }

  /** Fetch current EUR rates online for every currency in use on this trip. */
  async refreshExchangeRates(): Promise<void> {
    const trip = this.trip();
    const codes = this.costSummary()?.currenciesInUse;
    if (!trip || !codes?.length || this.refreshing()) return;
    this.refreshing.set(true);
    try {
      await this.actions.refreshExchangeRates(trip, codes);
    } finally {
      this.refreshing.set(false);
    }
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
