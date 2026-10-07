import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import {
  AccommodationDto,
  CarReservationDto,
  TimelineEntry,
} from '../../models/trip.model';
import { TripDay } from '../../services/time-zone.service';
import { EditModeService } from '../../services/edit-mode.service';
import { EntryCard } from './entry-card';
import { SplitEntryCard } from './split-entry-card';
import { TimelineNavService } from './timeline-nav.service';

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
  /** Mobile-only short label ("Pick up" / "Return"); desktop keeps `label`. */
  shortLabel: string;
}

/**
 * A check-out or check-in event, shown as a pill (R5, mobile only) that sorts
 * to the very start/end of the day's item list — see `DayItem.sortMillis`.
 */
export interface StayEvent {
  kind: 'checkout' | 'checkin';
  accommodation: AccommodationDto;
  /** Resolved accent colour of the accommodation. */
  color: string;
  /** Check-in only: total nights of the stay. */
  nights?: number;
}

/**
 * R6, mobile only: one half of a day-crossing entry, rendered in the normal
 * day flow instead of a floating straddle card. `refZone` is the reference
 * zone of the day THIS half sits on (destination zone for a real day, home
 * zone for a virtual departure/return day) — drives the highlighted zone tag
 * when the entry's own zone differs from it. `farDayLabel` (top half only) is
 * the end day's label ("Day 14" / "Return Day"), for the "arrives Day 14"
 * duration line; `homeZone` (bottom half only) is the trip's home zone, for
 * the "01:55 in Berlin" subtitle when the arrival zone differs from it.
 */
export interface SplitHalf {
  entry: TimelineEntry;
  part: 'top' | 'bottom';
  refZone: string;
  farDayLabel?: string;
  homeZone?: string;
}

/**
 * R6: a slim, non-draggable row for a day strictly covered by a
 * multi-boundary entry (neither its start nor its end day). `part: 'middle'`
 * reads "continues · until <end day>"; `part: 'end'` (desktop only — mobile
 * shows the bottom split half there instead) reads "arrives <time> · <TO>".
 */
export interface ContinuesRow {
  entry: TimelineEntry;
  part: 'middle' | 'end';
  /** Pre-formatted: "continues · until Thu, 16 Apr" / "arrives 06:50 · Tokyo". */
  label: string;
  /** Resolved accent colour of the entry. */
  color: string;
}

/**
 * One row in a day's content column: an activity/transport entry card, a car
 * deadline pill, (R5, mobile only) a check-out/check-in stay pill, or (R6) a
 * day-crossing entry's split half / continues row. All carry a `sortMillis`
 * so they interleave by time — e.g. a "Return by 14:00" pill sits between the
 * activities before and after it; a stay pill's ±Infinity always keeps it at
 * the very start/end of the day.
 */
export interface DayItem {
  /** Stable track key. */
  key: string;
  /** Absolute instant used to order items within the day. */
  sortMillis: number;
  /** Exactly one of `entry` / `deadline` / `stay` / `split` / `continues` is set. */
  entry?: TimelineEntry;
  deadline?: CarDeadline;
  stay?: StayEvent;
  split?: SplitHalf;
  continues?: ContinuesRow;
  /** R4, today only: the first entry whose start is after "now" (see now-line.ts). */
  upNext?: boolean;
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
  /** "Tokyo · GMT+9" (mobile sticky header's zone label; see `date-format.ts`). */
  zoneLabelFull: string;
  /** R4, mobile only: where the now-line sits among `items` (today's day only). */
  nowLineInsertIndex?: number;
  /** R4: "Now 14:05" label for the now-line (today's day only). */
  nowLineLabel?: string;
  /** R5, mobile only: the day header's second line (see `day-stay.ts`). */
  stay?: { text: string; color: string; accommodation?: AccommodationDto };
  car?: { text: string; color: string; reservation: CarReservationDto };
  /**
   * R6, mobile only: accent colour of a day-crossing entry whose bottom half
   * opens this day — draws the dashed connector through the sticky header
   * that visually continues from the previous day's top half.
   */
  connectorColor?: string;
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
    SplitEntryCard,
  ],
  templateUrl: './day-section.html',
  styleUrl: './day-section.scss',
})
export class DaySection {
  readonly editMode = inject(EditModeService);
  private readonly nav = inject(TimelineNavService);
  private readonly destroyRef = inject(DestroyRef);

  readonly view = input.required<DayView>();
  readonly destZone = input.required<string>();
  /** Short city label for the day's reference zone (e.g. "Tokyo"). */
  readonly zoneLabel = input.required<string>();
  /** 1-based grid row line for this day. */
  readonly rowIndex = input.required<number>();

  /** The mobile sticky day header (see day-section.html) — registered with
   * `TimelineNavService` so the day strip can scroll to it and the scroll
   * spy can tell when it's the one under the app bar. */
  private readonly headerEl = viewChild<ElementRef<HTMLElement>>('headerEl');

  constructor() {
    effect(() => {
      const el = this.headerEl()?.nativeElement;
      if (el) this.nav.registerHeader(this.view().day.date, el);
    });
    this.destroyRef.onDestroy(() => this.nav.unregisterHeader(this.view().day.date));
  }

  readonly addActivity = output<string>();
  readonly addTransport = output<string>();
  readonly addAccommodation = output<string>();
  readonly addCarReservation = output<string>();
  readonly openEntry = output<TimelineEntry>();
  readonly editEntry = output<TimelineEntry>();
  readonly deleteEntry = output<TimelineEntry>();
  readonly moveEntry = output<TimelineEntry>();
  readonly openCar = output<CarReservationDto>();
  /** R5: a check-out/check-in pill or the mobile header's stay line tapped. */
  readonly openAccommodation = output<AccommodationDto>();
  readonly dropped = output<CdkDragDrop<DayView>>();

  /** Invisible anchor for the day menu, positioned at the click coordinates. */
  private readonly menuTrigger = viewChild.required(MatMenuTrigger);
  readonly menuX = signal(0);
  readonly menuY = signal(0);

  /** Open the add-to-day menu anchored at the cursor. Disabled in read mode. */
  openDayMenu(event: MouseEvent): void {
    if (this.editMode.readOnly()) return;
    this.menuX.set(event.clientX);
    this.menuY.set(event.clientY);
    this.menuTrigger().openMenu();
  }

  /**
   * R5: the mobile header's stay/car line tapped — stop propagation so the
   * header's own click (open the day menu) doesn't also fire.
   */
  openHeaderStay(event: MouseEvent): void {
    event.stopPropagation();
    const accommodation = this.view().stay?.accommodation;
    if (accommodation) this.openAccommodation.emit(accommodation);
  }

  openHeaderCar(event: MouseEvent): void {
    event.stopPropagation();
    const reservation = this.view().car?.reservation;
    if (reservation) this.openCar.emit(reservation);
  }
}
