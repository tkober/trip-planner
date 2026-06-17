import { Injectable, signal } from '@angular/core';
import { TripDto } from '../models/trip.model';

export type ExportMode = 'png' | 'print';

export interface ExportTarget {
  trip: TripDto;
  mode: ExportMode;
  /** Whether `trip` has been anonymized (drives the cover note). */
  anonymized: boolean;
}

/**
 * Coordinates timeline/plan exports. Setting `target` causes the `ExportHost`
 * (mounted in the trip-page shell) to render a `TripExportDocument` for the trip
 * and then either capture it to PNG or drive the browser print dialog. The
 * returned promise resolves once the host reports completion via `done()`.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  /** The trip currently being rendered for export, or undefined when idle. */
  readonly target = signal<ExportTarget | undefined>(undefined);

  private resolveCurrent?: () => void;

  exportPng(trip: TripDto, anonymized: boolean): Promise<void> {
    return this.run({ trip, mode: 'png', anonymized });
  }

  exportPdf(trip: TripDto, anonymized: boolean): Promise<void> {
    return this.run({ trip, mode: 'print', anonymized });
  }

  private run(target: ExportTarget): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveCurrent = resolve;
      this.target.set(target);
    });
  }

  /** Called by the ExportHost when rendering + capture/print has finished. */
  done(): void {
    this.target.set(undefined);
    this.resolveCurrent?.();
    this.resolveCurrent = undefined;
  }
}
