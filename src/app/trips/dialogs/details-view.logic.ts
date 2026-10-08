/**
 * Pure helpers behind the R8 details dialog/sheet content (`DetailsContent`):
 * the header heading/icon/subtitle, the quick-action tile list, the secondary
 * link list, the grouped facts (Details/Notes·Remarks/Cost/Address), and the
 * dual-zone "when" formatting for a single moment. No Angular DI — mirrors the
 * style of `day-span.ts` / `now-line.ts` / `day-stay.ts` so it's unit-testable
 * standalone and reusable by the dialog and sheet hosts alike.
 */
import { DateTime } from 'luxon';
import { GeoPoint, TransportDto, ZonedTime } from '../../models/trip.model';
import { transportLabel } from '../../shared/transport-format';
import { formatDate } from '../../shared/format/date-format';
import { zoneCity } from '../../shared/format/date-format';
import { formatMoney } from '../../shared/cost/cost';
import { DetailsDialogData } from './details-types';

const MODE_ICON: Record<string, string> = {
  flight: 'flight',
  train: 'train',
  bus: 'directions_bus',
  car: 'directions_car',
};

/** The header icon: entity-type icon, or the transport mode's icon. */
export function detailsIcon(data: DetailsDialogData): string {
  switch (data.kind) {
    case 'accommodation':
      return 'hotel';
    case 'car-reservation':
      return 'directions_car';
    case 'activity':
      return 'local_activity';
    case 'transport':
      return MODE_ICON[data.transport?.mode ?? 'car'];
  }
}

/** The header title: for transport, the route `FROM → TO` (shown once). */
export function detailsHeading(data: DetailsDialogData): string {
  switch (data.kind) {
    case 'accommodation':
      return data.accommodation?.name ?? 'Accommodation';
    case 'car-reservation':
      return data.carReservation?.name ?? 'Car rental';
    case 'activity':
      return data.activity?.title ?? 'Activity';
    case 'transport':
      return data.transport ? transportLabel(data.transport) : 'Transport';
  }
}

/** One-line subtitle under the heading. */
export function detailsSubtitle(data: DetailsDialogData): string | undefined {
  switch (data.kind) {
    case 'accommodation':
      return data.accommodation?.fullName?.trim() || undefined;
    case 'car-reservation':
      return join(' · ', data.carReservation?.company, data.carReservation?.carType);
    case 'activity':
      return data.activity?.location?.trim() || undefined;
    case 'transport':
      return transportSubtitle(data.transport);
  }
}

function transportSubtitle(t?: TransportDto): string | undefined {
  if (!t) return undefined;
  switch (t.mode) {
    case 'flight':
      return join(' · ', t.flightNumber, t.airline);
    case 'train':
      return join(' · ', join(' ', t.trainKind, t.trainName), t.operator);
    case 'bus':
      return join(' · ', join(' ', t.busKind, t.line), t.operator);
    default:
      return undefined;
  }
}

function join(sep: string, ...parts: (string | undefined)[]): string | undefined {
  const xs = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return xs.length ? xs.join(sep) : undefined;
}

// --- Quick actions ---------------------------------------------------------

export type QuickActionKind = 'link' | 'copy' | 'ics';

export interface QuickAction {
  id: string;
  icon: string;
  label: string;
  kind: QuickActionKind;
  /** Set when `kind === 'link'`. */
  url?: string;
  /** Set when `kind === 'copy'`. */
  value?: string;
}

/**
 * Up to ~4 quick-action tiles, only for the data that's actually present:
 * Open in Maps (car rentals get a separate pickup/return tile each), Open
 * booking, Copy reference, and — when `hasReservation` — the .ics reminder
 * (its actual download still goes through the existing `reservation-ics.ts`
 * logic in the component; this just decides whether the tile is shown).
 */
export function quickActionsFor(
  data: DetailsDialogData,
  hasReservation: boolean,
): QuickAction[] {
  const actions: QuickAction[] = [];
  const a = data.accommodation;
  const c = data.carReservation;
  const act = data.activity;
  const t = data.transport;

  if (a?.googleMapsUrl) {
    actions.push(linkAction('maps', 'map', 'Open in Maps', a.googleMapsUrl));
  }
  if (act?.googleMapsUrl) {
    actions.push(linkAction('maps', 'map', 'Open in Maps', act.googleMapsUrl));
  }
  if (c?.pickupGoogleMapsUrl) {
    actions.push(linkAction('maps-pickup', 'map', 'Pickup map', c.pickupGoogleMapsUrl));
  }
  if (c?.dropoffGoogleMapsUrl) {
    actions.push(linkAction('maps-dropoff', 'map', 'Return map', c.dropoffGoogleMapsUrl));
  }

  const bookingUrl = a?.bookingUrl ?? c?.bookingUrl ?? act?.bookingUrl ?? t?.bookingUrl;
  if (bookingUrl) {
    actions.push(linkAction('booking', 'open_in_new', 'Open booking', bookingUrl));
  }

  const reference = c?.bookingReference ?? t?.bookingReference;
  if (reference) {
    actions.push({
      id: 'copy-ref',
      icon: 'content_copy',
      label: 'Copy reference',
      kind: 'copy',
      value: reference,
    });
  }

  if (hasReservation) {
    actions.push({ id: 'reminder', icon: 'event', label: 'Reminder (.ics)', kind: 'ics' });
  }

  return actions;
}

