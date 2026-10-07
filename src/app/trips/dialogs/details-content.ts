import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ZonedTime } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { EditModeService } from '../../services/edit-mode.service';
import { formatDate } from '../../shared/format/date-format';
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
  costGroup,
  detailFactsGroup,
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
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './details-content.html',
  styleUrl: './details-content.scss',
})
export class DetailsContent {
  private readonly tz = inject(TimeZoneService);
  private readonly snack = inject(MatSnackBar);
  readonly editMode = inject(EditModeService);

  readonly data = input.required<DetailsDialogData>();

  readonly action = output<DetailsAction>();
  readonly closed = output<void>();

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
    const a = this.data().accommodation;
    if (!a) return undefined;
    return {
      checkIn: formatDate(a.checkInDate),
      checkOut: formatDate(a.checkOutDate),
      nights: this.tz.nightsBetween(a.checkInDate, a.checkOutDate),
    };
  });

  readonly carWhen = computed<CarWhen | undefined>(() => {
    const c = this.data().carReservation;
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
