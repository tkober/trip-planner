import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { DateTime } from 'luxon';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AccommodationDto,
  ActivityDto,
  TimelineEntry,
  TransportDto,
  TripDto,
  ZonedTime,
} from '../../models/trip.model';
import { TripStoreService } from '../../services/trip-store.service';
import { TimeZoneService } from '../../services/time-zone.service';
import { ImportExportService } from '../../services/import-export.service';
import {
  TripFormDialog,
  TripFormResult,
} from '../trip-form-dialog/trip-form-dialog';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../shared/confirm-dialog/confirm-dialog';
import {
  AccommodationDialog,
  AccommodationDialogData,
} from '../dialogs/accommodation-dialog';
import { ActivityDialog, ActivityDialogData } from '../dialogs/activity-dialog';
import {
  TransportDialog,
  TransportDialogData,
} from '../dialogs/transport-dialog';
import {
  DetailsAction,
  DetailsDialog,
  DetailsDialogData,
} from '../dialogs/details-dialog';
import { DaySection, DayView } from './day-section';
import { FlightCard } from './flight-card';
import { HotelCell, HotelDayCell } from './hotel-cell';
import { StraddleCard } from './straddle-card';

/** An entry that crosses a day boundary, anchored on the separator line. */
interface StraddleItem {
  entry: TimelineEntry;
  /** Grid line of the separator between the start and end day. */
  rowLine: number;
}

@Component({
  selector: 'app-timeline',
  imports: [
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    DaySection,
    FlightCard,
    HotelCell,
    StraddleCard,
  ],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
})
export class Timeline {
  /** Route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly store = inject(TripStoreService);
  private readonly tz = inject(TimeZoneService);
  private readonly importExport = inject(ImportExportService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly loaded = this.store.loaded;
  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
  );

  readonly days = computed(() => {
    const trip = this.trip();
    return trip ? this.tz.enumerateDays(trip) : [];
  });

  /** Chronologically first and last flights, surfaced as prominent cards. */
  readonly flights = computed(() => {
    const trip = this.trip();
    if (!trip) return [] as TransportDto[];
    return trip.transport
      .filter((t) => t.mode === 'flight')
      .slice()
      .sort((a, b) => this.tz.toMillis(a.start) - this.tz.toMillis(b.start));
  });

