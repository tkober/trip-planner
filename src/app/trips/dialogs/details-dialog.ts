import { Component, computed, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  AccommodationDto,
  ActivityDto,
  CarReservationDto,
  TransportDto,
  ZonedTime,
} from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';

export type DetailsKind =
  | 'accommodation'
  | 'car-reservation'
  | 'activity'
  | 'transport';
export type DetailsAction = 'edit' | 'delete';

export interface DetailsDialogData {
  kind: DetailsKind;
  homeZone: string;
  destinationZone: string;
  accommodation?: AccommodationDto;
  carReservation?: CarReservationDto;
  activity?: ActivityDto;
  transport?: TransportDto;
}

interface TimeRow {
  label: string;
  primary: string;
  primaryZone: string;
  secondary: string;
  secondaryZone: string;
  sameZone: boolean;
}

@Component({
  selector: 'app-details-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './details-dialog.html',
  styleUrl: './details-dialog.scss',
})
export class DetailsDialog {
  readonly data = inject<DetailsDialogData>(MAT_DIALOG_DATA);
  private readonly tz = inject(TimeZoneService);
  readonly dialogRef = inject(MatDialogRef<DetailsDialog, DetailsAction>);

  readonly accommodation = this.data.accommodation;
  readonly carReservation = this.data.carReservation;
  readonly activity = this.data.activity;
  readonly transport = this.data.transport;

  readonly heading = computed(() => {
    switch (this.data.kind) {
      case 'accommodation':
        return this.accommodation?.name ?? 'Accommodation';
      case 'car-reservation':
        return this.carReservation?.name ?? 'Car rental';
      case 'activity':
        return this.activity?.title ?? 'Activity';
      case 'transport':
        return this.transport?.title ?? 'Transport';
    }
  });

  readonly icon = computed(() => {
    if (this.data.kind === 'accommodation') return 'hotel';
    if (this.data.kind === 'car-reservation') return 'directions_car';
    if (this.data.kind === 'activity') return 'local_activity';
    const mode = this.transport?.mode;
    return mode === 'flight'
      ? 'flight'
      : mode === 'train'
        ? 'train'
        : mode === 'bus'
          ? 'directions_bus'
          : 'directions_car';
  });

  /** Time rows (start/end) with dual-zone labels for activity & transport. */
  readonly timeRows = computed<TimeRow[]>(() => {
    const rows: TimeRow[] = [];
    const entity = this.activity ?? this.transport;
    if (!entity) return rows;
    const startLabel = this.data.kind === 'transport' ? 'Departure' : 'Start';
    const endLabel = this.data.kind === 'transport' ? 'Arrival' : 'End';
    rows.push(this.timeRow(startLabel, entity.start));
    if (entity.end) {
      rows.push(this.timeRow(endLabel, entity.end));
    }
    return rows;
  });

  private timeRow(label: string, zt: ZonedTime): TimeRow {
    const dt = this.tz.toDateTime(zt);
    const dateStr = dt.toFormat('ccc, d LLL yyyy');
    const dual = this.tz.dualLabel(
      zt,
      this.data.homeZone,
      this.data.destinationZone,
    );
    return {
      label,
      primary: `${dateStr} · ${dual.primary}`,
      primaryZone: dual.primaryZoneAbbr,
      secondary: dual.secondary,
      secondaryZone: dual.secondaryZoneAbbr,
      sameZone: dual.sameZone,
    };
  }

  close(action: DetailsAction): void {
    this.dialogRef.close(action);
  }
}
