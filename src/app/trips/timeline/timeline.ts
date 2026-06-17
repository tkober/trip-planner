import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DateTime } from 'luxon';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AccommodationDto,
  CarReservationDto,
  TimelineEntry,
  TripDto,
  ZonedTime,
} from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { DaySection, DayView } from './day-section';
import { HotelCell, HotelDayCell } from './hotel-cell';
import { CarSpan } from './car-span';
import { StraddleCard } from './straddle-card';
import {
  accommodationColors,
  carReservationColors,
} from '../../shared/color/color';
import { transportLabel } from '../../shared/transport-format';

/** An entry that crosses a day boundary, anchored on the separator line. */
interface StraddleItem {
  entry: TimelineEntry;
  /** Grid line of the separator between the start and end day. */
  rowLine: number;
}

/**
 * The lane item a right-click context menu is acting on. `side` (chosen by which
 * half of the block was clicked — upper = start, lower = end) selects which date
 * the ±1-day actions move: accommodation check-in/out, car pickup/dropoff.
 */
type LaneContext =
  | { kind: 'accommodation'; accommodation: AccommodationDto; side: 'start' | 'end' }
  | { kind: 'car'; car: CarReservationDto; side: 'start' | 'end' };

/**
 * A grayed pseudo-day prepended/appended for an international flight whose home
 * endpoint sits outside the destination-tz trip range (the home-tz departure day
 * before the trip, or the home-tz arrival day at its end).
 */
interface VirtualDay {
  /** "Departure Day" or "Return Day". */
  label: string;
  /** Weekday / date in the endpoint's OWN (home) zone. */
  weekday: string;
  dayNum: string;
  /** Home city label. */
  city: string;
  padTop: boolean;
  padBottom: boolean;
}

