import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AccommodationDto, CarReservationDto, ZonedTime } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { EditModeService } from '../../services/edit-mode.service';
import { TripStore } from '../../services/trip-store';
import { formatDate, formatDay } from '../../shared/format/date-format';
import { canShift, shift, StayDates, StaySide } from '../../shared/stay-nudge';
import { environment } from '../../../environments/environment';
import {
  isReservable,
  reservationOpensAt,
  reservationStatusLabel,
  ReservationWindow,
  SMART_EX_URL,
  timetableSearchUrl,
} from '../../shared/reservation/reservation';
import {
  reservationEvent,
  reservationIcsFilename,
} from '../../shared/calendar/reservation-ics';
import { buildIcs, ICS_MIME_TYPE } from '../../shared/calendar/ics';
import { downloadBlob } from '../../shared/download';
import {
  transportFrom,
  transportFromDetail,
  transportTo,
  transportToDetail,
} from '../../shared/transport-format';
import { DetailsAction, DetailsDialogData } from './details-types';
import {
  addressGroup,
  bookingReferenceGroup,
  costGroup,
  detailFactsGroup,
  detailsGeoPins,
  detailsHeading,
  detailsIcon,
  detailsSubtitle,
  FactGroup,
  notesGroup,
  QuickAction,
  quickActionsFor,
  SecondaryLink,
  secondaryLinksFor,
  zonedMoment,
  ZonedMoment,
} from './details-view.logic';
import { GOOGLE_MAPS_CONFIGURED } from '../../shared/geo/maps-configured';
import { GeoMap } from '../../shared/geo/geo-map/geo-map';

interface TransportLegs {
  from: ZonedMoment & { place: string; detail?: string };
  to?: ZonedMoment & { place: string; detail?: string };
  duration?: string;
  connectorLabel?: string;
}

interface ActivityWhen extends ZonedMoment {
  endTime?: string;
  location?: string;
}

interface StayWhen {
  checkIn: string;
  checkOut: string;
  nights: number;
}

interface CarWhen {
  pickupDate: string;
  pickupTime?: string;
  pickupLocation?: string;
  dropoffDate: string;
  dropoffTime?: string;
  dropoffLocation?: string;
}

/** R9: one stepper row's state ("− Tue, 14 Apr +"). */
export interface StepperState {
  label: string;
  canMinus: boolean;
  canPlus: boolean;
}

/**
 * The R8 details content, shared verbatim by the desktop `DetailsDialog`
 * (`MatDialog`) and the phone `DetailsSheet` (`MatBottomSheet`) — see
 * `TripActionsService`'s `open*Details` methods for which one opens. Header
 * (icon tile + title/subtitle + reservation status + kebab-menu Delete),
 * quick-action tiles, a per-type "when/where" block, secondary links
 * (smartEX/Jorudan, car station pages) and the grouped facts (Details,
 * Reservation, Notes/Remarks, Cost, Address) — only non-empty groups render.
 * `action` fires 'edit'/'delete' (the host owns closing itself); `closed`
 * fires for the plain "Close" button.
 */
@Component({
  selector: 'app-details-content',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, GeoMap],
  templateUrl: './details-content.html',
  styleUrl: './details-content.scss',
})
export class DetailsContent {
  private readonly tz = inject(TimeZoneService);
  private readonly snack = inject(MatSnackBar);
  private readonly store = inject(TripStore);
  readonly editMode = inject(EditModeService);

  readonly data = input.required<DetailsDialogData>();

  readonly action = output<DetailsAction>();
  readonly closed = output<void>();

  // --- R9: live entity + check-in/out / pickup/return steppers -----------

  /**
   * The owning trip, re-derived live from `TripStore` (not the dialog-open
   * snapshot) so a stepper nudge's new dates — and the nights count, which
   * `stayWhen` derives from them — show up immediately without reopening.
   */
  private readonly liveTrip = computed(() => {
    const tripId = this.data().tripId;
    return tripId ? this.store.trips().find((t) => t.id === tripId) : undefined;
  });

  readonly liveAccommodation = computed<AccommodationDto | undefined>(() => {
    const a = this.data().accommodation;
    const trip = this.liveTrip();
    if (!a || !trip) return a;
    return trip.accommodations.find((x) => x.id === a.id) ?? a;
  });

  readonly liveCarReservation = computed<CarReservationDto | undefined>(() => {
    const c = this.data().carReservation;
    const trip = this.liveTrip();
    if (!c || !trip) return c;
    return trip.carReservations.find((x) => x.id === c.id) ?? c;
  });

  /** Steppers render only in edit mode, for the two kinds that have them. */
  readonly showSteppers = computed(
    () =>
      this.editMode.editing() &&
      !!this.liveTrip() &&
      (!!this.liveAccommodation() || !!this.liveCarReservation()),
  );

