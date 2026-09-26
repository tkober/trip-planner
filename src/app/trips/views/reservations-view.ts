import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TransportDto, TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { environment } from '../../../environments/environment';
import {
  daysUntilOpening,
  RESERVATION_OPENING_HOUR,
  ReservationStatus,
  ReservationWindow,
  reservationStatus,
  reservationWindows,
  SMART_EX_URL,
  timetableSearchUrl,
} from '../../shared/reservation/reservation';
import {
  reservationEvent,
  reservationIcsFilename,
  reservationsIcs,
  reservationsIcsFilename,
} from '../../shared/calendar/reservation-ics';
import { buildIcs, ICS_MIME_TYPE } from '../../shared/calendar/ics';
import { downloadBlob } from '../../shared/download';
import { transportLabel } from '../../shared/transport-format';

/** One booking window as the view renders it. */
interface ReservationRow {
  window: ReservationWindow;
  transport: TransportDto;
  /** "Tokyo → Okayama". */
  route: string;
  /** "Nozomi 3 · Tokaido-Sanyo Shinkansen". */
  train: string;
  /** Date the window opens, in the departure's own zone. */
  opensDate: string;
  /** Time it opens, in the departure zone and (when different) the home zone. */
  opensPrimary: string;
  opensPrimaryZone: string;
  opensSecondary: string;
  opensSecondaryZone: string;
  sameZone: boolean;
  /** "Sat, 21 Nov 2026 · 06:15" — the departure this window is for. */
  departure: string;
  status: ReservationStatus;
  statusLabel: string;
  timetableUrl?: string;
  color?: string;
}

/**
 * All trains whose seats can be reserved, ordered by when booking opens — the
 * "what can I book, and when" list. The rule and which train kinds it applies
 * to live in [reservation.ts](../../shared/reservation/reservation.ts).
 */
@Component({
  selector: 'app-reservations-view',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './reservations-view.html',
  styleUrl: './reservations-view.scss',
})
export class ReservationsView {
  /** Parent route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();
  /** When set, render this trip instead of looking it up in the store. */
  readonly tripOverride = input<TripDto | undefined>(undefined);

  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);

  readonly smartExUrl = SMART_EX_URL;
  readonly openingHour = `${RESERVATION_OPENING_HOUR}:00`;
  readonly reservableKinds = environment.reservableTrainKinds.join(', ');

  readonly trip = computed<TripDto | undefined>(
    () =>
      this.tripOverride() ?? this.store.trips().find((t) => t.id === this.id()),
  );

  private readonly windows = computed<ReservationWindow[]>(() => {
    const trip = this.trip();
    return trip
      ? reservationWindows(trip, environment.reservableTrainKinds)
      : [];
  });

  readonly rows = computed<ReservationRow[]>(() => {
    const trip = this.trip();
    if (!trip) return [];
    return this.windows().map((window) => this.toRow(window, trip));
  });

  /** All of the trip's booking reminders as one calendar file. */
  downloadAll(): void {
    const trip = this.trip();
    const windows = this.windows();
    if (!trip || !windows.length) return;
    const ics = reservationsIcs(windows, trip.homeTimeZone);
    downloadBlob(
      new Blob([ics], { type: ICS_MIME_TYPE }),
      reservationsIcsFilename(trip),
    );
  }

  /** One train's booking reminder. */
  download(row: ReservationRow): void {
    const trip = this.trip();
    if (!trip) return;
    const ics = buildIcs([reservationEvent(row.window, trip.homeTimeZone)]);
    downloadBlob(
      new Blob([ics], { type: ICS_MIME_TYPE }),
      reservationIcsFilename(row.transport),
    );
  }

  open(row: ReservationRow): void {
    const trip = this.trip();
    if (trip) this.actions.openFlight(trip, row.transport);
  }

  private toRow(window: ReservationWindow, trip: TripDto): ReservationRow {
    const t = window.transport;
    const opens = this.tz.toDateTime(window.opensAt);
    const dual = this.tz.dualLabel(
      window.opensAt,
      trip.homeTimeZone,
      trip.destinationTimeZone,
    );
    const status = reservationStatus(window);
    return {
      window,
      transport: t,
      route: transportLabel(t),
      train: [t.trainName, t.line, t.operator].filter(Boolean).join(' · '),
      opensDate: opens.toFormat('ccc, d LLL yyyy'),
      opensPrimary: dual.primary,
      opensPrimaryZone: dual.primaryZoneAbbr,
      opensSecondary: dual.secondary,
      opensSecondaryZone: dual.secondaryZoneAbbr,
      sameZone: dual.sameZone,
      departure: this.tz.format(t.start, "ccc, d LLL yyyy '·' HH:mm"),
      status,
      statusLabel: this.statusLabel(window, status),
      timetableUrl: timetableSearchUrl(t),
      color: t.color,
    };
  }

  private statusLabel(
    window: ReservationWindow,
    status: ReservationStatus,
  ): string {
    if (status === 'departed') return 'Departed';
    if (status === 'open') return 'Bookable now';
    const days = daysUntilOpening(window);
    return `Opens in ${days} day${days === 1 ? '' : 's'}`;
  }
}
