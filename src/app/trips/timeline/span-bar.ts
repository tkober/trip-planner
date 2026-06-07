import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  AccommodationDto,
  TransportDto,
  TransportMode,
} from '../../models/trip.model';

/**
 * A block placed in the timeline grid that spans one or more day-rows: an
 * accommodation stay (check-in → check-out) or a piece of transport whose
 * departure and arrival fall on different destination-tz days.
 *
 * `startRow`/`endRow` are 0-based day positions; `lane` is the packed column
 * lane (0-based) assigned so overlapping spans sit side by side.
 */
export interface SpanBlock {
  id: string;
  kind: 'accommodation' | 'transport';
  startRow: number;
  endRow: number;
  lane: number;
  title: string;
  icon: string;
  mode?: TransportMode;
  accommodation?: AccommodationDto;
  transport?: TransportDto;
}

@Component({
  selector: 'app-span-bar',
  imports: [MatIconModule],
  host: {
    '[style.grid-column]': 'gridColumn()',
    '[style.grid-row]': 'gridRow()',
    '[attr.data-kind]': 'block().kind',
    '[attr.data-mode]': 'block().mode ?? null',
  },
  template: `
    <button class="span-block" type="button" (click)="open.emit(block())">
      <mat-icon class="span-icon">{{ block().icon }}</mat-icon>
      <span class="span-name">{{ block().title }}</span>
      <mat-icon class="span-more">more_vert</mat-icon>
    </button>
  `,
  styleUrl: './span-bar.scss',
})
export class SpanBar {
  readonly block = input.required<SpanBlock>();
  readonly open = output<SpanBlock>();

  // Columns: 1 = day marker, 2 = hotel lane, 3+ = transport lanes.
  readonly gridColumn = computed(() => {
    const lane = this.block().lane;
    return `${3 + lane} / ${4 + lane}`;
  });

  // Day position p → grid line p + 1.
  readonly gridRow = computed(() => {
    const b = this.block();
    return `${b.startRow + 1} / ${b.endRow + 2}`;
  });
}
