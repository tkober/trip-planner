import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TimelineEntry, TransportMode } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { activityColor, transportColor } from '../../shared/color/color';

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
      <div class="body">
        <div class="time">{{ timeLabel() }}</div>
        <div class="title">{{ title() }}</div>
        @if (subtitle(); as sub) {
          <div class="subtitle">{{ sub }}</div>
        }
      </div>
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

  readonly title = computed(
    () => this.entry().activity?.title ?? this.entry().transport?.title ?? '',
  );

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

  readonly subtitle = computed<string | undefined>(() => {
    const t = this.entry().transport;
    if (t && (t.fromLocation || t.toLocation)) {
      return `${t.fromLocation ?? '?'} → ${t.toLocation ?? '?'}`;
    }
    return this.entry().activity?.location ?? undefined;
  });
}
