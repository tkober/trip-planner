import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AccommodationDto,
  ActivityDto,
  TimelineEntry,
  TransportDto,
  TripDto,
} from '../models/trip.model';
import { TripStore } from './trip-store';
import { TimeZoneService } from './time-zone.service';
import { ImportExportService } from './import-export.service';
import {
  TripFormDialog,
  TripFormResult,
} from '../trips/trip-form-dialog/trip-form-dialog';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../shared/confirm-dialog/confirm-dialog';
import {
  AccommodationDialog,
  AccommodationDialogData,
} from '../trips/dialogs/accommodation-dialog';
import {
  ActivityDialog,
  ActivityDialogData,
} from '../trips/dialogs/activity-dialog';
import {
  TransportDialog,
  TransportDialogData,
} from '../trips/dialogs/transport-dialog';
import {
  DetailsAction,
  DetailsDialog,
  DetailsDialogData,
} from '../trips/dialogs/details-dialog';
import { accommodationDefaultColor } from '../shared/color/color';

/**
 * All dialog-driven trip mutations (edit trip, add/edit/delete + open-details for
 * accommodation/activity/transport) live here so every view — the timeline grid,
 * the overview, and the accommodation/transport lists — shares one implementation.
 *
 * Each method takes the current trip explicitly; mutations go through the store,
 * which re-saves the whole trip and refreshes the `trips` signal, so any view
 * deriving its trip via `computed` updates reactively.
 */
@Injectable({ providedIn: 'root' })
export class TripActionsService {
  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly importExport = inject(ImportExportService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  // --- Trip-level ----------------------------------------------------------

  editTrip(trip: TripDto): void {
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

  exportTrip(trip: TripDto): void {
    this.importExport.exportTrip(trip);
  }

  // --- Accommodation -------------------------------------------------------

  addAccommodation(trip: TripDto): void {
    const data: AccommodationDialogData = {
      defaultCheckIn: trip.startDate,
      defaultCheckOut: trip.endDate,
      defaultColor: accommodationDefaultColor(trip.accommodations.length),
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(AccommodationDialog, { data })
      .afterClosed()
      .subscribe(async (result?: AccommodationDto) => {
        if (result) await this.store.upsertAccommodation(trip, result);
      });
  }

  openAccommodation(trip: TripDto, accommodation: AccommodationDto): void {
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
        if (action === 'edit') this.editAccommodation(trip, accommodation);
        else if (action === 'delete')
          void this.deleteAccommodation(trip, accommodation);
      });
  }

  editAccommodation(trip: TripDto, accommodation: AccommodationDto): void {
    const index = trip.accommodations.findIndex((a) => a.id === accommodation.id);
    const data: AccommodationDialogData = {
      accommodation,
      defaultCheckIn: trip.startDate,
      defaultCheckOut: trip.endDate,
      defaultColor: accommodationDefaultColor(index < 0 ? 0 : index),
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(AccommodationDialog, { data })
      .afterClosed()
      .subscribe(async (result?: AccommodationDto) => {
        if (result) await this.store.upsertAccommodation(trip, result);
      });
  }

  async deleteAccommodation(
    trip: TripDto,
    accommodation: AccommodationDto,
  ): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Delete accommodation?',
      message: `"${accommodation.name}" will be removed from this trip.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      await this.store.removeAccommodation(trip, accommodation.id);
    }
  }

  // --- Activity ------------------------------------------------------------

  addActivity(trip: TripDto, date: string): void {
    const data: ActivityDialogData = {
      defaultZone: trip.destinationTimeZone,
      defaultDateTime: `${date}T09:00`,
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(ActivityDialog, { data })
      .afterClosed()
      .subscribe(async (result?: ActivityDto) => {
        if (result) await this.store.upsertActivity(trip, result);
      });
  }

  editActivity(trip: TripDto, activity: ActivityDto): void {
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
        if (result) await this.store.upsertActivity(trip, result);
      });
  }

  async deleteActivity(trip: TripDto, activity: ActivityDto): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Delete activity?',
      message: `"${activity.title}" will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) await this.store.removeActivity(trip, activity.id);
  }

  // --- Transport -----------------------------------------------------------

  addTransport(trip: TripDto, date: string): void {
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
        if (result) await this.store.upsertTransport(trip, result);
      });
  }

  editTransport(trip: TripDto, transport: TransportDto): void {
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
        if (result) await this.store.upsertTransport(trip, result);
      });
  }

  async deleteTransport(trip: TripDto, transport: TransportDto): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Delete transport?',
      message: `"${transport.title}" will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) await this.store.removeTransport(trip, transport.id);
  }

  // --- Generic timeline entry (activity | transport) -----------------------

  openEntry(trip: TripDto, entry: TimelineEntry): void {
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
        if (action === 'edit') this.editEntry(trip, entry);
        else if (action === 'delete') this.deleteEntry(trip, entry);
      });
  }

  openFlight(trip: TripDto, transport: TransportDto): void {
    this.openEntry(trip, {
      kind: 'transport',
      transport,
      start: transport.start,
    });
  }

  editEntry(trip: TripDto, entry: TimelineEntry): void {
    if (entry.activity) this.editActivity(trip, entry.activity);
    else if (entry.transport) this.editTransport(trip, entry.transport);
  }

  deleteEntry(trip: TripDto, entry: TimelineEntry): void {
    if (entry.activity) void this.deleteActivity(trip, entry.activity);
    else if (entry.transport) void this.deleteTransport(trip, entry.transport);
  }

  // --- Helpers -------------------------------------------------------------

  confirm(data: ConfirmDialogData): Promise<boolean> {
    return new Promise((resolve) => {
      this.dialog
        .open(ConfirmDialog, { data })
        .afterClosed()
        .subscribe((r) => resolve(!!r));
    });
  }
}
