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
import { CarReservationDto } from '../../models/trip.model';
import { DateField } from '../../shared/date-field/date-field';
import { ColorField } from '../../shared/color/color-field';

export interface CarReservationDialogData {
  car?: CarReservationDto;
  defaultPickup: string;
  defaultDropoff: string;
  /** Default tint for this reservation (its position-based colour). */
  defaultColor: string;
  newId: () => string;
}

@Component({
  selector: 'app-car-reservation-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    DateField,
    ColorField,
  ],
  templateUrl: './car-reservation-dialog.html',
  styleUrl: './entity-dialog.scss',
})
export class CarReservationDialog {
  private readonly data = inject<CarReservationDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(
    MatDialogRef<CarReservationDialog, CarReservationDto>,
  );

  readonly isEdit = !!this.data.car;
  private readonly id = this.data.car?.id ?? this.data.newId();

  readonly name = signal(this.data.car?.name ?? '');
  readonly company = signal(this.data.car?.company ?? '');
  readonly carType = signal(this.data.car?.carType ?? '');
  readonly pickupLocation = signal(this.data.car?.pickupLocation ?? '');
  readonly dropoffLocation = signal(this.data.car?.dropoffLocation ?? '');
  readonly pickupDate = signal(
    this.data.car?.pickupDate ?? this.data.defaultPickup,
  );
  readonly dropoffDate = signal(
    this.data.car?.dropoffDate ?? this.data.defaultDropoff,
  );
  readonly pickupTime = signal(this.data.car?.pickupTime ?? '');
  readonly dropoffTime = signal(this.data.car?.dropoffTime ?? '');
  readonly pickupGoogleMapsUrl = signal(
    this.data.car?.pickupGoogleMapsUrl ?? '',
  );
  readonly dropoffGoogleMapsUrl = signal(
    this.data.car?.dropoffGoogleMapsUrl ?? '',
  );
  readonly pickupStationUrl = signal(this.data.car?.pickupStationUrl ?? '');
  readonly dropoffStationUrl = signal(this.data.car?.dropoffStationUrl ?? '');
  readonly price = signal(this.data.car?.price ?? '');
  readonly bookingUrl = signal(this.data.car?.bookingUrl ?? '');
  readonly bookingReference = signal(this.data.car?.bookingReference ?? '');
  readonly remarks = signal(this.data.car?.remarks ?? '');
  readonly color = signal<string | undefined>(this.data.car?.color);
  readonly defaultColor = this.data.defaultColor;
  readonly error = signal('');

  /** When pickup changes, seed an empty/earlier return with the same day. */
  onPickupChange(date: string): void {
    this.pickupDate.set(date);
    if (!this.dropoffDate() || this.dropoffDate() < date) {
      this.dropoffDate.set(date);
    }
  }

  save(): void {
    const name = this.name().trim();
    if (!name) {
      this.error.set('Please enter a name.');
      return;
    }
    if (!this.pickupDate() || !this.dropoffDate()) {
      this.error.set('Please choose pickup and return dates.');
      return;
    }
    if (this.dropoffDate() < this.pickupDate()) {
      this.error.set('Return must be on or after pickup.');
      return;
    }
    const result: CarReservationDto = {
      id: this.id,
      name,
      company: this.company().trim() || undefined,
      carType: this.carType().trim() || undefined,
      pickupLocation: this.pickupLocation().trim() || undefined,
      dropoffLocation: this.dropoffLocation().trim() || undefined,
      pickupDate: this.pickupDate(),
      dropoffDate: this.dropoffDate(),
      pickupTime: this.pickupTime() || undefined,
      dropoffTime: this.dropoffTime() || undefined,
      pickupGoogleMapsUrl: this.pickupGoogleMapsUrl().trim() || undefined,
      dropoffGoogleMapsUrl: this.dropoffGoogleMapsUrl().trim() || undefined,
      pickupStationUrl: this.pickupStationUrl().trim() || undefined,
      dropoffStationUrl: this.dropoffStationUrl().trim() || undefined,
      bookingUrl: this.bookingUrl().trim() || undefined,
      bookingReference: this.bookingReference().trim() || undefined,
      price: this.price().trim() || undefined,
      remarks: this.remarks().trim() || undefined,
      color: this.color() || undefined,
    };
    this.dialogRef.close(result);
  }
}
