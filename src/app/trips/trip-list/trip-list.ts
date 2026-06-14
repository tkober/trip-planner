import { Component, inject, viewChild, ElementRef } from '@angular/core';
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
import {
  TripFormDialog,
  TripFormResult,
} from '../trip-form-dialog/trip-form-dialog';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-trip-list',
  imports: [
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
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly trips = this.store.trips;
  readonly loaded = this.store.loaded;

  private readonly fileInput =
    viewChild<ElementRef<HTMLInputElement>>('fileInput');

  open(trip: TripDto): void {
    void this.router.navigate(['/trips', trip.id]);
  }

  nights(trip: TripDto): number {
    return this.tz.nightsBetween(trip.startDate, trip.endDate);
  }

  dateRange(trip: TripDto): string {
    return `${trip.startDate} → ${trip.endDate}`;
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
