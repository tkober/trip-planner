import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TimelineEntry, TransportMode } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { activityColor, transportColor } from '../../shared/color/color';
import {
  transportFrom,
  transportFromDetail,
  transportTo,
  transportToDetail,
} from '../../shared/transport-format';

const MODE_ICON: Record<TransportMode, string> = {
  flight: 'flight',
  train: 'train',
  bus: 'directions_bus',
  car: 'directions_car',
};

/**
 * A list card for an activity/transport that crosses a day boundary in the
 * destination tz. It is positioned centered on the separator between its start
 * and end day; the dashed divider through its middle marks the day change, with
 * the start (top) and end (bottom) date/times keeping the two days recognizable.
 */
@Component({
  selector: 'app-straddle-card',
  imports: [MatIconModule, MatButtonModule, MatMenuModule],
  host: {
    '[style.grid-column]': "'-2 / -1'",
    '[style.grid-row]': 'gridRow()',
    '[style.--accent]': 'accent()',
  },
  templateUrl: './straddle-card.html',
  styleUrl: './straddle-card.scss',
})
export class StraddleCard {
  private readonly tz = inject(TimeZoneService);

  readonly entry = input.required<TimelineEntry>();
  /** Grid line to anchor on (the separator between the two days). */
  readonly rowLine = input.required<number>();

  readonly open = output<TimelineEntry>();
  readonly edit = output<TimelineEntry>();
  readonly delete = output<TimelineEntry>();

  readonly gridRow = computed(() => `${this.rowLine()} / span 1`);

  readonly icon = computed(() => {
    const e = this.entry();
    return e.kind === 'activity' ? 'local_activity' : MODE_ICON[e.transport!.mode];
  });

  /** Departure-leg icon: takeoff for flights, a generic out-arrow otherwise. */
  readonly departIcon = computed(() =>
    this.entry().transport?.mode === 'flight' ? 'flight_takeoff' : 'north_east',
  );

  /** Arrival-leg icon: landing for flights, a generic in-arrow otherwise. */
  readonly arriveIcon = computed(() =>
    this.entry().transport?.mode === 'flight' ? 'flight_land' : 'south_east',
  );

  /** Effective accent colour: explicit colour or the entity-type default. */
  readonly accent = computed(() => {
    const e = this.entry();
    return e.kind === 'activity'
      ? activityColor(e.activity!)
      : transportColor(e.transport!);
  });

  /** Activity title (transport uses from/to places instead). */
  readonly title = computed(() => this.entry().activity?.title ?? '');

  /** Origin place (top half) for transport entries; undefined for activities. */
  readonly fromPlace = computed(() => {
    const t = this.entry().transport;
    return t ? transportFrom(t) : undefined;
  });

  /** Destination place (bottom half) for transport entries. */
  readonly toPlace = computed(() => {
    const t = this.entry().transport;
    return t ? transportTo(t) : undefined;
  });

  /** Departure-leg detail (airport/terminal …) shown on the top half. */
  readonly fromDetail = computed(() => {
    const t = this.entry().transport;
    return t ? transportFromDetail(t) : undefined;
  });

  /** Arrival-leg detail shown on the bottom half. */
  readonly toDetail = computed(() => {
    const t = this.entry().transport;
    return t ? transportToDetail(t) : undefined;
  });

  /** Travel time shown on the day-boundary divider; empty when unavailable. */
  readonly duration = computed(() => {
    const t = this.entry().transport;
    return t?.end ? this.tz.durationLabel(t.start, t.end) : '';
  });

  /**
   * Whole-journey detail lines, mode-specific (flight: number/airline; train:
   * line/name/operator/kind; bus: line/operator/kind). Empty for activities and
   * car. Shown stacked in the top half's upper-right corner (same per-mode set as
   * EntryCard).
   */
  readonly details = computed<string[]>(() => {
    const t = this.entry().transport;
    if (!t) return [];
    const lines = (...xs: (string | undefined)[]) =>
      xs.map((x) => x?.trim()).filter((x): x is string => !!x);
    switch (t.mode) {
      case 'flight':
        return lines(t.flightNumber, t.airline);
      case 'train':
        return lines(t.line, t.trainName, t.operator, t.trainKind);
      case 'bus':
        return lines(t.line, t.operator, t.busKind);
      default:
        return [];
    }
  });

  readonly startLabel = computed(() => this.label(this.entry().start));
  readonly endLabel = computed(() => {
    const end = this.entry().activity?.end ?? this.entry().transport?.end;
    return end ? this.label(end) : undefined;
  });

  /** Activity location subtitle (transport renders per-leg detail instead). */
  readonly subtitle = computed<string | undefined>(
    () => this.entry().activity?.location ?? undefined,
  );

  /** Whether the two endpoints sit in different zones (show the zone tag). */
  readonly showZones = computed(() => {
    const e = this.entry();
    const end = e.activity?.end ?? e.transport?.end;
    return !!end && end.zone !== e.start.zone;
  });

  /** Each endpoint in ITS OWN zone, so the two calendar days read correctly. */
  private label(zt: { dateTime: string; zone: string }): {
    when: string;
    zone: string;
  } {
    const dt = this.tz.toDateTime(zt);
    return {
      when: dt.toFormat("ccc, d LLL '·' HH:mm"),
      zone: dt.toFormat('ZZZZ'),
    };
  }
}
