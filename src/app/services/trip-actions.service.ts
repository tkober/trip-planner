import { inject, Injectable } from '@angular/core';
import { DateTime } from 'luxon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AccommodationDto,
  ActivityDto,
  CarReservationDto,
  TimelineEntry,
  TransportDto,
  TripDto,
} from '../models/trip.model';
import { TripStore } from './trip-store';
import { TimeZoneService } from './time-zone.service';
import { ImportExportService } from './import-export.service';
import { ExportService } from './export.service';
import {
  ExportDialog,
  ExportDialogResult,
} from '../trips/export/export-dialog';
import { anonymizeTrip } from '../shared/export/anonymize';
import { tripToMarkdown } from '../shared/export/trip-markdown';
import { downloadBlob, slugify } from '../shared/download';
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
  CarReservationDialog,
  CarReservationDialogData,
} from '../trips/dialogs/car-reservation-dialog';
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
import {
  accommodationDefaultColor,
  carReservationDefaultColor,
} from '../shared/color/color';
import { transportLabel } from '../shared/transport-format';

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
  private readonly exportService = inject(ExportService);
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

  /**
   * Persist an exchange rate (EUR per one foreign unit) for a currency on the
   * trip. Passing a non-positive / non-finite rate clears it. Flows through the
   * whole-trip `saveTrip`, so the cost summary recomputes reactively.
   */
  async setExchangeRate(
    trip: TripDto,
    currency: string,
    eurPerUnit: number,
  ): Promise<void> {
    const code = currency.trim().toUpperCase();
    if (!code) return;
    const rates = { ...(trip.exchangeRates ?? {}) };
    if (Number.isFinite(eurPerUnit) && eurPerUnit > 0) {
      rates[code] = eurPerUnit;
    } else {
      delete rates[code];
    }
    await this.store.saveTrip({ ...trip, exchangeRates: rates });
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

  /**
   * Export the plan as a PNG (timeline), PDF (full plan via native print) or
   * Markdown (text-only, for feeding to an LLM/agent), optionally with sensitive
   * fields blacked out. PNG/PDF render an off-screen `TripExportDocument` through
   * `ExportService`; Markdown is a pure data transform downloaded directly.
   */
  exportPlan(trip: TripDto): void {
    this.dialog
      .open(ExportDialog)
      .afterClosed()
      .subscribe((result?: ExportDialogResult) => {
        if (!result) return;
        const out = result.anonymize
          ? anonymizeTrip(trip, result.anonymize)
          : trip;
        const anon = !!result.anonymize;
        if (result.format === 'png') {
          void this.exportService.exportPng(out, anon).then(() => {
            this.snack.open('Timeline PNG downloaded', undefined, {
              duration: 2500,
            });
          });
        } else if (result.format === 'md') {
          this.exportMarkdown(out, anon);
        } else {
          void this.exportService.exportPdf(out, anon);
        }
      });
  }

  /** Build the Markdown document and trigger a `.md` download. */
  private exportMarkdown(trip: TripDto, anonymized: boolean): void {
    const md = tripToMarkdown(trip, this.tz, anonymized);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${slugify(trip.title) || 'trip'}-plan.md`);
    this.snack.open('Markdown plan downloaded', undefined, { duration: 2500 });
  }

  // --- Accommodation -------------------------------------------------------

  addAccommodation(trip: TripDto, date?: string): void {
    const data: AccommodationDialogData = {
      // Seed a 1-night stay on the clicked day (check-out next morning),
      // else default to the whole trip.
      defaultCheckIn: date ?? trip.startDate,
      defaultCheckOut: date ? this.nextDay(date) : trip.endDate,
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

  // --- Car reservation -----------------------------------------------------

  addCarReservation(trip: TripDto, date?: string): void {
    const data: CarReservationDialogData = {
      // Seed a same-day rental on the clicked day, else the whole trip.
      defaultPickup: date ?? trip.startDate,
      defaultDropoff: date ?? trip.endDate,
      defaultColor: carReservationDefaultColor(trip.carReservations.length),
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(CarReservationDialog, { data })
      .afterClosed()
      .subscribe(async (result?: CarReservationDto) => {
        if (result) await this.store.upsertCarReservation(trip, result);
      });
  }

  openCarReservation(trip: TripDto, car: CarReservationDto): void {
    const data: DetailsDialogData = {
      kind: 'car-reservation',
      homeZone: trip.homeTimeZone,
      destinationZone: trip.destinationTimeZone,
      carReservation: car,
    };
    this.dialog
      .open(DetailsDialog, { data })
      .afterClosed()
      .subscribe((action?: DetailsAction) => {
        if (action === 'edit') this.editCarReservation(trip, car);
        else if (action === 'delete')
          void this.deleteCarReservation(trip, car);
      });
  }

  editCarReservation(trip: TripDto, car: CarReservationDto): void {
    const index = trip.carReservations.findIndex((c) => c.id === car.id);
    const data: CarReservationDialogData = {
      car,
      defaultPickup: trip.startDate,
      defaultDropoff: trip.endDate,
      defaultColor: carReservationDefaultColor(index < 0 ? 0 : index),
      newId: () => this.store.newId(),
    };
    this.dialog
      .open(CarReservationDialog, { data })
      .afterClosed()
      .subscribe(async (result?: CarReservationDto) => {
        if (result) await this.store.upsertCarReservation(trip, result);
      });
  }

  async deleteCarReservation(
    trip: TripDto,
    car: CarReservationDto,
  ): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Delete car rental?',
      message: `"${car.name}" will be removed from this trip.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      await this.store.removeCarReservation(trip, car.id);
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
      .open(TransportDialog, { data, width: 'min(760px, 94vw)', maxWidth: '94vw' })
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
      .open(TransportDialog, { data, width: 'min(760px, 94vw)', maxWidth: '94vw' })
      .afterClosed()
      .subscribe(async (result?: TransportDto) => {
        if (result) await this.store.upsertTransport(trip, result);
      });
  }

  async deleteTransport(trip: TripDto, transport: TransportDto): Promise<void> {
    const confirmed = await this.confirm({
      title: 'Delete transport?',
      message: `"${transportLabel(transport)}" will be removed.`,
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

  /** The calendar day after a "YYYY-MM-DD" date. */
  private nextDay(date: string): string {
    return DateTime.fromISO(date).plus({ days: 1 }).toISODate() ?? date;
  }

  confirm(data: ConfirmDialogData): Promise<boolean> {
    return new Promise((resolve) => {
      this.dialog
        .open(ConfirmDialog, { data })
        .afterClosed()
        .subscribe((r) => resolve(!!r));
    });
  }
}