function linkAction(id: string, icon: string, label: string, url: string): QuickAction {
  return { id, icon, label, kind: 'link', url };
}

// --- Secondary links ---------------------------------------------------------

export interface SecondaryLink {
  id: string;
  icon: string;
  label: string;
  url: string;
}

/**
 * Links that stay available but aren't promoted to a quick-action tile: the
 * car's pickup/return station pages, and (for a reservable train) smartEX +
 * the prefilled timetable search.
 */
export function secondaryLinksFor(
  data: DetailsDialogData,
  reservationLinks: { smartExUrl?: string; timetableUrl?: string } | undefined,
): SecondaryLink[] {
  const links: SecondaryLink[] = [];
  const c = data.carReservation;
  if (c?.pickupStationUrl) {
    links.push({ id: 'pickup-station', icon: 'link', label: 'Pickup station', url: c.pickupStationUrl });
  }
  if (c?.dropoffStationUrl) {
    links.push({ id: 'dropoff-station', icon: 'link', label: 'Return station', url: c.dropoffStationUrl });
  }
  if (reservationLinks?.smartExUrl) {
    links.push({
      id: 'smartex',
      icon: 'confirmation_number',
      label: 'smartEX',
      url: reservationLinks.smartExUrl,
    });
  }
  if (reservationLinks?.timetableUrl) {
    links.push({
      id: 'timetable',
      icon: 'schedule',
      label: 'Timetable',
      url: reservationLinks.timetableUrl,
    });
  }
  return links;
}

// --- Grouped facts -----------------------------------------------------------

export interface FactRow {
  /** Empty for a single full-width value (multiline remarks/notes). */
  label: string;
  value: string;
  multiline?: boolean;
  /** Monospace + user-selectable — the booking reference, read aloud/typed at a counter. */
  monospace?: boolean;
}

export interface FactGroup {
  label: string;
  rows: FactRow[];
}

/** "Details": the mode-specific facts that aren't the route/mode (both removed). */
export function detailFactsGroup(data: DetailsDialogData): FactGroup | undefined {
  const t = data.transport;
  if (!t) return undefined;
  const rows: FactRow[] = [];
  switch (t.mode) {
    case 'flight':
      pushPair(rows, 'Airport', t.fromAirport, t.toAirport);
      pushPair(rows, 'Terminal', t.fromTerminal, t.toTerminal);
      if (t.airline) rows.push({ label: 'Airline', value: t.airline });
      if (t.flightNumber) rows.push({ label: 'Flight no.', value: t.flightNumber });
      break;
    case 'train':
      pushPair(rows, 'Station', t.fromStation, t.toStation);
      pushPair(rows, 'Platform', t.fromPlatform, t.toPlatform);
      if (t.line) rows.push({ label: 'Line', value: t.line });
      if (t.trainName) rows.push({ label: 'Train name', value: t.trainName });
      if (t.operator) rows.push({ label: 'Operator', value: t.operator });
      if (t.trainKind) rows.push({ label: 'Kind', value: t.trainKind });
      break;
    case 'bus':
      pushPair(rows, 'Stop', t.fromStop, t.toStop);
      if (t.line) rows.push({ label: 'Line', value: t.line });
      if (t.operator) rows.push({ label: 'Operator', value: t.operator });
      if (t.busKind) rows.push({ label: 'Kind', value: t.busKind });
      break;
    default:
      break;
  }
  return rows.length ? { label: 'Details', rows } : undefined;
}

function pushPair(rows: FactRow[], label: string, from?: string, to?: string): void {
  if (from || to) rows.push({ label, value: `${from || '?'} → ${to || '?'}` });
}

/**
 * "Booking ref." (car rental / transport) — the reference as plain, selectable
 * text, not just behind the "Copy reference" quick-action tile: it's read
 * aloud or typed at a rental counter or check-in desk, so it has to stay
 * visible even without tapping Copy.
 */
export function bookingReferenceGroup(data: DetailsDialogData): FactGroup | undefined {
  const reference = data.carReservation?.bookingReference ?? data.transport?.bookingReference;
  return reference
    ? { label: 'Booking ref.', rows: [{ label: '', value: reference, monospace: true }] }
    : undefined;
}

/** "Remarks" (accommodation/car) or "Notes" (activity/transport). */
export function notesGroup(data: DetailsDialogData): FactGroup | undefined {
  const remarks = data.accommodation?.remarks || data.carReservation?.remarks;
  if (remarks) return { label: 'Remarks', rows: [{ label: '', value: remarks, multiline: true }] };
  const notes = data.activity?.notes || data.transport?.notes;
  if (notes) return { label: 'Notes', rows: [{ label: '', value: notes, multiline: true }] };
  return undefined;
}

