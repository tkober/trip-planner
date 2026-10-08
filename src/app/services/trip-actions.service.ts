import { inject, Injectable } from '@angular/core';
import { DateTime } from 'luxon';
import { MatDialog } from '@angular/material/dialog';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import {
  AccommodationDto,
  ActivityDto,
  CarReservationDto,
  TimelineEntry,
  TransportDto,
  TripDto,
} from '../models/trip.model';
import { TripStore } from './trip-store';
import { TimeZoneService, TripDay } from './time-zone.service';
import { ImportExportService } from './import-export.service';
import { ExchangeRateService } from './exchange-rate.service';
import { ExportService } from './export.service';
import {
  ExportDialog,
  ExportDialogResult,
} from '../trips/export/export-dialog';
import { anonymizeTrip } from '../shared/export/anonymize';
import { tripToMarkdown } from '../shared/export/trip-markdown';
import { downloadBlob, slugify } from '../shared/download';
import { formatDay } from '../shared/format/date-format';
import {
  MoveDayDialog,
  MoveDayDialogData,
} from '../trips/timeline/move-day-dialog';
import { deltaDaysBetween, shiftZonedTime } from '../trips/timeline/entry-move';
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
import { DetailsSheet } from '../trips/dialogs/details-sheet';
import {
  accommodationColors,
  accommodationDefaultColor,
  activityColor,
  carReservationColors,
  carReservationDefaultColor,
  transportColor,
} from '../shared/color/color';
import { transportLabel } from '../shared/transport-format';
import { EditModeService } from './edit-mode.service';

/**
 * Focus the details dialog/sheet's title on open. The default focuses the
 * first link, which on a phone sits below the fold and scrolls past the
 * title and the booking status.
 */
const DETAILS_AUTO_FOCUS = 'first-heading';

