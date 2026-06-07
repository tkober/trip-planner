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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ActivityDto, ZonedTime } from '../../models/trip.model';
import { ZonedTimeField } from '../../shared/zoned-time-field/zoned-time-field';

export interface ActivityDialogData {
  activity?: ActivityDto;
  /** Destination zone + a sensible default start ("YYYY-MM-DDTHH:mm"). */
  defaultZone: string;
  defaultDateTime: string;
  newId: () => string;
}

@Component({
  selector: 'app-activity-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    ZonedTimeField,
  ],
  templateUrl: './activity-dialog.html',
  styleUrl: './entity-dialog.scss',
})
export class ActivityDialog {
  private readonly data = inject<ActivityDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<ActivityDialog, ActivityDto>);

  readonly isEdit = !!this.data.activity;
  private readonly id = this.data.activity?.id ?? this.data.newId();

  readonly title = signal(this.data.activity?.title ?? '');
  readonly start = signal<ZonedTime>(
    this.data.activity?.start ?? {
      dateTime: this.data.defaultDateTime,
      zone: this.data.defaultZone,
    },
  );
  readonly hasEnd = signal(!!this.data.activity?.end);
  readonly end = signal<ZonedTime>(
    this.data.activity?.end ?? {
      dateTime: this.data.defaultDateTime,
      zone: this.data.defaultZone,
    },
  );
  readonly location = signal(this.data.activity?.location ?? '');
  readonly googleMapsUrl = signal(this.data.activity?.googleMapsUrl ?? '');
  readonly bookingUrl = signal(this.data.activity?.bookingUrl ?? '');
  readonly notes = signal(this.data.activity?.notes ?? '');
  readonly error = signal('');

  save(): void {
    const title = this.title().trim();
    if (!title) {
      this.error.set('Please enter a title.');
      return;
    }
    if (!this.start().dateTime) {
      this.error.set('Please choose a start time.');
      return;
    }
    const result: ActivityDto = {
      id: this.id,
      title,
      start: this.start(),
      end: this.hasEnd() && this.end().dateTime ? this.end() : undefined,
      location: this.location().trim() || undefined,
      googleMapsUrl: this.googleMapsUrl().trim() || undefined,
      bookingUrl: this.bookingUrl().trim() || undefined,
      notes: this.notes().trim() || undefined,
    };
    this.dialogRef.close(result);
  }
}
