import { Component, input, output } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TimelineEntry } from '../../models/trip.model';
import { TripDay } from '../../services/time-zone.service';
import { EntryCard } from './entry-card';

export interface DayView {
  day: TripDay;
  entries: TimelineEntry[];
  dropListId: string;
  /** Reserve space at the top/bottom for a straddle card on that boundary. */
  padTop: boolean;
  padBottom: boolean;
}

/**
 * One day of the trip. Uses `display: contents` so its day-marker and content
 * cells become direct children of the timeline grid, letting accommodation /
 * transport span-blocks share the same rows.
 */
@Component({
  selector: 'app-day-section',
  imports: [
    DragDropModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    EntryCard,
  ],
  templateUrl: './day-section.html',
  styleUrl: './day-section.scss',
})
export class DaySection {
  readonly view = input.required<DayView>();
  readonly destZone = input.required<string>();
  /** Short city label for the day's reference zone (e.g. "Tokyo"). */
  readonly zoneLabel = input.required<string>();
  /** 1-based grid row line for this day. */
  readonly rowIndex = input.required<number>();

  readonly addActivity = output<string>();
  readonly addTransport = output<string>();
  readonly openEntry = output<TimelineEntry>();
  readonly editEntry = output<TimelineEntry>();
  readonly deleteEntry = output<TimelineEntry>();
  readonly dropped = output<CdkDragDrop<DayView>>();
}
