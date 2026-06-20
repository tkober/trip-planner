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
import { AccommodationDto } from '../../models/trip.model';
import { DateField } from '../../shared/date-field/date-field';
import { ColorField } from '../../shared/color/color-field';

export interface AccommodationDialogData {
  accommodation?: AccommodationDto;
  defaultCheckIn: string;
  defaultCheckOut: string;
  /** Default tint for this stay (its position-based colour). */
  defaultColor: string;
  newId: () => string;
}

@Component({
  selector: 'app-accommodation-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    DateField,
    ColorField,
  ],
  templateUrl: './accommodation-dialog.html',
  styleUrl: './entity-dialog.scss',
})
export class AccommodationDialog {
  private readonly data = inject<AccommodationDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<AccommodationDialog, AccommodationDto>);

  readonly isEdit = !!this.data.accommodation;
  private readonly id = this.data.accommodation?.id ?? this.data.newId();

  readonly name = signal(this.data.accommodation?.name ?? '');
  readonly fullName = signal(this.data.accommodation?.fullName ?? '');
  readonly address = signal(this.data.accommodation?.address ?? '');
  readonly googleMapsUrl = signal(this.data.accommodation?.googleMapsUrl ?? '');
  readonly bookingUrl = signal(this.data.accommodation?.bookingUrl ?? '');
  readonly price = signal(this.data.accommodation?.price ?? '');
  readonly remarks = signal(this.data.accommodation?.remarks ?? '');
  readonly checkInDate = signal(
    this.data.accommodation?.checkInDate ?? this.data.defaultCheckIn,
  );
  readonly checkOutDate = signal(
    this.data.accommodation?.checkOutDate ?? this.data.defaultCheckOut,
  );
  readonly color = signal<string | undefined>(this.data.accommodation?.color);
  readonly defaultColor = this.data.defaultColor;
  readonly error = signal('');

  /** When check-in changes, seed an empty/earlier check-out with the same day. */
  onCheckInChange(date: string): void {
    this.checkInDate.set(date);
    if (!this.checkOutDate() || this.checkOutDate() < date) {
      this.checkOutDate.set(date);
    }
  }

  save(): void {
    const name = this.name().trim();
    if (!name) {
      this.error.set('Please enter a name.');
      return;
    }
    if (!this.checkInDate() || !this.checkOutDate()) {
      this.error.set('Please choose check-in and check-out dates.');
      return;
    }
    if (this.checkOutDate() < this.checkInDate()) {
      this.error.set('Check-out must be on or after check-in.');
      return;
    }
    const result: AccommodationDto = {
      id: this.id,
      name,
      fullName: this.fullName().trim() || undefined,
      address: this.address().trim() || undefined,
      googleMapsUrl: this.googleMapsUrl().trim() || undefined,
      bookingUrl: this.bookingUrl().trim() || undefined,
      price: this.price().trim() || undefined,
      remarks: this.remarks().trim() || undefined,
      color: this.color() || undefined,
      checkInDate: this.checkInDate(),
      checkOutDate: this.checkOutDate(),
    };
    this.dialogRef.close(result);
  }
}
