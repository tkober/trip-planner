import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import {
  TransportDto,
  TransportMode,
  ZonedTime,
} from '../../models/trip.model';
import { ZonedTimeField } from '../../shared/zoned-time-field/zoned-time-field';
import { ColorField } from '../../shared/color/color-field';
import { SuggestField } from '../../shared/suggest-field/suggest-field';
import { TRANSPORT_MODE_COLOR } from '../../shared/color/color';
import { environment } from '../../../environments/environment';

export interface TransportDialogData {
  transport?: TransportDto;
  /** Default home + destination zones for sensible departure/arrival defaults. */
  homeZone: string;
  destinationZone: string;
  defaultDateTime: string;
  newId: () => string;
}

const MODES: { value: TransportMode; label: string; icon: string }[] = [
  { value: 'flight', label: 'Flight', icon: 'flight' },
  { value: 'train', label: 'Train', icon: 'train' },
  { value: 'bus', label: 'Bus', icon: 'directions_bus' },
  { value: 'car', label: 'Car', icon: 'directions_car' },
];

@Component({
  selector: 'app-transport-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatIconModule,
    ZonedTimeField,
    ColorField,
    SuggestField,
  ],
  templateUrl: './transport-dialog.html',
  styleUrl: './entity-dialog.scss',
})
export class TransportDialog {
  private readonly data = inject<TransportDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<TransportDialog, TransportDto>);

  readonly modes = MODES;
  readonly isEdit = !!this.data.transport;
  private readonly id = this.data.transport?.id ?? this.data.newId();

  readonly mode = signal<TransportMode>(this.data.transport?.mode ?? 'train');
  readonly isFlight = computed(() => this.mode() === 'flight');
  readonly isTrain = computed(() => this.mode() === 'train');
  readonly isBus = computed(() => this.mode() === 'bus');

  /** Configurable "kind" options (env-driven). */
  readonly trainKinds = environment.trainKinds;
  readonly busKinds = environment.busKinds;

  readonly start = signal<ZonedTime>(
    this.data.transport?.start ?? {
      dateTime: this.data.defaultDateTime,
      zone: this.data.destinationZone,
    },
  );
  readonly hasEnd = signal(!!this.data.transport?.end);
  readonly end = signal<ZonedTime>(
    this.data.transport?.end ?? {
      dateTime: this.data.defaultDateTime,
      zone: this.data.destinationZone,
    },
  );
  readonly fromLocation = signal(this.data.transport?.fromLocation ?? '');
  readonly toLocation = signal(this.data.transport?.toLocation ?? '');
  readonly airline = signal(this.data.transport?.airline ?? '');
  readonly flightNumber = signal(this.data.transport?.flightNumber ?? '');
  // Flight-specific
  readonly fromAirport = signal(this.data.transport?.fromAirport ?? '');
  readonly toAirport = signal(this.data.transport?.toAirport ?? '');
  readonly fromTerminal = signal(this.data.transport?.fromTerminal ?? '');
  readonly toTerminal = signal(this.data.transport?.toTerminal ?? '');
  // Train-specific
  readonly fromStation = signal(this.data.transport?.fromStation ?? '');
  readonly toStation = signal(this.data.transport?.toStation ?? '');
  readonly fromPlatform = signal(this.data.transport?.fromPlatform ?? '');
  readonly toPlatform = signal(this.data.transport?.toPlatform ?? '');
  readonly trainName = signal(this.data.transport?.trainName ?? '');
  readonly trainKind = signal(this.data.transport?.trainKind ?? '');
  // Bus-specific
  readonly fromStop = signal(this.data.transport?.fromStop ?? '');
  readonly toStop = signal(this.data.transport?.toStop ?? '');
  readonly busKind = signal(this.data.transport?.busKind ?? '');
  // Shared by train + bus
  readonly line = signal(this.data.transport?.line ?? '');
  readonly operator = signal(this.data.transport?.operator ?? '');
  readonly bookingUrl = signal(this.data.transport?.bookingUrl ?? '');
  readonly notes = signal(this.data.transport?.notes ?? '');
  readonly color = signal<string | undefined>(this.data.transport?.color);
  /** Default swatch follows the selected mode's colour. */
  readonly defaultColor = computed(() => TRANSPORT_MODE_COLOR[this.mode()]);
  readonly error = signal('');

  setMode(mode: TransportMode): void {
    this.mode.set(mode);
    // For a flight, default the departure to the home zone and enable an end.
    if (mode === 'flight') {
      this.start.set({ ...this.start(), zone: this.data.homeZone });
      if (!this.hasEnd()) {
        this.hasEnd.set(true);
        this.end.set({ ...this.end(), zone: this.data.destinationZone });
      }
    }
  }

  save(): void {
    if (!this.start().dateTime) {
      this.error.set('Please choose a departure time.');
      return;
    }
    // Keep a field only when its mode is active; trim and coerce empties.
    const flight = (v: string) => (this.isFlight() ? v.trim() || undefined : undefined);
    const train = (v: string) => (this.isTrain() ? v.trim() || undefined : undefined);
    const bus = (v: string) => (this.isBus() ? v.trim() || undefined : undefined);
    const trainOrBus = (v: string) =>
      this.isTrain() || this.isBus() ? v.trim() || undefined : undefined;

    const result: TransportDto = {
      id: this.id,
      mode: this.mode(),
      start: this.start(),
      end: this.hasEnd() && this.end().dateTime ? this.end() : undefined,
      fromLocation: this.fromLocation().trim() || undefined,
      toLocation: this.toLocation().trim() || undefined,
      // Flight
      airline: flight(this.airline()),
      flightNumber: flight(this.flightNumber()),
      fromAirport: flight(this.fromAirport()),
      toAirport: flight(this.toAirport()),
      fromTerminal: flight(this.fromTerminal()),
      toTerminal: flight(this.toTerminal()),
      // Train
      fromStation: train(this.fromStation()),
      toStation: train(this.toStation()),
      fromPlatform: train(this.fromPlatform()),
      toPlatform: train(this.toPlatform()),
      trainName: train(this.trainName()),
      trainKind: train(this.trainKind()),
      // Bus
      fromStop: bus(this.fromStop()),
      toStop: bus(this.toStop()),
      busKind: bus(this.busKind()),
      // Shared by train + bus
      line: trainOrBus(this.line()),
      operator: trainOrBus(this.operator()),
      bookingUrl: this.bookingUrl().trim() || undefined,
      notes: this.notes().trim() || undefined,
      color: this.color() || undefined,
    };
    this.dialogRef.close(result);
  }
}
