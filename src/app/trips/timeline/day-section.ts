import { Component, input, output, signal, viewChild } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { CarReservationDto, TimelineEntry } from '../../models/trip.model';
import { TripDay } from '../../services/time-zone.service';
import { EntryCard } from './entry-card';

/**
 * A car rental pickup ("Fetch by") or return ("Return by") deadline, shown as a
 * compact pill in the day it falls on. It's not its own entity — it's derived
 * from the reservation and tinted with the reservation's accent colour.
 */
export interface CarDeadline {
  car: CarReservationDto;
  kind: 'pickup' | 'dropoff';
  /** "Fetch by" | "Return by". */
  label: string;
  /** Deadline time "HH:mm" in the destination tz, or '' when none is set. */
  time: string;
  /** Rental company, or '' when none is set. */
  company: string;
  /** Pickup / return station for this deadline, or '' when none is set. */
  location: string;
  /** Resolved accent colour of the reservation. */
  color: string;
}

/**
 * One row in a day's content column: either an activity/transport entry card or
 * a car deadline pill. Both carry a `sortMillis` so they interleave by time —
 * e.g. a "Return by 14:00" pill sits between the activities before and after it.
 */
export interface DayItem {
  /** Stable track key. */
  key: string;
  /** Absolute instant used to order items within the day. */
  sortMillis: number;
  /** Exactly one of `entry` / `deadline` is set. */
  entry?: TimelineEntry;
  deadline?: CarDeadline;
}

export interface DayView {
  day: TripDay;
  /** Entries and car pickup/return deadlines for the day, interleaved by time. */
  items: DayItem[];
  /** Whether the day has any activity/transport entry (drives the empty message). */
  hasEntries: boolean;
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
  readonly openCar = output<CarReservationDto>();
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