/** "Address" (accommodation only). */
export function addressGroup(data: DetailsDialogData): FactGroup | undefined {
  const address = data.accommodation?.address?.trim();
  return address ? { label: 'Address', rows: [{ label: '', value: address }] } : undefined;
}

/** "Cost": the shared `CostInfo` fields, same rows the old flat dialog showed. */
export function costGroup(data: DetailsDialogData): FactGroup | undefined {
  const c = data.accommodation ?? data.carReservation ?? data.activity ?? data.transport;
  if (!c) return undefined;
  const rows: FactRow[] = [];
  if (c.totalPrice != null) {
    rows.push({ label: 'Total price', value: formatMoney(c.totalPrice, c.currency) });
  }
  if (c.alreadyPaid) rows.push({ label: 'Already paid', value: 'Yes' });
  if (c.cancellationCost != null) {
    rows.push({ label: 'Cancellation cost', value: formatMoney(c.cancellationCost, c.currency) });
  }
  if (c.paymentDate) rows.push({ label: 'Payment date', value: formatDate(c.paymentDate) });
  if (c.freeCancellationUntil) {
    rows.push({ label: 'Free cancellation until', value: formatDate(c.freeCancellationUntil) });
  }
  return rows.length ? { label: 'Cost', rows } : undefined;
}

// --- Dual-zone "when" formatting ---------------------------------------------

export interface ZonedMoment {
  /** "HH:mm" in the moment's own zone. */
  time: string;
  /** e.g. "GMT+9". */
  zoneAbbr: string;
  /** "ccc, d LLL yyyy" in the moment's own zone. */
  dateStr: string;
  /**
   * "Thu, 9 Apr · 04:12 in Berlin" — the same instant in the *other* trip
   * zone, shown only when it differs from the moment's own zone (same offset
   * AND same zone id — a same-offset-but-different-zone pair, e.g. two zones
   * that happen to share a GMT+9 on a given date, still counts as "same" for
   * display, matching `TimeZoneService.dualLabel`).
   */
  secondaryLine?: string;
}

/**
 * Dual-zone formatting for one `ZonedTime`, self-contained (no `TimeZoneService`
 * injection needed) so it can be unit-tested directly. Re-derives the same
 * "own zone is primary, the other trip zone is secondary" rule
 * `TimeZoneService.dualLabel` uses, but folds the secondary read into one
 * ready-to-render line (with its own date, since a zone crossing can shift it).
 */
export function zonedMoment(
  zt: ZonedTime,
  homeZone: string,
  destZone: string,
): ZonedMoment {
  const own = DateTime.fromISO(zt.dateTime, { zone: zt.zone });
  const home = own.setZone(homeZone);
  const dest = own.setZone(destZone);
  const sameZone = home.offset === dest.offset && homeZone === destZone;
  const ownIsHome = zt.zone === homeZone;
  const primaryDt = ownIsHome ? home : dest;
  const secondaryDt = ownIsHome ? dest : home;
  const secondaryZoneId = ownIsHome ? destZone : homeZone;
  return {
    time: primaryDt.toFormat('HH:mm'),
    zoneAbbr: primaryDt.toFormat('ZZZZ'),
    dateStr: primaryDt.toFormat('ccc, d LLL yyyy'),
    secondaryLine: sameZone
      ? undefined
      : `${secondaryDt.toFormat('ccc, d LLL')} · ${secondaryDt.toFormat('HH:mm')} in ${zoneCity(secondaryZoneId)}`,
  };
}

/** One pin for the details view's mini map (D5, #49) — structurally what `GeoMap` takes. */
export interface DetailsGeoPin {
  point: GeoPoint;
  color: string;
  label?: string;
}

/**
 * Every geocoded point relevant to this entity, tinted with its own accent
 * colour (`data.accent`) — an accommodation/activity has at most one; a car
 * reservation or transport leg may show both endpoints (pickup/dropoff,
 * from/to). Empty when nothing is located yet.
 */
export function detailsGeoPins(data: DetailsDialogData): DetailsGeoPin[] {
  const pins: DetailsGeoPin[] = [];
  const { accent } = data;
  if (data.accommodation?.geo) {
    pins.push({ point: data.accommodation.geo, color: accent, label: data.accommodation.name });
  }
  if (data.activity?.geo) {
    pins.push({ point: data.activity.geo, color: accent, label: data.activity.title });
  }
  if (data.carReservation?.pickupGeo) {
    pins.push({ point: data.carReservation.pickupGeo, color: accent, label: 'Pickup' });
  }
  if (data.carReservation?.dropoffGeo) {
    pins.push({ point: data.carReservation.dropoffGeo, color: accent, label: 'Return' });
  }
  if (data.transport?.fromGeo) {
    pins.push({ point: data.transport.fromGeo, color: accent, label: 'From' });
  }
  if (data.transport?.toGeo) {
    pins.push({ point: data.transport.toGeo, color: accent, label: 'To' });
  }
  return pins;
}
