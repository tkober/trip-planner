import { Component, input, output } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import {
  AccommodationDto,
  TimelineEntry,
  ActivityDto,
  TransportDto,
} from '../../models/trip.model';
import { TripDay } from '../../services/time-zone.service';
import { EntryCard } from './entry-card';
import { AccommodationBar } from './accommodation-bar';

export interface AccommodationSegment {
  accommodation: AccommodationDto;
  segment: 'full' | 'checkin' | 'checkout';
}

export interface DayView {
  day: TripDay;
  entries: TimelineEntry[];
  accommodations: AccommodationSegment[];
  dropListId: string;
}

/** One day of the trip: a left rail (date + accommodations) and entry column. */
@Component({
  selector: 'app-day-section',
  imports: [
    DragDropModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    EntryCard,
    AccommodationBar,
  ],
  templateUrl: './day-section.html',
  styleUrl: './day-section.scss',
})
export class DaySection {
  readonly view = input.required<DayView>();
  readonly destZone = input.required<string>();

  readonly addActivity = output<string>();
  readonly addTransport = output<string>();
  readonly openEntry = output<TimelineEntry>();
  readonly editEntry = output<TimelineEntry>();
  readonly deleteEntry = output<TimelineEntry>();
  readonly openAccommodation = output<AccommodationDto>();
  readonly editAccommodation = output<AccommodationDto>();
  readonly deleteAccommodation = output<AccommodationDto>();
  readonly dropped = output<CdkDragDrop<DayView>>();

  // Helpers so the template can route an entry's edit/delete to the right kind.
  asActivity(entry: TimelineEntry): ActivityDto | undefined {
    return entry.activity;
  }
  asTransport(entry: TimelineEntry): TransportDto | undefined {
    return entry.transport;
  }
}