  readonly departureFlight = computed<TransportDto | undefined>(
    () => this.flights()[0],
  );
  readonly returnFlight = computed<TransportDto | undefined>(() => {
    const f = this.flights();
    return f.length > 1 ? f[f.length - 1] : undefined;
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

    const colorIndexById = new Map<string, number>();
    trip.accommodations.forEach((a, i) => colorIndexById.set(a.id, i % 6));

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
              colorIndex: colorIndexById.get(morning.id) ?? 0,
            }
          : undefined,
        bottom: night
          ? {
              accommodation: night,
              rounded: !sameRun,
              isStart: !sameRun,
              colorIndex: colorIndexById.get(night.id) ?? 0,
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

  // --- Navigation / trip-level actions -------------------------------------

  back(): void {
    void this.router.navigate(['/trips']);
  }

  editTrip(): void {
    const trip = this.trip();
    if (!trip) return;
    const ref = this.dialog.open(TripFormDialog, { data: { trip } });
    ref.afterClosed().subscribe(async (result: TripFormResult | undefined) => {
      if (!result) return;
      await this.saveTripEdits(trip, result);
    });
  }

  private async saveTripEdits(
    trip: TripDto,
    result: TripFormResult,
  ): Promise<void> {
    const orphans = this.countOrphans(trip, result.startDate, result.endDate);
    if (orphans > 0) {
      const confirmed = await this.confirm({
        title: 'Shorten trip?',
        message: `${orphans} item(s) start outside the new dates. They will be kept but pinned to the nearest day. Continue?`,
        confirmLabel: 'Update trip',
      });
      if (!confirmed) return;
    }
    await this.store.saveTrip({ ...trip, ...result });
    this.snack.open('Trip updated', undefined, { duration: 2000 });
  }

  private countOrphans(trip: TripDto, start: string, end: string): number {
    const inRange = (zt: { dateTime: string; zone: string }) => {
      const key = this.tz.dayKeyLocal(zt);
      return key >= start && key <= end;
    };
    let n = 0;
    for (const a of trip.activities) if (!inRange(a.start)) n++;
    for (const t of trip.transport) if (!inRange(t.start)) n++;
    return n;
  }

  exportTrip(): void {
    const trip = this.trip();
    if (trip) this.importExport.exportTrip(trip);
  }

  // --- Accommodation actions ----------------------------------------------

  addAccommodation(): void {
    const trip = this.trip();
    if (!trip) return;
    const data: AccommodationDialogData = {
      defaultCheckIn: trip.startDate,
      defaultCheckOut: trip.endDate,
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(AccommodationDialog, { data })
      .afterClosed()
      .subscribe(async (result?: AccommodationDto) => {
        if (result) await this.store.upsertAccommodation(this.trip()!, result);
      });
  }

  openAccommodation(accommodation: AccommodationDto): void {
    const trip = this.trip();
    if (!trip) return;
    const data: DetailsDialogData = {
      kind: 'accommodation',
      homeZone: trip.homeTimeZone,
      destinationZone: trip.destinationTimeZone,
      accommodation,
    };
    this.dialog
      .open(DetailsDialog, { data })
      .afterClosed()
      .subscribe((action?: DetailsAction) => {
        if (action === 'edit') this.editAccommodation(accommodation);
        else if (action === 'delete') this.deleteAccommodation(accommodation);
      });
  }

  editAccommodation(accommodation: AccommodationDto): void {
    const trip = this.trip();
    if (!trip) return;
    const data: AccommodationDialogData = {
      accommodation,
      defaultCheckIn: trip.startDate,
      defaultCheckOut: trip.endDate,
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(AccommodationDialog, { data })
      .afterClosed()
      .subscribe(async (result?: AccommodationDto) => {
        if (result) await this.store.upsertAccommodation(this.trip()!, result);
      });
  }

  async deleteAccommodation(accommodation: AccommodationDto): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Delete accommodation?',
      message: `"${accommodation.name}" will be removed from this trip.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      await this.store.removeAccommodation(this.trip()!, accommodation.id);
    }
  }

  // --- Activity actions ----------------------------------------------------

  addActivity(date: string): void {
    const trip = this.trip();
    if (!trip) return;
    const data: ActivityDialogData = {
      defaultZone: trip.destinationTimeZone,
      defaultDateTime: `${date}T09:00`,
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(ActivityDialog, { data })
      .afterClosed()
      .subscribe(async (result?: ActivityDto) => {
        if (result) await this.store.upsertActivity(this.trip()!, result);
      });
  }

  editActivity(activity: ActivityDto): void {
    const trip = this.trip();
    if (!trip) return;
    const data: ActivityDialogData = {
      activity,
      defaultZone: trip.destinationTimeZone,
      defaultDateTime: activity.start.dateTime,
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(ActivityDialog, { data })
      .afterClosed()
      .subscribe(async (result?: ActivityDto) => {
        if (result) await this.store.upsertActivity(this.trip()!, result);
      });
  }

  async deleteActivity(activity: ActivityDto): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Delete activity?',
      message: `"${activity.title}" will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) await this.store.removeActivity(this.trip()!, activity.id);
  }

  // --- Transport actions ---------------------------------------------------

  addTransport(date: string): void {
    const trip = this.trip();
    if (!trip) return;
    const data: TransportDialogData = {
      homeZone: trip.homeTimeZone,
      destinationZone: trip.destinationTimeZone,
      defaultDateTime: `${date}T10:00`,
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(TransportDialog, { data })
      .afterClosed()
      .subscribe(async (result?: TransportDto) => {
        if (result) await this.store.upsertTransport(this.trip()!, result);
      });
  }

  editTransport(transport: TransportDto): void {
    const trip = this.trip();
    if (!trip) return;
    const data: TransportDialogData = {
      transport,
      homeZone: trip.homeTimeZone,
      destinationZone: trip.destinationTimeZone,
      defaultDateTime: transport.start.dateTime,
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(TransportDialog, { data })
      .afterClosed()
      .subscribe(async (result?: TransportDto) => {
        if (result) await this.store.upsertTransport(this.trip()!, result);
      });
  }

  async deleteTransport(transport: TransportDto): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Delete transport?',
      message: `"${transport.title}" will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) await this.store.removeTransport(this.trip()!, transport.id);
  }

  // --- Entry click (open details) ------------------------------------------

  openEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (!trip) return;
    const data: DetailsDialogData = {
      kind: entry.kind,
      homeZone: trip.homeTimeZone,
      destinationZone: trip.destinationTimeZone,
      activity: entry.activity,
      transport: entry.transport,
    };
    this.dialog
      .open(DetailsDialog, { data })
      .afterClosed()
      .subscribe((action?: DetailsAction) => {
        if (action === 'edit') {
          if (entry.activity) this.editActivity(entry.activity);
          else if (entry.transport) this.editTransport(entry.transport);
        } else if (action === 'delete') {
          if (entry.activity) this.deleteActivity(entry.activity);
          else if (entry.transport) this.deleteTransport(entry.transport);
        }
      });
  }

  openFlight(transport: TransportDto): void {
    this.openEntry({ kind: 'transport', transport, start: transport.start });
  }

  /** Direct edit from an entry's ellipsis menu. */
  editEntry(entry: TimelineEntry): void {
    if (entry.activity) this.editActivity(entry.activity);
    else if (entry.transport) this.editTransport(entry.transport);
  }

  /** Direct delete from an entry's ellipsis menu. */
  deleteEntry(entry: TimelineEntry): void {
    if (entry.activity) void this.deleteActivity(entry.activity);
    else if (entry.transport) void this.deleteTransport(entry.transport);
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
    const confirmed = await this.confirm({
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

  // --- Helpers -------------------------------------------------------------

  private confirm(data: ConfirmDialogData): Promise<boolean> {
    return new Promise((resolve) => {
      this.dialog
        .open(ConfirmDialog, { data })
        .afterClosed()
        .subscribe((r) => resolve(!!r));
    });
  }
}