/** The day-by-day timeline grid (one of the trip-page views). */
@Component({
  selector: 'app-timeline-view',
  imports: [
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    DaySection,
    HotelCell,
    CarSpan,
    StraddleCard,
  ],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
})
export class TimelineView {
  /** Parent route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();
  /** When set, render this trip instead of looking it up in the store (export). */
  readonly tripOverride = input<TripDto | undefined>(undefined);
  /** Deterministic fixed-px lane widths for export output (no viewport `clamp`). */
  readonly exportMode = input(false);

  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);
  private readonly snack = inject(MatSnackBar);

  readonly trip = computed<TripDto | undefined>(
    () => this.tripOverride() ?? this.store.trips().find((t) => t.id === this.id()),
  );

  readonly days = computed(() => {
    const trip = this.trip();
    return trip ? this.tz.enumerateDays(trip) : [];
  });

  /** Map of destination-tz date → 0-based day position. */
  private readonly dayIndexByDate = computed(() => {
    const m = new Map<string, number>();
    this.days().forEach((d, i) => m.set(d.date, i));
    return m;
  });

  readonly hasAccommodations = computed(
    () => (this.trip()?.accommodations.length ?? 0) > 0,
  );

  readonly hasCarReservations = computed(
    () => (this.trip()?.carReservations.length ?? 0) > 0,
  );

  /**
   * The timeline grid columns: [day marker] [hotel lane] [car lane] [content].
   * The hotel and car lanes each collapse to 0px when their entity is absent.
   */
  readonly gridTemplateColumns = computed(() => {
    const exp = this.exportMode();
    const marker = exp ? '88px' : 'clamp(72px, 16vw, 96px)';
    const lane = exp ? '48px' : 'clamp(40px, 9vw, 52px)';
    const hotel = this.hasAccommodations() ? lane : '0px';
    const car = this.hasCarReservations() ? lane : '0px';
    return `${marker} ${hotel} ${car} minmax(0, 1fr)`;
  });

  /**
   * Per-day hotel cells. Each day's top half is the hotel you wake up in
   * (last night's stay) and the bottom half the hotel you sleep in tonight.
   * A switch day naturally splits top/bottom; a continuous stay reads as one
   * block. Always a single lane — no overlap.
   */
  readonly hotelCells = computed<HotelDayCell[]>(() => {
    const trip = this.trip();
    const days = this.days();
    if (!trip || !days.length || !trip.accommodations.length) return [];

    const colorById = accommodationColors(trip.accommodations);
    const offset = this.rowOffset();

    // The accommodation you sleep in on each day's night, if any.
    const nightOf = days.map((d) =>
      trip.accommodations.find(
        (a) => a.checkInDate <= d.date && d.date < a.checkOutDate,
      ),
    );

    const cells: HotelDayCell[] = [];
    days.forEach((_, i) => {
      const night = nightOf[i];
      const morning = i > 0 ? nightOf[i - 1] : undefined;
      if (!night && !morning) return;
      const sameRun = !!morning && !!night && morning.id === night.id;
      cells.push({
        rowIndex: i + 1 + offset,
        top: morning
          ? {
              accommodation: morning,
              rounded: !sameRun,
              isStart: false,
              color: colorById.get(morning.id) ?? '',
            }
          : undefined,
        bottom: night
          ? {
              accommodation: night,
              rounded: !sameRun,
              isStart: !sameRun,
              color: colorById.get(night.id) ?? '',
            }
          : undefined,
      });
    });
    return cells;
  });

  /**
   * One vertical name label per stay, spanning its day-rows in the hotel lane.
   * Rendered click-through (the colored half-cells beneath handle clicks).
   */
  readonly stayLabels = computed(() => {
    const trip = this.trip();
    const days = this.days();
    if (!trip || !days.length) return [];
    const offset = this.rowOffset();
    return trip.accommodations.map((a) => {
      const s = this.clampIndex(a.checkInDate);
      const e = this.clampIndex(a.checkOutDate);
      return {
        id: a.id,
        name: a.name,
        gridRow: `${Math.min(s, e) + 1 + offset} / ${Math.max(s, e) + 2 + offset}`,
      };
    });
  });

  /**
   * One continuous block per car reservation, spanning its day-rows in the car
   * lane (pickup → return, inclusive). Colour is keyed off storage order so it
   * stays stable and matches the Car Rentals list.
   */
  readonly carSpans = computed(() => {
    const trip = this.trip();
    const days = this.days();
    if (!trip || !days.length) return [];
    const offset = this.rowOffset();
    const colorById = carReservationColors(trip.carReservations);
    return trip.carReservations.map((c) => {
      const s = this.clampIndex(c.pickupDate);
      const e = this.clampIndex(c.dropoffDate);
      return {
        car: c,
        color: colorById.get(c.id) ?? '',
        gridRow: `${Math.min(s, e) + 1 + offset} / ${Math.max(s, e) + 2 + offset}`,
      };
    });
  });

  /**
   * Bucket every activity/transport into its start day, except entries that
   * cross a destination-tz day boundary — those become straddle cards anchored
   * on the separator between the two days. Days adjacent to a straddle get extra
   * padding so the card has clear space above/below the line.
   */
  private readonly layout = computed(() => {
    const trip = this.trip();
    const days = this.days();
    const empty = {
      dayViews: [] as DayView[],
      straddles: [] as StraddleItem[],
      leading: undefined as VirtualDay | undefined,
      trailing: undefined as VirtualDay | undefined,
      offset: 0,
    };
    if (!trip || !days.length) return empty;

    const destZone = trip.destinationTimeZone;
    const firstDate = days[0].date;
    const lastDate = days[days.length - 1].date;

    // Boundary international legs: the inbound flight that arrives INTO the
    // destination from another zone at/before the first day, and the outbound
    // flight that leaves the destination to another zone at/after the last day.
    const leadingLeg = trip.transport
      .filter(
        (t) =>
          t.end &&
          t.start.zone !== destZone &&
          t.end.zone === destZone &&
          this.tz.dayKeyInDestination(t.start, destZone) <= firstDate,
      )
      .sort((a, b) => this.tz.toMillis(a.start) - this.tz.toMillis(b.start))[0];
    const trailingLeg = trip.transport
      .filter(
        (t) =>
          t.end &&
          t.end.zone !== destZone &&
          t.start.zone === destZone &&
          this.tz.dayKeyInDestination(t.end, destZone) >= lastDate,
      )
      .sort((a, b) => this.tz.toMillis(b.end!) - this.tz.toMillis(a.end!))[0];

    const offset = leadingLeg ? 1 : 0;

    const buckets = new Map<string, TimelineEntry[]>();
    for (const day of days) buckets.set(day.date, []);
    const straddles: StraddleItem[] = [];
    const padBottom = new Set<number>();
    const padTop = new Set<number>();

    const handle = (entry: TimelineEntry, end?: ZonedTime) => {
      // Day is judged in each endpoint's OWN zone, so a flight that departs
      // Berlin on the 15th and lands in Tokyo on the 16th counts as crossing.
      const startIdx = this.clampIndex(this.tz.dayKeyLocal(entry.start));
      if (end) {
        const endIdx = this.clampIndex(this.tz.dayKeyLocal(end));
        if (endIdx > startIdx) {
          // Anchor on the separator just below the start day.
          straddles.push({ entry, rowLine: offset + startIdx + 2 });
          padBottom.add(startIdx);
          padTop.add(startIdx + 1);
          return;
        }
      }
      buckets.get(days[startIdx].date)!.push(entry);
    };

    for (const a of trip.activities) {
      handle({ kind: 'activity', activity: a, start: a.start }, a.end);
    }
    for (const t of trip.transport) {
      if (t === leadingLeg || t === trailingLeg) continue; // rendered as boundary straddles
      handle({ kind: 'transport', transport: t, start: t.start }, t.end);
    }

    // Boundary flights become straddles anchored on the virtual-day separators.
    let leading: VirtualDay | undefined;
    if (leadingLeg) {
      straddles.push({
        entry: { kind: 'transport', transport: leadingLeg, start: leadingLeg.start },
        rowLine: offset + 1, // separator between the virtual day (row 1) and day 1
      });
      padTop.add(0); // real day 1 makes room below the card
      const dt = this.tz.toDateTime(leadingLeg.start);
      leading = {
        label: 'Departure Day',
        weekday: dt.toFormat('ccc'),
        dayNum: dt.toFormat('d LLL'),
        city: this.tz.zoneCity(leadingLeg.start.zone),
        padTop: false,
        padBottom: true,
      };
    }

    let trailing: VirtualDay | undefined;
    if (trailingLeg) {
      straddles.push({
        entry: { kind: 'transport', transport: trailingLeg, start: trailingLeg.start },
        rowLine: offset + days.length + 1, // separator between last day and virtual day
      });
      padBottom.add(days.length - 1); // last real day makes room above the card
      const dt = this.tz.toDateTime(trailingLeg.end!);
      trailing = {
        label: 'Return Day',
        weekday: dt.toFormat('ccc'),
        dayNum: dt.toFormat('d LLL'),
        city: this.tz.zoneCity(trailingLeg.end!.zone),
        padTop: true,
        padBottom: false,
      };
    }

    const dayViews: DayView[] = days.map((day, i) => ({
      day,
      entries: (buckets.get(day.date) ?? []).sort(
        (a, b) => this.tz.toMillis(a.start) - this.tz.toMillis(b.start),
      ),
      dropListId: 'day-' + day.date,
      padTop: padTop.has(i),
      padBottom: padBottom.has(i),
    }));

    return { dayViews, straddles, leading, trailing, offset };
  });

  readonly dayViews = computed(() => this.layout().dayViews);
  readonly straddles = computed(() => this.layout().straddles);
  /** Number of virtual rows prepended (0 or 1) — shifts every real-day grid row. */
  readonly rowOffset = computed(() => this.layout().offset);
  readonly leadingDay = computed(() => this.layout().leading);
  readonly trailingDay = computed(() => this.layout().trailing);
  /** Destination city label shown on every real day. */
  readonly destCity = computed(() => {
    const t = this.trip();
    return t ? this.tz.zoneCity(t.destinationTimeZone) : '';
  });

  /** Resolve a date to its 0-based day position, clamped to the trip range. */
  private clampIndex(date: string): number {
    const days = this.days();
    if (!days.length) return 0;
    if (date <= days[0].date) return 0;
    if (date >= days[days.length - 1].date) return days.length - 1;
    return this.dayIndexByDate().get(date) ?? 0;
  }

  // --- Actions (delegated to the shared service) ---------------------------

  addActivity(date: string): void {
    const trip = this.trip();
    if (trip) this.actions.addActivity(trip, date);
  }

  addTransport(date: string): void {
    const trip = this.trip();
    if (trip) this.actions.addTransport(trip, date);
  }

  addAccommodation(date: string): void {
    const trip = this.trip();
    if (trip) this.actions.addAccommodation(trip, date);
  }

  addCarReservation(date: string): void {
    const trip = this.trip();
    if (trip) this.actions.addCarReservation(trip, date);
  }

  openEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (trip) this.actions.openEntry(trip, entry);
  }

  editEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (trip) this.actions.editEntry(trip, entry);
  }

  deleteEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (trip) this.actions.deleteEntry(trip, entry);
  }

  openAccommodation(accommodation: AccommodationDto): void {
    const trip = this.trip();
    if (trip) this.actions.openAccommodation(trip, accommodation);
  }

  openCarReservation(car: CarReservationDto): void {
    const trip = this.trip();
    if (trip) this.actions.openCarReservation(trip, car);
  }

  // --- Lane context menu (Start/End ±1 day) --------------------------------

  /** Invisible element the lane menu anchors to; moved to the cursor on open. */
  private readonly laneMenuAnchor =
    viewChild.required<ElementRef<HTMLElement>>('laneMenuAnchor');
  private readonly laneMenuTrigger = viewChild.required(MatMenuTrigger);

  /** The accommodation/car + side the open lane menu acts on. */
  readonly laneContext = signal<LaneContext | null>(null);

  /** Menu heading word for the active side ("Start" vs "End"). */
  readonly sideLabel = computed(() =>
    this.laneContext()?.side === 'end' ? 'End' : 'Start',
  );

  // A move is blocked only when it would collapse the span. Widening (start −1,
  // end +1) is always allowed; the guarded direction depends on the active side.
  // Accommodation needs at least one night (check-in < check-out); a car may be
  // a single day (pickup <= dropoff), so its bounds are allowed to meet.
  readonly canPlus = computed(() => {
    const c = this.laneContext();
    if (!c) return false;
    if (c.side === 'end') return true; // end +1 always widens
    return c.kind === 'accommodation'
      ? this.addDays(c.accommodation.checkInDate, 1) < c.accommodation.checkOutDate
      : this.addDays(c.car.pickupDate, 1) <= c.car.dropoffDate;
  });
  readonly canMinus = computed(() => {
    const c = this.laneContext();
    if (!c) return false;
    if (c.side === 'start') return true; // start −1 always widens
    return c.kind === 'accommodation'
      ? this.addDays(c.accommodation.checkOutDate, -1) > c.accommodation.checkInDate
      : this.addDays(c.car.dropoffDate, -1) >= c.car.pickupDate;
  });

  onAccommodationContext(e: {
    event: MouseEvent;
    accommodation: AccommodationDto;
    half: 'top' | 'bottom';
    rowIndex: number;
  }): void {
    this.openLaneMenu(e.event, {
      kind: 'accommodation',
      accommodation: e.accommodation,
      side: this.accommodationSide(e.accommodation, e.rowIndex, e.half),
    });
  }

  onCarContext(e: {
    event: MouseEvent;
    reservation: CarReservationDto;
    side: 'start' | 'end';
  }): void {
    this.openLaneMenu(e.event, { kind: 'car', car: e.reservation, side: e.side });
  }

  /**
   * Which side of a stay a clicked hotel cell falls on. The stay's coloured
   * block runs from the check-in day's bottom half to the check-out day's top
   * half; comparing the click's position (day row + half) to the block's centre
   * picks start vs end — correct even on switch days and the stay's middle.
   */
  private accommodationSide(
    accommodation: AccommodationDto,
    rowIndex: number,
    half: 'top' | 'bottom',
  ): 'start' | 'end' {
    const dayIndex = rowIndex - 1 - this.rowOffset();
    const s = this.clampIndex(accommodation.checkInDate);
    const e = this.clampIndex(accommodation.checkOutDate);
    const clickPos = dayIndex + (half === 'top' ? 0.25 : 0.75);
    const center = (s + e + 1) / 2;
    return clickPos < center ? 'start' : 'end';
  }

  private openLaneMenu(event: MouseEvent, target: LaneContext): void {
    // Position the (fixed) anchor at the cursor directly on the DOM node so the
    // overlay reads the right origin synchronously — no change-detection round
    // trip needed before openMenu() (important under zoneless).
    const el = this.laneMenuAnchor().nativeElement;
    el.style.left = `${event.clientX}px`;
    el.style.top = `${event.clientY}px`;
    this.laneContext.set(target);
    this.laneMenuTrigger().openMenu();
  }

  /** Nudge the active side's date (check-in/pickup or check-out/dropoff) by ±1 day. */
  nudge(delta: number): void {
    const c = this.laneContext();
    const trip = this.trip();
    if (!c || !trip) return;
    if (c.kind === 'accommodation') {
      const a = c.accommodation;
      void this.store.upsertAccommodation(
        trip,
        c.side === 'start'
          ? { ...a, checkInDate: this.addDays(a.checkInDate, delta) }
          : { ...a, checkOutDate: this.addDays(a.checkOutDate, delta) },
      );
    } else {
      const car = c.car;
      void this.store.upsertCarReservation(
        trip,
        c.side === 'start'
          ? { ...car, pickupDate: this.addDays(car.pickupDate, delta) }
          : { ...car, dropoffDate: this.addDays(car.dropoffDate, delta) },
      );
    }
    this.snack.open('Dates updated', undefined, { duration: 2000 });
  }

  /** Add N calendar days to a "YYYY-MM-DD" date string. */
  private addDays(date: string, delta: number): string {
    return DateTime.fromISO(date).plus({ days: delta }).toISODate() ?? date;
  }

  // --- Drag and drop between days ------------------------------------------

  async onEntryDropped(event: CdkDragDrop<DayView>): Promise<void> {
    if (event.previousContainer === event.container) return; // same-day, ignore
    const entry = event.item.data as TimelineEntry;
    const targetDate = event.container.data.day.date;
    const trip = this.trip();
    if (!trip) return;

    const currentKey = this.tz.dayKeyLocal(entry.start);
    const deltaDays = Math.round(
      DateTime.fromISO(targetDate).diff(DateTime.fromISO(currentKey), 'days')
        .days,
    );
    if (deltaDays === 0) return;

    const label = entry.activity?.title
      ?? (entry.transport ? transportLabel(entry.transport) : undefined)
      ?? 'item';
    const confirmed = await this.actions.confirm({
      title: 'Move item?',
      message: `Move "${label}" to ${targetDate}? Its time of day is kept.`,
      confirmLabel: 'Move',
    });
    if (!confirmed) return;

    if (entry.activity) {
      await this.store.upsertActivity(trip, {
        ...entry.activity,
        start: this.shift(entry.activity.start, deltaDays),
        end: entry.activity.end
          ? this.shift(entry.activity.end, deltaDays)
          : undefined,
      });
    } else if (entry.transport) {
      await this.store.upsertTransport(trip, {
        ...entry.transport,
        start: this.shift(entry.transport.start, deltaDays),
        end: entry.transport.end
          ? this.shift(entry.transport.end, deltaDays)
          : undefined,
      });
    }
    this.snack.open('Item moved', undefined, { duration: 2000 });
  }

  /** Shift a ZonedTime's wall-clock by N calendar days, keeping time & zone. */
  private shift(zt: { dateTime: string; zone: string }, days: number) {
    const next = DateTime.fromISO(zt.dateTime)
      .plus({ days })
      .toFormat("yyyy-MM-dd'T'HH:mm");
    return { dateTime: next, zone: zt.zone };
  }
}
