import { Component, computed, inject, input } from '@angular/core';
import { DateTime } from 'luxon';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AccommodationDto,
  TimelineEntry,
  TripDto,
  ZonedTime,
} from '../../models/trip.model';
import { TripStoreService } from '../../services/trip-store.service';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { DaySection, DayView } from './day-section';
import { HotelCell, HotelDayCell } from './hotel-cell';
import { StraddleCard } from './straddle-card';
import { accommodationColors } from '../../shared/color/color';

/** An entry that crosses a day boundary, anchored on the separator line. */
interface StraddleItem {
  entry: TimelineEntry;
  /** Grid line of the separator between the start and end day. */
  rowLine: number;
}

/** The day-by-day timeline grid (one of the trip-page views). */
@Component({
  selector: 'app-timeline-view',
  imports: [DragDropModule, MatButtonModule, MatIconModule, DaySection, HotelCell, StraddleCard],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
})
export class TimelineView {
  /** Parent route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly store = inject(TripStoreService);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);
  private readonly snack = inject(MatSnackBar);

  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
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

  /** The timeline grid columns: [day marker] [hotel lane] [content]. */
  readonly gridTemplateColumns = computed(() => {
    const marker = 'clamp(72px, 16vw, 96px)';
    const hotel = this.hasAccommodations() ? 'clamp(40px, 9vw, 52px)' : '0px';
    return `${marker} ${hotel} minmax(0, 1fr)`;
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
        rowIndex: i + 1,
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
    return trip.accommodations.map((a) => {
      const s = this.clampIndex(a.checkInDate);
      const e = this.clampIndex(a.checkOutDate);
      return {
        id: a.id,
        name: a.name,
        gridRow: `${Math.min(s, e) + 1} / ${Math.max(s, e) + 2}`,
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
    if (!trip || !days.length) {
      return { dayViews: [] as DayView[], straddles: [] as StraddleItem[] };
    }
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
          straddles.push({ entry, rowLine: startIdx + 2 });
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
      handle({ kind: 'transport', transport: t, start: t.start }, t.end);
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

    return { dayViews, straddles };
  });

  readonly dayViews = computed(() => this.layout().dayViews);
  readonly straddles = computed(() => this.layout().straddles);

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

    const label = entry.activity?.title ?? entry.transport?.title ?? 'item';
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
