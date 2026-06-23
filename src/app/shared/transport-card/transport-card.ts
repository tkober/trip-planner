import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TransportDto, TransportMode, ZonedTime } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { transportColor } from '../color/color';
import {
  transportFrom,
  transportFromDetail,
  transportTo,
  transportToDetail,
} from '../transport-format';
import { formatMoney } from '../cost/cost';

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

/** One endpoint of the route, formatted for both trip zones. */
interface Endpoint {
  date: string;
  place: string;
  detail?: string;
  primary: string;
  primaryZone: string;
  secondary: string;
  secondaryZone: string;
  sameZone: boolean;
}

/**
 * A transport entry rendered in the timeline's route style — an accent icon
 * bullet, the derived `FROM → TO` headline with departure/arrival times and the
 * travel duration over the arrow — but laid out full-width for the list/overview
 * sections, so each leg can also carry its date and the dual-zone time. Used by
 * the Overview flight cards and the Transport list to keep one visual language.
 */
@Component({
  selector: 'app-transport-card',
  imports: [MatIconModule, MatButtonModule, MatMenuModule],
  templateUrl: './transport-card.html',
  styleUrl: './transport-card.scss',
})
export class TransportCard {
  private readonly tz = inject(TimeZoneService);

  readonly transport = input.required<TransportDto>();
  readonly homeZone = input.required<string>();
  readonly destZone = input.required<string>();
  /** Optional eyebrow label (e.g. "Departure"); falls back to the mode name. */
  readonly role = input<string>();

  readonly open = output<TransportDto>();
  readonly edit = output<TransportDto>();
  readonly delete = output<TransportDto>();

  readonly icon = computed(() => MODE_ICON[this.transport().mode]);
  readonly eyebrow = computed(
    () => this.role() ?? MODE_LABEL[this.transport().mode],
  );
  readonly accent = computed(() => transportColor(this.transport()));

  readonly from = computed(() => transportFrom(this.transport()));
  readonly to = computed(() => transportTo(this.transport()));

  /** Travel time shown over the arrow; empty when there's no arrival. */
  readonly duration = computed(() => {
    const t = this.transport();
    return t.end ? this.tz.durationLabel(t.start, t.end) : '';
  });

  readonly departure = computed<Endpoint>(() =>
    this.endpoint(this.transport().start, this.from(), transportFromDetail(this.transport())),
  );
  readonly arrival = computed<Endpoint | undefined>(() => {
    const t = this.transport();
    return t.end
      ? this.endpoint(t.end, this.to(), transportToDetail(t))
      : undefined;
  });

  /**
   * Mode-specific detail lines for the right-hand column (flight number/airline,
   * train line/name/operator/kind, bus line/operator/kind). Empty entries are
   * dropped; car has none, so it keeps the old full-width route layout.
   */
  readonly details = computed<string[]>(() => {
    const t = this.transport();
    const lines = (...xs: (string | undefined)[]) =>
      xs.map((x) => x?.trim()).filter((x): x is string => !!x);
    const price =
      t.totalPrice != null ? formatMoney(t.totalPrice, t.currency) : undefined;
    switch (t.mode) {
      case 'flight':
        return lines(t.flightNumber, t.airline, price);
      case 'train':
        return lines(t.line, t.trainName, t.operator, t.trainKind, price);
      case 'bus':
        return lines(t.line, t.operator, t.busKind, price);
      default:
        return [];
    }
  });

  private endpoint(zt: ZonedTime, place: string, detail?: string): Endpoint {
    const dual = this.tz.dualLabel(zt, this.homeZone(), this.destZone());
    return {
      date: this.tz.toDateTime(zt).toFormat('ccc, d LLL yyyy'),
      place,
      detail,
      primary: dual.primary,
      primaryZone: dual.primaryZoneAbbr,
      secondary: dual.secondary,
      secondaryZone: dual.secondaryZoneAbbr,
      sameZone: dual.sameZone,
    };
  }
}
