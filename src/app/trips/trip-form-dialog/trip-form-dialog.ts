import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TripDto } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { TimezoneSelect } from '../../shared/timezone-select/timezone-select';
import { DateField } from '../../shared/date-field/date-field';

export interface TripFormData {
  /** Existing trip when editing; undefined when creating. */
  trip?: TripDto;
}

export interface TripFormResult {
  title: string;
  startDate: string;
  endDate: string;
  homeTimeZone: string;
  destinationTimeZone: string;
  description?: string;
}

@Component({
  selector: 'app-trip-form-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TimezoneSelect,
    DateField,
  ],
  templateUrl: './trip-form-dialog.html',
  styleUrl: './trip-form-dialog.scss',
})
export class TripFormDialog {
  private readonly data = inject<TripFormData>(MAT_DIALOG_DATA);
  private readonly tz = inject(TimeZoneService);
  readonly dialogRef = inject(MatDialogRef<TripFormDialog, TripFormResult>);

  readonly isEdit = !!this.data.trip;

  readonly title = signal(this.data.trip?.title ?? '');
  readonly startDate = signal(this.data.trip?.startDate ?? '');
  readonly endDate = signal(this.data.trip?.endDate ?? '');
  readonly homeTimeZone = signal(
    this.data.trip?.homeTimeZone ?? this.tz.deviceZone(),
  );
  readonly destinationTimeZone = signal(
    this.data.trip?.destinationTimeZone ?? 'Asia/Tokyo',
  );
  readonly description = signal(this.data.trip?.description ?? '');

  readonly error = signal('');

  save(): void {
    const title = this.title().trim();
    if (!title) {
      this.error.set('Please enter a title.');
      return;
    }
    if (!this.startDate() || !this.endDate()) {
      this.error.set('Please choose a start and end date.');
      return;
    }
    if (this.endDate() < this.startDate()) {
      this.error.set('End date must be on or after the start date.');
      return;
    }
    if (!this.homeTimeZone() || !this.destinationTimeZone()) {
      this.error.set('Please choose both time zones.');
      return;
    }
    this.dialogRef.close({
      title,
      startDate: this.startDate(),
      endDate: this.endDate(),
      homeTimeZone: this.homeTimeZone(),
      destinationTimeZone: this.destinationTimeZone(),
      description: this.description().trim() || undefined,
    });
  }
}
