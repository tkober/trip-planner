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
import { DaySection, DayView, AccommodationSegment } from './day-section';
import { FlightCard } from './flight-card';

@Component({
  selector: 'app-timeline',
  imports: [
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    DaySection,
    FlightCard,
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

  /** One view-model per day: its entries (sorted) and accommodation segments. */
  readonly dayViews = computed<DayView[]>(() => {
    const trip = this.trip();
    const days = this.days();
    if (!trip || !days.length) return [];
    const destZone = trip.destinationTimeZone;
    const firstDate = days[0].date;
    const lastDate = days[days.length - 1].date;

    // Bucket activities + transport into destination-tz days (clamped to range).
    const buckets = new Map<string, TimelineEntry[]>();
    for (const day of days) buckets.set(day.date, []);

    const place = (entry: TimelineEntry) => {
      let key = this.tz.dayKeyInDestination(entry.start, destZone);
      if (key < firstDate) key = firstDate;
      if (key > lastDate) key = lastDate;
      buckets.get(key)!.push(entry);
    };
    for (const activity of trip.activities) {
      place({ kind: 'activity', activity, start: activity.start });
    }
    for (const transport of trip.transport) {
      place({ kind: 'transport', transport, start: transport.start });
    }

    return days.map((day) => {
      const entries = (buckets.get(day.date) ?? []).sort(
        (a, b) => this.tz.toMillis(a.start) - this.tz.toMillis(b.start),
      );
      return {
        day,
        entries,
        accommodations: this.accommodationSegments(trip, day.date),
        dropListId: 'day-' + day.date,
      };
    });
  });

  // --- Accommodation segment computation -----------------------------------

  private accommodationSegments(
    trip: TripDto,
    date: string,
  ): AccommodationSegment[] {
    const segments: AccommodationSegment[] = [];
    for (const a of trip.accommodations) {
      if (date < a.checkInDate || date > a.checkOutDate) continue;
      if (a.checkInDate === a.checkOutDate) {
        segments.push({ accommodation: a, segment: 'full' });
      } else if (date === a.checkInDate) {
        segments.push({ accommodation: a, segment: 'checkin' });
      } else if (date === a.checkOutDate) {
        segments.push({ accommodation: a, segment: 'checkout' });
      } else {
        segments.push({ accommodation: a, segment: 'full' });
      }
    }
    // Render check-outs above check-ins so a switch day reads top→bottom.
    const order = { checkout: 0, full: 1, checkin: 2 };
    return segments.sort((x, y) => order[x.segment] - order[y.segment]);
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
    const destZone = trip.destinationTimeZone;
    const inRange = (zt: { dateTime: string; zone: string }) => {
      const key = this.tz.dayKeyInDestination(zt, destZone);
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

    const currentKey = this.tz.dayKeyInDestination(
      entry.start,
      trip.destinationTimeZone,
    );
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
