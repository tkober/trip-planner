import { Component, computed, inject, input, output } from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TimelineEntry, TransportMode, ZonedTime } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { EditModeService } from '../../services/edit-mode.service';
import { activityColor, transportColor } from '../../shared/color/color';
import { zoneCity } from '../../shared/format/date-format';
import { zoneDiffers } from './day-span';
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
 * R6, mobile only: one half (top or bottom) of a day-crossing entry, rendered
 * inline in the normal day flow instead of a floating `StraddleCard` (which
 * mobile no longer renders — see `DaySection`/`TimelineView.layout()`). The
 * top half is the last item of the start day (departure/start time + a
 * duration/"until" line pointing at the far day); the bottom half is the
 * first item of the end day (arrival/end time + place). Both tap through to
 * the same details and, in edit mode, carry the drag handle (dragging either
 * half moves the whole entry) and the usual kebab.
 */
@Component({
  selector: 'app-split-entry-card',
  imports: [MatIconModule, MatButtonModule, MatMenuModule, CdkDragHandle],
  host: {
    '[class.top]': "part() === 'top'",
    '[class.bottom]': "part() === 'bottom'",
    '[style.--accent]': 'accent()',
  },
  templateUrl: './split-entry-card.html',
  styleUrl: './split-entry-card.scss',
})
export class SplitEntryCard {
  private readonly tz = inject(TimeZoneService);
  readonly editMode = inject(EditModeService);

  readonly entry = input.required<TimelineEntry>();
  readonly part = input.required<'top' | 'bottom'>();
  /** Reference zone of the day THIS half sits on. */
  readonly refZone = input.required<string>();
  /** Top half only: the end day's label ("Day 14" / "Return Day"). */
  readonly farDayLabel = input<string | undefined>(undefined);
  /** Bottom half only: the trip's home zone, for the "HH:mm in <city>" subtitle. */
  readonly homeZone = input<string | undefined>(undefined);
  /** R4, mobile today only: this half is the first entry starting after "now". */
  readonly upNext = input(false);

  readonly open = output<TimelineEntry>();
  readonly edit = output<TimelineEntry>();
  readonly delete = output<TimelineEntry>();
  readonly move = output<TimelineEntry>();

  readonly showHandle = computed(
    () => this.editMode.isMobile() && this.editMode.editing(),
  );

  readonly icon = computed(() => {
    const e = this.entry();
    return e.kind === 'activity' ? 'local_activity' : MODE_ICON[e.transport!.mode];
  });

  readonly accent = computed(() => {
    const e = this.entry();
    return e.kind === 'activity'
      ? activityColor(e.activity!)
      : transportColor(e.transport!);
  });

  private readonly end = computed<ZonedTime | undefined>(
    () => this.entry().activity?.end ?? this.entry().transport?.end,
  );

  /** Top half: title is the activity title or the transport's origin (FROM). */
  readonly topTitle = computed(() => {
    const e = this.entry();
    const t = e.transport;
    return t ? transportFrom(t) : e.activity?.title ?? '';
  });

  /** Bottom half: transport destination (TO); activities have no title here. */
  readonly bottomTitle = computed(() => this.entry().transport
    ? transportTo(this.entry().transport!)
    : undefined);

  readonly fromDetail = computed(() => {
    const t = this.entry().transport;
    return t ? transportFromDetail(t) : undefined;
  });

  readonly toDetail = computed(() => {
    const t = this.entry().transport;
    return t ? transportToDetail(t) : undefined;
  });

  /** Activity location (top: the place; bottom: "ends" + the same place). */
  readonly location = computed(() => this.entry().activity?.location);

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

  /** Own-zone time + whether it differs from this half's day reference zone. */
  readonly topTime = computed(() => this.timeOf(this.entry().start));
  readonly bottomTime = computed(() => {
    const end = this.end();
    return end ? this.timeOf(end) : undefined;
  });

  private timeOf(zt: ZonedTime): { when: string; zone: string; highlight: boolean } {
    const dt = this.tz.toDateTime(zt);
    return {
      when: dt.toFormat('HH:mm'),
      zone: dt.toFormat('ZZZZ'),
      highlight: zoneDiffers(zt, this.refZone()),
    };
  }

  /**
   * Top half only: "↓ 8h 20min · arrives Day 14" for transport, or
   * "until Mon 01:00 · Day 4" for an activity.
   */
  readonly durationLine = computed(() => {
    const e = this.entry();
    const end = this.end();
    if (!end) return undefined;
    const far = this.farDayLabel() ?? '';
    if (e.transport) {
      const d = this.tz.durationLabel(e.start, end);
      return d ? `↓ ${d} · arrives ${far}` : `arrives ${far}`;
    }
    const until = this.tz.toDateTime(end).toFormat('ccc HH:mm');
    return `until ${until} · ${far}`;
  });

  /** Bottom half only: "01:55 in Berlin" when the arrival zone ≠ home zone. */
  readonly homeTimeSubtitle = computed(() => {
    const end = this.end();
    const home = this.homeZone();
    if (!end || !home || end.zone === home) return undefined;
    const dt = this.tz.inZone(end, home);
    return `${dt.toFormat('HH:mm')} in ${zoneCity(home)}`;
  });
}
