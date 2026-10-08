import { Component, computed, inject, input, output } from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TimelineEntry, TransportMode } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { EditModeService } from '../../services/edit-mode.service';
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
  imports: [MatIconModule, MatButtonModule, MatMenuModule, CdkDragHandle],
  host: {
    // Transport gets extra room below so the following entry reads as detached.
    '[class.is-transport]': "entry().kind === 'transport'",
  },
  template: `
    <div
      class="entry"
      [class.up-next]="upNext()"
      [style.--accent]="accent()"
      (click)="open.emit(entry())"
    >
      @if (upNext()) {
        <div class="up-next-label">Up next</div>
      }
      @if (route(); as r) {
        <div class="main">
          <div class="body route">
            <div class="leg from">
              <div class="time">{{ r.depTime }}</div>
              <div class="place">{{ r.from }}</div>
              @if (r.fromDetail) {
                <div class="detail-line">{{ r.fromDetail }}</div>
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
                <div class="detail-line">{{ r.toDetail }}</div>
              }
            </div>
          </div>
          @if (details().length) {
            <div class="chips">
              @for (line of details(); track $index) {
                <span class="chip">{{ line }}</span>
              }
            </div>
          }
        </div>
        @if (showLocateHint() && !hasLocation()) {
          <div class="locate-hint">
            <mat-icon>location_off</mat-icon>
            <span>No location</span>
            <button
              type="button"
              class="locate-link"
              (click)="$event.stopPropagation(); locate.emit(entry())"
            >
              Locate
            </button>
          </div>
        }
      } @else {
        <div class="time-col">
          <div class="start">{{ startTime() }}</div>
          @if (endTime(); as end) {
            <div class="end">{{ end }}</div>
          }
        </div>
        <div class="body">
          <div class="title">{{ title() }}</div>
          @if (subtitle(); as sub) {
            <div class="subtitle">{{ sub }}</div>
          }
        </div>
        @if (showLocateHint() && !hasLocation()) {
          <div class="locate-hint">
            <mat-icon>location_off</mat-icon>
            <span>No location</span>
            <button
              type="button"
              class="locate-link"
              (click)="$event.stopPropagation(); locate.emit(entry())"
            >
              Locate
            </button>
          </div>
        }
      }
      <div class="right-cluster">
        <div class="icon-tile">
          <mat-icon>{{ icon() }}</mat-icon>
        </div>
        @if (showHandle()) {
          <div
            class="drag-handle"
            cdkDragHandle
            (click)="$event.stopPropagation()"
          >
            <mat-icon>drag_indicator</mat-icon>
          </div>
        }
        @if (!editMode.readOnly()) {
          <button
            matIconButton
            class="entry-menu"
            [matMenuTriggerFor]="menu"
            (click)="$event.stopPropagation()"
            aria-label="Entry actions"
          >
            <mat-icon>more_vert</mat-icon>
          </button>
        }
      </div>
      <mat-menu #menu="matMenu">
        <button mat-menu-item (click)="open.emit(entry())">
          <mat-icon>info</mat-icon><span>Details</span>
        </button>
        <button mat-menu-item (click)="edit.emit(entry())">
          <mat-icon>edit</mat-icon><span>Edit</span>
        </button>
        <button mat-menu-item (click)="move.emit(entry())">
          <mat-icon>event</mat-icon><span>Move to another day…</span>
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
  readonly editMode = inject(EditModeService);

  readonly entry = input.required<TimelineEntry>();
  readonly destZone = input.required<string>();
  /** R4, mobile today only: the first entry whose start is after "now". */
  readonly upNext = input(false);
  readonly open = output<TimelineEntry>();
  readonly edit = output<TimelineEntry>();
  readonly delete = output<TimelineEntry>();
  readonly move = output<TimelineEntry>();
  /** D6, #50: shows a "No location" hint + "Locate" action when the entry has
   * no `GeoPoint` at all — off by default so List/Columns/Week render
   * unchanged; only the Map view's list panel sets this. */
  readonly showLocateHint = input(false);
  readonly locate = output<TimelineEntry>();

  /** Whether the entry has at least one geocoded point (activity `geo`, or
   * either transport endpoint) — drives the Map view's "No location" hint
   * and its "entries without location" counter. */
  readonly hasLocation = computed(() => {
    const e = this.entry();
    if (e.kind === 'activity') return !!e.activity!.geo;
    const t = e.transport!;
    return !!(t.fromGeo || t.toGeo);
  });

  /**
   * The drag handle only renders in mobile edit mode. On desktop the whole
   * card must stay draggable exactly as before — CDK only drags from a
   * handle once any handle exists, so the handle must not even be in the
   * DOM there.
   */
  readonly showHandle = computed(
    () => this.editMode.isMobile() && this.editMode.editing(),
  );

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

  /**
   * Mode-specific detail lines for the right-hand column, mirroring the shared
   * TransportCard (flight: number/airline; train: line/name/operator/kind; bus:
   * line/operator/kind). Empty for activities and car, so the route keeps the
   * full width in those cases.
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

  /**
   * Start/end time in the destination tz (the timeline's primary reference),
   * rendered in the fixed-width time column — entries without an end show
   * only the start.
   */
  readonly startTime = computed(() =>
    this.tz.inZone(this.entry().start, this.destZone()).toFormat('HH:mm'),
  );
  readonly endTime = computed(() => {
    const end = this.entry().activity?.end ?? this.entry().transport?.end;
    return end ? this.tz.inZone(end, this.destZone()).toFormat('HH:mm') : undefined;
  });

  /** Activity location subtitle (transport renders per-leg detail in the route). */
  readonly subtitle = computed<string | undefined>(
    () => this.entry().activity?.location ?? undefined,
  );
}
