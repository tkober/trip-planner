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

/** A single activity or transport entry within a day column. */
@Component({
  selector: 'app-entry-card',
  imports: [MatIconModule, MatButtonModule, MatMenuModule],
  host: {
    // Transport gets extra room below so the following entry reads as detached.
    '[class.is-transport]': "entry().kind === 'transport'",
  },
  template: `
    <div
      class="entry"
      [style.--accent]="accent()"
      (click)="open.emit(entry())"
    >
      <div class="bullet">
        <mat-icon>{{ icon() }}</mat-icon>
      </div>
      @if (route(); as r) {
        <div class="body route">
          <div class="leg from">
            <div class="time">{{ r.depTime }}</div>
            <div class="place">{{ r.from }}</div>
            @if (r.fromDetail) {
              <div class="detail">{{ r.fromDetail }}</div>
            }
          </div>
          <div class="connector">
            @if (r.duration) {
              <span class="duration">{{ r.duration }}</span>
            }
            <div class="track">
              <span class="line"></span>
              <mat-icon>arrow_forward</mat-icon>
            </div>
          </div>
          <div class="leg to">
            <div class="time">{{ r.arrTime }}</div>
            <div class="place">{{ r.to }}</div>
            @if (r.toDetail) {
              <div class="detail">{{ r.toDetail }}</div>
            }
          </div>
        </div>
      } @else {
        <div class="body">
          <div class="time">{{ timeLabel() }}</div>
          <div class="title">{{ title() }}</div>
          @if (subtitle(); as sub) {
            <div class="subtitle">{{ sub }}</div>
          }
        </div>
      }
      <button
        matIconButton
        class="entry-menu"
        [matMenuTriggerFor]="menu"
        (click)="$event.stopPropagation()"
        aria-label="Entry actions"
      >
        <mat-icon>more_vert</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        <button mat-menu-item (click)="open.emit(entry())">
          <mat-icon>info</mat-icon><span>Details</span>
        </button>
        <button mat-menu-item (click)="edit.emit(entry())">
          <mat-icon>edit</mat-icon><span>Edit</span>
        </button>
        <button mat-menu-item (click)="delete.emit(entry())">
          <mat-icon>delete</mat-icon><span>Delete</span>
        </button>
      </mat-menu>
    </div>
  `,
  styleUrl: './entry-card.scss',
})
export class EntryCard {
  private readonly tz = inject(TimeZoneService);

  readonly entry = input.required<TimelineEntry>();
  readonly destZone = input.required<string>();
  readonly open = output<TimelineEntry>();
  readonly edit = output<TimelineEntry>();
  readonly delete = output<TimelineEntry>();

  readonly icon = computed(() => {
    const e = this.entry();
    if (e.kind === 'activity') return 'local_activity';
    return MODE_ICON[e.transport!.mode];
  });

  /** Effective accent colour: explicit colour or the entity-type default. */
  readonly accent = computed(() => {
    const e = this.entry();
    return e.kind === 'activity'
      ? activityColor(e.activity!)
      : transportColor(e.transport!);
  });

  /** Activity title (transport uses the route headline instead). */
  readonly title = computed(() => this.entry().activity?.title ?? '');

  /**
   * Transport route block (from/to places + times + per-leg detail + duration);
   * null for activities. Times are rendered in the destination tz.
   */
  readonly route = computed<{
    from: string;
    to: string;
    fromDetail?: string;
    toDetail?: string;
    depTime: string;
    arrTime: string;
    duration: string;
  } | null>(() => {
    const t = this.entry().transport;
    if (!t) return null;
    return {
      from: transportFrom(t),
      to: transportTo(t),
      fromDetail: transportFromDetail(t),
      toDetail: transportToDetail(t),
      depTime: this.tz.inZone(t.start, this.destZone()).toFormat('HH:mm'),
      arrTime: t.end
        ? this.tz.inZone(t.end, this.destZone()).toFormat('HH:mm')
        : '',
      duration: t.end ? this.tz.durationLabel(t.start, t.end) : '',
    };
  });

  /** Start time in the destination tz (the timeline's primary reference). */
  readonly timeLabel = computed(() => {
    const start = this.entry().start;
    const startStr = this.tz.inZone(start, this.destZone()).toFormat('HH:mm');
    const end = this.entry().activity?.end ?? this.entry().transport?.end;
    if (end) {
      const endStr = this.tz.inZone(end, this.destZone()).toFormat('HH:mm');
      return `${startStr} – ${endStr}`;
    }
    return startStr;
  });

  /** Activity location subtitle (transport renders per-leg detail in the route). */
  readonly subtitle = computed<string | undefined>(
    () => this.entry().activity?.location ?? undefined,
  );
}
