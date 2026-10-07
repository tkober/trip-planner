import { Component, computed, inject, viewChild, ElementRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { ImportExportService } from '../../services/import-export.service';
import { TimeZoneService } from '../../services/time-zone.service';
import { ClockService } from '../../services/clock.service';
import { formatRange, zoneCity } from '../../shared/format/date-format';
import { tripContextLabel } from '../../shared/format/trip-context';
import { classifyTrips } from '../../shared/format/trip-status';
import { nextEntryToday, NextEntryInfo } from '../../shared/format/next-entry';
import {
  TripFormDialog,
  TripFormResult,
} from '../trip-form-dialog/trip-form-dialog';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../shared/confirm-dialog/confirm-dialog';

/** The hero card's trip, plus which classification put it there. */
interface HeroInfo {
  trip: TripDto;
  kind: 'current' | 'upcoming';
}

@Component({
  selector: 'app-trip-list',
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatMenuModule,
  ],
  templateUrl: './trip-list.html',
  styleUrl: './trip-list.scss',
})
export class TripList {
  private readonly store = inject(TripStore);
  private readonly importExport = inject(ImportExportService);
  private readonly tz = inject(TimeZoneService);
  private readonly clock = inject(ClockService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly trips = this.store.trips;
  readonly loaded = this.store.loaded;

  private readonly fileInput =
    viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Current/upcoming/past split, re-derived whenever the clock ticks. */
  private readonly groups = computed(() =>
    classifyTrips(this.trips(), this.clock.now()),
  );

  /** The running trip (started last, if several) or else the soonest upcoming. */
  readonly hero = computed<HeroInfo | undefined>(() => {
    const g = this.groups();
    if (g.current.length) return { trip: g.current[0], kind: 'current' };
    if (g.upcoming.length) return { trip: g.upcoming[0], kind: 'upcoming' };
    return undefined;
  });

  /** "Now travelling" / "Next trip" eyebrow label for the hero card. */
  readonly heroEyebrow = computed(() => {
    const h = this.hero();
    return h?.kind === 'current' ? 'Now travelling' : 'Next trip';
  });

  /** "Day 7 of 16 · Thu, 9 Apr" / "Starts in 12 days", for the hero card. */
  readonly heroContextLabel = computed(() => {
    const h = this.hero();
    return h ? tripContextLabel(h.trip, this.clock.now()) : '';
  });

  /** The next activity/transport today, only while a trip is running. */
  readonly heroNextEntry = computed<NextEntryInfo | undefined>(() => {
    const h = this.hero();
    if (!h || h.kind !== 'current') return undefined;
    return nextEntryToday(h.trip, this.clock.now());
  });

  /**
   * The compact-card list below the hero: every other current trip (an
   * uncommon edge case — several trips running at once), then upcoming
   * trips, with the hero itself removed from whichever group it came from.
   */
  readonly restTrips = computed(() => {
    const g = this.groups();
    const h = this.hero();
    const current = h?.kind === 'current' ? g.current.slice(1) : g.current;
    const upcoming = h?.kind === 'upcoming' ? g.upcoming.slice(1) : g.upcoming;
    return [...current, ...upcoming];
  });

  /** Past trips, most-recently-ended first — rendered muted, at the end. */
  readonly pastTrips = computed(() => this.groups().past);

  open(trip: TripDto): void {
    void this.router.navigate(['/trips', trip.id]);
  }

  nights(trip: TripDto): number {
    return this.tz.nightsBetween(trip.startDate, trip.endDate);
  }

  dateRange(trip: TripDto): string {
    return formatRange(trip.startDate, trip.endDate);
  }

  /** City label for the destination-timezone chip, e.g. "Tokyo". */
  destinationCity(trip: TripDto): string {
    return zoneCity(trip.destinationTimeZone);
  }

  createTrip(): void {
    const ref = this.dialog.open(TripFormDialog, { data: {} });
    ref.afterClosed().subscribe(async (result: TripFormResult | undefined) => {
      if (!result) return;
      const trip = await this.store.createTrip(result);
      this.snack.open('Trip created', undefined, { duration: 2000 });
      this.open(trip);
    });
  }

  triggerImport(): void {
    this.fileInput()?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const trip = await this.importExport.importFile(file);
      await this.store.saveTrip(trip);
      this.snack.open(`Imported "${trip.title}"`, undefined, { duration: 2500 });
    } catch (err) {
      this.snack.open(
        err instanceof Error ? err.message : 'Import failed',
        'Dismiss',
        { duration: 5000 },
      );
    }
  }

  export(trip: TripDto): void {
    this.importExport.exportTrip(trip);
  }

  confirmDelete(trip: TripDto): void {
    const data: ConfirmDialogData = {
      title: 'Delete trip?',
      message: `"${trip.title}" and all its days, accommodations, car rentals, activities and transport will be permanently deleted.`,
      confirmLabel: 'Delete',
      destructive: true,
    };
    const ref = this.dialog.open(ConfirmDialog, { data });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await this.store.deleteTrip(trip.id);
        this.snack.open('Trip deleted', undefined, { duration: 2000 });
      }
    });
  }
}