  readonly checkInStepper = computed<StepperState | undefined>(() => {
    const a = this.liveAccommodation();
    if (!this.showSteppers() || !a) return undefined;
    return this.stepperState('accommodation', 'start', {
      start: a.checkInDate,
      end: a.checkOutDate,
    });
  });
  readonly checkOutStepper = computed<StepperState | undefined>(() => {
    const a = this.liveAccommodation();
    if (!this.showSteppers() || !a) return undefined;
    return this.stepperState('accommodation', 'end', {
      start: a.checkInDate,
      end: a.checkOutDate,
    });
  });
  readonly pickupStepper = computed<StepperState | undefined>(() => {
    const c = this.liveCarReservation();
    if (!this.showSteppers() || !c) return undefined;
    return this.stepperState('car', 'start', {
      start: c.pickupDate,
      end: c.dropoffDate,
    });
  });
  readonly returnStepper = computed<StepperState | undefined>(() => {
    const c = this.liveCarReservation();
    if (!this.showSteppers() || !c) return undefined;
    return this.stepperState('car', 'end', {
      start: c.pickupDate,
      end: c.dropoffDate,
    });
  });

  private stepperState(
    kind: 'accommodation' | 'car',
    side: StaySide,
    dates: StayDates,
  ): StepperState {
    const current = side === 'start' ? dates.start : dates.end;
    return {
      label: formatDay(current),
      canMinus: canShift(kind, side, -1, dates),
      canPlus: canShift(kind, side, 1, dates),
    };
  }

  /** Apply a ±1-day stepper nudge, save it, and show an Undo snackbar. */
  async nudgeAccommodation(side: StaySide, delta: 1 | -1): Promise<void> {
    const trip = this.liveTrip();
    const a = this.liveAccommodation();
    if (!trip || !a) return;
    const before: StayDates = { start: a.checkInDate, end: a.checkOutDate };
    const after = shift(side, delta, before);
    await this.store.upsertAccommodation(trip, {
      ...a,
      checkInDate: after.start,
      checkOutDate: after.end,
    });
    this.announceShift(side, 'Check-in', 'Check-out', before, after, async () => {
      const t = this.liveTrip();
      const live = this.liveAccommodation();
      if (!t || !live) return;
      await this.store.upsertAccommodation(t, {
        ...live,
        checkInDate: before.start,
        checkOutDate: before.end,
      });
    });
  }

  async nudgeCarReservation(side: StaySide, delta: 1 | -1): Promise<void> {
    const trip = this.liveTrip();
    const c = this.liveCarReservation();
    if (!trip || !c) return;
    const before: StayDates = { start: c.pickupDate, end: c.dropoffDate };
    const after = shift(side, delta, before);
    await this.store.upsertCarReservation(trip, {
      ...c,
      pickupDate: after.start,
      dropoffDate: after.end,
    });
    this.announceShift(side, 'Pickup', 'Return', before, after, async () => {
      const t = this.liveTrip();
      const live = this.liveCarReservation();
      if (!t || !live) return;
      await this.store.upsertCarReservation(t, {
        ...live,
        pickupDate: before.start,
        dropoffDate: before.end,
      });
    });
  }

  private announceShift(
    side: StaySide,
    startLabel: string,
    endLabel: string,
    before: StayDates,
    after: StayDates,
    undo: () => Promise<void>,
  ): void {
    const label = side === 'start' ? startLabel : endLabel;
    const newDate = formatDay(side === 'start' ? after.start : after.end);
    const ref = this.snack.open(`${label} moved to ${newDate}`, 'Undo', {
      duration: 5000,
    });
    ref.onAction().subscribe(() => void undo());
  }

  /** D5 (#49): the mini map's pins, hidden entirely when Maps isn't configured.
   *  Reads the live accommodation/car (not the dialog-open snapshot) so a
   *  "Locate places…" save while this view is open reflects immediately. */
  readonly mapsConfigured = GOOGLE_MAPS_CONFIGURED;
  readonly geoPins = computed(() =>
    detailsGeoPins({
      ...this.data(),
      accommodation: this.liveAccommodation(),
      carReservation: this.liveCarReservation(),
    }),
  );

  readonly icon = computed(() => detailsIcon(this.data()));
  readonly heading = computed(() => detailsHeading(this.data()));
  readonly subtitle = computed(() => detailsSubtitle(this.data()));

  /** The booking window for a seat-reservable train, else undefined. */
  readonly reservation = computed<ReservationWindow | undefined>(() => {
    const t = this.data().transport;
    if (!t || !isReservable(t, environment.reservableTrainKinds)) return undefined;
    const opensAt = reservationOpensAt(t.start);
    return opensAt ? { transport: t, departure: t.start, opensAt } : undefined;
  });

