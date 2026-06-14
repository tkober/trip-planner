/**
 * Colour handling for trip entities.
 *
 * Every accommodation / activity / transport may carry an explicit `color`
 * (a hex string the user picked). When it doesn't, a sensible per-entity-type
 * default applies:
 *  - accommodations cycle through distinct tints so consecutive stays differ;
 *  - each transport mode keeps its own mode colour;
 *  - activities use their own accent (kept distinct from the flight colour).
 *
 * A single saturated "base" colour is stored per entity. Cards use it directly
 * (left accent + bullet); the hotel lane tints it light via `tintColor`.
 */
import {
  AccommodationDto,
  ActivityDto,
  CarReservationDto,
  TransportDto,
  TransportMode,
} from '../../models/trip.model';

export interface PaletteColor {
  name: string;
  value: string;
}

/** The quick-pick palette shown in the colour field (saturated base colours). */
export const COLOR_PALETTE: PaletteColor[] = [
  { name: 'Blue', value: '#1565c0' },
  { name: 'Teal', value: '#00838f' },
  { name: 'Green', value: '#2e7d32' },
  { name: 'Olive', value: '#9e9d24' },
  { name: 'Orange', value: '#ef6c00' },
  { name: 'Red', value: '#c62828' },
  { name: 'Pink', value: '#ad1457' },
  { name: 'Purple', value: '#6a1b9a' },
  { name: 'Indigo', value: '#283593' },
  { name: 'Brown', value: '#5d4037' },
];

/** Default activity accent — deliberately NOT the flight blue. */
export const ACTIVITY_COLOR = '#00838f';

/** Per-transport-mode default colours. */
export const TRANSPORT_MODE_COLOR: Record<TransportMode, string> = {
  flight: '#1565c0',
  train: '#2e7d32',
  bus: '#ef6c00',
  car: '#6a1b9a',
};

/** Distinct default tints accommodations cycle through (by storage order). */
const ACCOMMODATION_DEFAULTS = [
  '#1565c0',
  '#2e7d32',
  '#ef6c00',
  '#6a1b9a',
  '#c62828',
  '#00838f',
];

/** Default colour for the nth accommodation (by its order in the trip). */
export function accommodationDefaultColor(index: number): string {
  return ACCOMMODATION_DEFAULTS[
    ((index % ACCOMMODATION_DEFAULTS.length) + ACCOMMODATION_DEFAULTS.length) %
      ACCOMMODATION_DEFAULTS.length
  ];
}

/**
 * Distinct default tints car reservations cycle through (by storage order).
 * Ordered to differ from the accommodation cycle so cars and hotels read as
 * visually distinct lanes.
 */
const CAR_RESERVATION_DEFAULTS = [
  '#6a1b9a',
  '#00838f',
  '#ad1457',
  '#5d4037',
  '#283593',
  '#9e9d24',
];

/** Default colour for the nth car reservation (by its order in the trip). */
export function carReservationDefaultColor(index: number): string {
  return CAR_RESERVATION_DEFAULTS[
    ((index % CAR_RESERVATION_DEFAULTS.length) +
      CAR_RESERVATION_DEFAULTS.length) %
      CAR_RESERVATION_DEFAULTS.length
  ];
}

/**
 * Resolve each car reservation's effective colour: its explicit `color`, else the
 * default tint for its position in `cars` (storage order, so it stays stable
 * regardless of how a given view sorts the list).
 */
export function carReservationColors(
  cars: CarReservationDto[],
): Map<string, string> {
  const map = new Map<string, string>();
  cars.forEach((c, i) =>
    map.set(c.id, c.color ?? carReservationDefaultColor(i)),
  );
  return map;
}

export function activityColor(activity: ActivityDto): string {
  return activity.color ?? ACTIVITY_COLOR;
}

export function transportColor(transport: TransportDto): string {
  return transport.color ?? TRANSPORT_MODE_COLOR[transport.mode];
}

/**
 * Resolve each accommodation's effective colour: its explicit `color`, else the
 * default tint for its position in `accommodations` (storage order, so it stays
 * stable regardless of how a given view sorts the list).
 */
export function accommodationColors(
  accommodations: AccommodationDto[],
): Map<string, string> {
  const map = new Map<string, string>();
  accommodations.forEach((a, i) =>
    map.set(a.id, a.color ?? accommodationDefaultColor(i)),
  );
  return map;
}

/** Light tint of a base colour, for large filled areas (the hotel lane). */
export function tintColor(color: string): string {
  return `color-mix(in srgb, ${color} 22%, white)`;
}