/** The mobile details sheet's panel class — see the global rule in styles.scss. */
const DETAILS_SHEET_PANEL_CLASS = 'details-sheet-panel';

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
  private readonly exchangeRates = inject(ExchangeRateService);
  private readonly exportService = inject(ExportService);
  private readonly dialog = inject(MatDialog);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly editMode = inject(EditModeService);
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
    const updatedAt = { ...(trip.exchangeRatesUpdatedAt ?? {}) };
    if (Number.isFinite(eurPerUnit) && eurPerUnit > 0) {
      rates[code] = eurPerUnit;
      updatedAt[code] = new Date().toISOString();
    } else {
      delete rates[code];
      delete updatedAt[code];
    }
    await this.store.saveTrip({
      ...trip,
      exchangeRates: rates,
      exchangeRatesUpdatedAt: updatedAt,
    });
  }

  /**
   * Merge several EUR-per-unit rates (+ their timestamps) into the trip in one
   * `saveTrip` call — looping `setExchangeRate` would each save from the same
   * stale `trip` and overwrite one another's rates.
   */
  async setExchangeRates(
    trip: TripDto,
    eurPerUnit: Record<string, number>,
  ): Promise<void> {
    const codes = Object.keys(eurPerUnit);
    if (!codes.length) return;
    const rates = { ...(trip.exchangeRates ?? {}) };
    const updatedAt = { ...(trip.exchangeRatesUpdatedAt ?? {}) };
    const now = new Date().toISOString();
    for (const code of codes) {
      rates[code] = eurPerUnit[code];
      updatedAt[code] = now;
    }
    await this.store.saveTrip({
      ...trip,
      exchangeRates: rates,
      exchangeRatesUpdatedAt: updatedAt,
    });
  }

  /**
   * Fetch current EUR rates for `codes` online and persist them. Shows a
   * snackbar summarizing the outcome: full success, partial (some codes have
   * no online rate — the rest are still saved), or a fetch failure.
   */
  async refreshExchangeRates(trip: TripDto, codes: string[]): Promise<void> {
    let fetched: Record<string, number>;
    try {
      fetched = await this.exchangeRates.fetchEurRates(codes);
    } catch {
      this.snack.open("Couldn't fetch exchange rates", undefined, {
        duration: 3000,
      });
      return;
    }

    const requested = [
      ...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean)),
    ].filter((c) => c !== 'EUR');
    const missing = requested.filter((c) => !(c in fetched));

    if (Object.keys(fetched).length) {
      await this.setExchangeRates(trip, fetched);
    }

    if (missing.length) {
      this.snack.open(`No online rate for ${missing.join(', ')}`, undefined, {
        duration: 3500,
      });
    } else {
      this.snack.open('Exchange rates updated', undefined, { duration: 2000 });
    }
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

  /**
   * Open the shared details content (R8): a `MatDialog` on desktop, a
   * `MatBottomSheet` on phones (`EditModeService.isMobile()`), both resolving
   * to the same `DetailsAction | undefined`. Callers subscribe exactly as
   * they did when this always opened `DetailsDialog`.
   */
  private openDetails(data: DetailsDialogData): Observable<DetailsAction | undefined> {
    if (this.editMode.isMobile()) {
      return this.bottomSheet
        .open(DetailsSheet, {
          data,
          autoFocus: DETAILS_AUTO_FOCUS,
          panelClass: DETAILS_SHEET_PANEL_CLASS,
          maxHeight: '85vh',
        })
        .afterDismissed();
    }
    return this.dialog
      .open(DetailsDialog, { data, autoFocus: DETAILS_AUTO_FOCUS })
      .afterClosed();
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
      accent: accommodationColors(trip.accommodations).get(accommodation.id) ?? '',
      accommodation,
      tripId: trip.id,
    };
    this.openDetails(data).subscribe((action?: DetailsAction) => {
      if (action === 'edit') this.editAccommodation(trip, accommodation);
      else if (action === 'delete') void this.deleteAccommodation(trip, accommodation);
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
      accent: carReservationColors(trip.carReservations).get(car.id) ?? '',
      carReservation: car,
      tripId: trip.id,
    };
    this.openDetails(data).subscribe((action?: DetailsAction) => {
      if (action === 'edit') this.editCarReservation(trip, car);
      else if (action === 'delete') void this.deleteCarReservation(trip, car);
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
    const accent = entry.activity
      ? activityColor(entry.activity)
      : entry.transport
        ? transportColor(entry.transport)
        : '';
    const data: DetailsDialogData = {
      kind: entry.kind,
      homeZone: trip.homeTimeZone,
      destinationZone: trip.destinationTimeZone,
      accent,
      activity: entry.activity,
      transport: entry.transport,
    };
    this.openDetails(data).subscribe((action?: DetailsAction) => {
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

  /**
   * "Move to another day…" (the List's kebab, and Columns, D3 #47): pick a
   * day from `days` (the caller's own real days, destination tz) and shift
   * the entry there, keeping its time of day. Extracted out of `TimelineView`
   * (which also calls this for its drag-drop) so Columns can reuse the same
   * dialog/confirm/shift flow instead of its own copy.
   */
  moveEntry(trip: TripDto, entry: TimelineEntry, days: TripDay[]): void {
    const data: MoveDayDialogData = {
      days,
      currentDate: this.tz.dayKeyLocal(entry.start),
    };
    this.dialog
      .open(MoveDayDialog, { data })
      .afterClosed()
      .subscribe(async (targetDate?: string) => {
        if (targetDate) await this.moveEntryToDay(trip, entry, targetDate);
      });
  }

  /**
   * Shift an activity/transport entry to `targetDate` (its destination-tz
   * day), keeping its time of day. Shared by drag-drop
   * (`TimelineView.onEntryDropped`) and `moveEntry` above.
   */
  async moveEntryToDay(
    trip: TripDto,
    entry: TimelineEntry,
    targetDate: string,
  ): Promise<void> {
    const currentKey = this.tz.dayKeyLocal(entry.start);
    const deltaDays = deltaDaysBetween(currentKey, targetDate);
    if (deltaDays === 0) return;

    const label =
      entry.activity?.title ??
      (entry.transport ? transportLabel(entry.transport) : undefined) ??
      'item';
    const confirmed = await this.confirm({
      title: 'Move item?',
      message: `Move "${label}" to ${formatDay(targetDate)}? Its time of day is kept.`,
      confirmLabel: 'Move',
    });
    if (!confirmed) return;

    if (entry.activity) {
      await this.store.upsertActivity(trip, {
        ...entry.activity,
        start: shiftZonedTime(entry.activity.start, deltaDays),
        end: entry.activity.end
          ? shiftZonedTime(entry.activity.end, deltaDays)
          : undefined,
      });
    } else if (entry.transport) {
      await this.store.upsertTransport(trip, {
        ...entry.transport,
        start: shiftZonedTime(entry.transport.start, deltaDays),
        end: entry.transport.end
          ? shiftZonedTime(entry.transport.end, deltaDays)
          : undefined,
      });
    }
    this.snack.open('Item moved', undefined, { duration: 2000 });
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