  readonly reservationStatusLabel = computed<string>(() => {
    const r = this.reservation();
    return r ? reservationStatusLabel(r) : '';
  });

  private readonly timetableUrl = computed<string | undefined>(() => {
    const t = this.data().transport;
    return t && this.reservation() ? timetableSearchUrl(t) : undefined;
  });

  readonly quickActions = computed<QuickAction[]>(() =>
    quickActionsFor(this.data(), !!this.reservation()),
  );

  readonly secondaryLinks = computed<SecondaryLink[]>(() =>
    secondaryLinksFor(
      this.data(),
      this.reservation()
        ? { smartExUrl: SMART_EX_URL, timetableUrl: this.timetableUrl() }
        : undefined,
    ),
  );

  // --- When/where --------------------------------------------------------

  readonly transportLegs = computed<TransportLegs | undefined>(() => {
    const t = this.data().transport;
    if (!t) return undefined;
    const { homeZone, destinationZone } = this.data();
    const from = {
      ...zonedMoment(t.start, homeZone, destinationZone),
      place: transportFrom(t),
      detail: transportFromDetail(t),
    };
    const to = t.end
      ? {
          ...zonedMoment(t.end, homeZone, destinationZone),
          place: transportTo(t),
          detail: transportToDetail(t),
        }
      : undefined;
    const duration = t.end ? this.tz.durationLabel(t.start, t.end) : undefined;
    const connectorLabel =
      t.mode === 'train'
        ? t.trainKind
        : t.mode === 'bus'
          ? t.busKind
          : t.mode === 'flight'
            ? t.airline
            : undefined;
    return { from, to, duration, connectorLabel };
  });

  readonly activityWhen = computed<ActivityWhen | undefined>(() => {
    const a = this.data().activity;
    if (!a) return undefined;
    const { homeZone, destinationZone } = this.data();
    const moment = zonedMoment(a.start, homeZone, destinationZone);
    const endTime = a.end ? this.tz.toDateTime(a.end).toFormat('HH:mm') : undefined;
    return { ...moment, endTime, location: a.location };
  });

  readonly stayWhen = computed<StayWhen | undefined>(() => {
    const a = this.liveAccommodation();
    if (!a) return undefined;
    return {
      checkIn: formatDate(a.checkInDate),
      checkOut: formatDate(a.checkOutDate),
      nights: this.tz.nightsBetween(a.checkInDate, a.checkOutDate),
    };
  });

  readonly carWhen = computed<CarWhen | undefined>(() => {
    const c = this.liveCarReservation();
    if (!c) return undefined;
    return {
      pickupDate: formatDate(c.pickupDate),
      pickupTime: c.pickupTime,
      pickupLocation: c.pickupLocation,
      dropoffDate: formatDate(c.dropoffDate),
      dropoffTime: c.dropoffTime,
      dropoffLocation: c.dropoffLocation,
    };
  });

  // --- Grouped facts -------------------------------------------------------

  readonly factGroups = computed<FactGroup[]>(() => {
    const data = this.data();
    const groups = [
      detailFactsGroup(data),
      bookingReferenceGroup(data),
      this.reservationGroup(),
      notesGroup(data),
      costGroup(data),
      addressGroup(data),
    ];
    return groups.filter((g): g is FactGroup => !!g);
  });

  private reservationGroup(): FactGroup | undefined {
    const r = this.reservation();
    if (!r) return undefined;
    const m = this.reservationMoment(r.opensAt);
    return { label: 'Reservation', rows: [{ label: 'Booking opens', value: m }] };
  }

  private reservationMoment(zt: ZonedTime): string {
    const { homeZone, destinationZone } = this.data();
    const m = zonedMoment(zt, homeZone, destinationZone);
    return m.secondaryLine
      ? `${m.dateStr} · ${m.time} ${m.zoneAbbr} (${m.secondaryLine})`
      : `${m.dateStr} · ${m.time} ${m.zoneAbbr}`;
  }

  // --- Quick-action / link handlers ---------------------------------------

  async runQuickAction(qa: QuickAction): Promise<void> {
    if (qa.kind === 'copy') {
      await this.copyReference(qa.value ?? '');
    } else if (qa.kind === 'ics') {
      this.downloadIcs();
    }
  }

  private async copyReference(value: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        this.snack.open('Reference copied', undefined, { duration: 2000 });
        return;
      }
    } catch {
      // Clipboard unavailable/denied — fall through to the visible fallback.
    }
    this.snack.open(`Reference: ${value}`, undefined, { duration: 4000 });
  }

  private downloadIcs(): void {
    const window = this.reservation();
    if (!window) return;
    const ics = buildIcs([reservationEvent(window, this.data().homeZone)]);
    downloadBlob(new Blob([ics], { type: ICS_MIME_TYPE }), reservationIcsFilename(window.transport));
  }
}
