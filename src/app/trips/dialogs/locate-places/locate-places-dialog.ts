import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AccommodationDto,
  ActivityDto,
  CarReservationDto,
  GeoPoint,
  TransportDto,
  TripDto,
} from '../../../models/trip.model';
import { TripStore } from '../../../services/trip-store';
import { GeocodeService } from '../../../shared/geo/geocode.service';
import { countryForZone } from '../../../shared/geo/zone-country';
import { LocateTarget, planLocateTargets } from './locate-places-planner';

export interface LocatePlacesDialogData {
  trip: TripDto;
}

type RowStatus = 'pending' | 'geocoding' | 'found' | 'not-found';
type RowDecision = 'pending' | 'accept' | 'discard';

interface Row {
  target: LocateTarget;
  status: RowStatus;
  geo?: GeoPoint;
  decision: RowDecision;
}

/** Delay between sequential geocode calls — gentle throttling (#49). */
const THROTTLE_MS = 250;

/**
 * Trip-menu "Locate places…" (D5, #49): geocodes every entity/endpoint
 * without coordinates, one at a time, then lets the user accept/discard
 * each result before anything is saved. Opened via a dynamic `import()`
 * (see `TripActionsService.locatePlaces`) so this dialog — and the
 * `@angular/google-maps` it (transitively, via `GeocodeService`) depends on
 * — never rides along in the main bundle.
 */
@Component({
  selector: 'app-locate-places-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './locate-places-dialog.html',
  styleUrl: './locate-places-dialog.scss',
})
export class LocatePlacesDialog {
  private readonly data = inject<LocatePlacesDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<LocatePlacesDialog, void>);
  private readonly store = inject(TripStore);
  private readonly geocodeSvc = inject(GeocodeService);

  readonly trip = this.data.trip;
  private readonly countryBias = countryForZone(this.trip.destinationTimeZone);

  readonly rows = signal<Row[]>(
    planLocateTargets(this.trip).map((target) => ({
      target,
      status: 'pending',
      decision: 'pending',
    })),
  );

  readonly running = signal(false);
  readonly done = signal(false);
  readonly saving = signal(false);

  readonly foundCount = () => this.rows().filter((r) => r.status === 'found').length;
  readonly acceptedCount = () => this.rows().filter((r) => r.decision === 'accept').length;

  constructor() {
    if (this.rows().length) {
      void this.runAll();
    } else {
      this.done.set(true);
    }
  }

  private async runAll(): Promise<void> {
    this.running.set(true);
    const rows = this.rows();
    for (let i = 0; i < rows.length; i++) {
      this.setRow(i, { status: 'geocoding' });
      const geo = await this.geocodeSvc.geocode(rows[i].target.query, this.countryBias);
      if (geo) {
        this.setRow(i, { status: 'found', geo, decision: 'accept' });
      } else {
        this.setRow(i, { status: 'not-found', decision: 'discard' });
      }
      if (i < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
      }
    }
    this.running.set(false);
    this.done.set(true);
  }

  private setRow(index: number, patch: Partial<Row>): void {
    this.rows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  accept(index: number): void {
    this.setRow(index, { decision: 'accept' });
  }

  discard(index: number): void {
    this.setRow(index, { decision: 'discard' });
  }

  acceptAll(): void {
    this.rows.update((rows) =>
      rows.map((r) => (r.status === 'found' ? { ...r, decision: 'accept' } : r)),
    );
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const accepted = this.rows().filter((r) => r.decision === 'accept' && r.geo);

      const accommodations = new Map<string, AccommodationDto>();
      const cars = new Map<string, CarReservationDto>();
      const activities = new Map<string, ActivityDto>();
      const transports = new Map<string, TransportDto>();

      for (const row of accepted) {
        const { kind, entityId } = row.target;
        const geo = row.geo!;
        if (kind === 'accommodation') {
          const a = accommodations.get(entityId) ??
            this.trip.accommodations.find((x) => x.id === entityId);
          if (a) accommodations.set(entityId, { ...a, geo });
        } else if (kind === 'car-pickup' || kind === 'car-dropoff') {
          const c = cars.get(entityId) ??
            this.trip.carReservations.find((x) => x.id === entityId);
          if (c) {
            cars.set(entityId, {
              ...c,
              ...(kind === 'car-pickup' ? { pickupGeo: geo } : { dropoffGeo: geo }),
            });
          }
        } else if (kind === 'activity') {
          const act = activities.get(entityId) ??
            this.trip.activities.find((x) => x.id === entityId);
          if (act) activities.set(entityId, { ...act, geo });
        } else {
          const t = transports.get(entityId) ??
            this.trip.transport.find((x) => x.id === entityId);
          if (t) {
            transports.set(entityId, {
              ...t,
              ...(kind === 'transport-from' ? { fromGeo: geo } : { toGeo: geo }),
            });
          }
        }
      }

      for (const a of accommodations.values()) {
        await this.store.upsertAccommodation(this.trip, a);
      }
      for (const c of cars.values()) {
        await this.store.upsertCarReservation(this.trip, c);
      }
      for (const act of activities.values()) {
        await this.store.upsertActivity(this.trip, act);
      }
      for (const t of transports.values()) {
        await this.store.upsertTransport(this.trip, t);
      }

      this.dialogRef.close();
    } finally {
      this.saving.set(false);
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
