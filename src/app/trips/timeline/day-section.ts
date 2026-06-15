import { Component, input, output, signal, viewChild } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
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
  readonly addAccommodation = output<string>();
  readonly addCarReservation = output<string>();
  readonly openEntry = output<TimelineEntry>();
  readonly editEntry = output<TimelineEntry>();
  readonly deleteEntry = output<TimelineEntry>();
  readonly dropped = output<CdkDragDrop<DayView>>();

  /** Invisible anchor for the day menu, positioned at the click coordinates. */
  private readonly menuTrigger = viewChild.required(MatMenuTrigger);
  readonly menuX = signal(0);
  readonly menuY = signal(0);

  /** Open the add-to-day menu anchored at the cursor. */
  openDayMenu(event: MouseEvent): void {
    this.menuX.set(event.clientX);
    this.menuY.set(event.clientY);
    this.menuTrigger().openMenu();
  }
}
