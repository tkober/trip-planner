/**
 * Data model for the Trip Planner.
 *
 * All types are plain JSON-serializable DTOs: they are persisted as-is in
 * IndexedDB and are the exact shape used for JSON export / import.
 */

/** Current schema version, bumped when the persisted shape changes. */
export const SCHEMA_VERSION = 6;

/**
 * A wall-clock time anchored to an IANA time zone. No offset is stored — Luxon
 * derives the correct offset from the zone, so the same instant can be rendered
 * in any zone (e.g. flight departure shown in both home and destination tz).
 */
export interface ZonedTime {
  /** Local wall-clock time, ISO without offset: "YYYY-MM-DDTHH:mm". */
  dateTime: string;
  /** IANA zone id, e.g. "Asia/Tokyo". */
  zone: string;
}

export interface AccommodationDto {
  id: string;
  /** Short title shown on the timeline bar. */
  name: string;
  fullName?: string;
  address?: string;
  googleMapsUrl?: string;
  bookingUrl?: string;
  remarks?: string;
  /** Explicit accent colour (hex). When unset a default tint applies. */
  color?: string;
  /** Check-in calendar date in the destination tz: "YYYY-MM-DD". */
  checkInDate: string;
  /** Check-out calendar date in the destination tz: "YYYY-MM-DD". */
  checkOutDate: string;
}

/**
 * Car reservations: a rental car available across a span of days. Rendered as a
 * lane on the left of the timeline (sibling of accommodations) so it's obvious
 * when a car is at your disposal. Pickup and return may be at different stations.
 */
export interface CarReservationDto {
  id: string;
  /** Short label shown on the timeline lane / cards, e.g. "Toyota Aqua". */
  name: string;
  /** Rental company, e.g. "Toyota Rent a Car". */
  company?: string;
  /** Vehicle / car class, e.g. "Compact" or "Toyota Aqua". */
  carType?: string;
  /** Pickup station / branch (city or location name). */
  pickupLocation?: string;
  /** Return station / branch — may differ from pickup. */
  dropoffLocation?: string;
  /** Pickup calendar date in the destination tz: "YYYY-MM-DD" (lane start). */
  pickupDate: string;
  /** Return calendar date in the destination tz: "YYYY-MM-DD" (lane end, inclusive). */
  dropoffDate: string;
  /** Pickup time of day in the destination tz: "HH:mm". */
  pickupTime?: string;
  /** Return time of day in the destination tz: "HH:mm". */
  dropoffTime?: string;
  pickupGoogleMapsUrl?: string;
  dropoffGoogleMapsUrl?: string;
  /** Free link for the pickup station (e.g. branch page), separate from the map. */
  pickupStationUrl?: string;
  /** Free link for the return station (e.g. branch page), separate from the map. */
  dropoffStationUrl?: string;
  bookingUrl?: string;
  /** Booking / confirmation number (often there is no booking link). */
  bookingReference?: string;
  /** Free-text price, e.g. "¥12,000" — what the rental costs on pickup. */
  price?: string;
  remarks?: string;
  /** Explicit accent colour (hex). When unset a default tint applies. */
  color?: string;
}

/** Activities: things you do at a place. */
export interface ActivityDto {
  id: string;
  title: string;
  start: ZonedTime;
  end?: ZonedTime;
  location?: string;
  googleMapsUrl?: string;
  bookingUrl?: string;
  notes?: string;
  /** Explicit accent colour (hex). When unset the activity default applies. */
  color?: string;
}

export type TransportMode = 'flight' | 'train' | 'bus' | 'car';

/** Transport: a separate entity for getting between places (includes flights). */
export interface TransportDto {
  id: string;
  /** Drives the icon / colour differentiation on the timeline. */
  mode: TransportMode;
  /** Departure time. */
  start: ZonedTime;
  /** Arrival time — may be in a different zone than `start` (e.g. flights). */
  end?: ZonedTime;
  /** City / generic place of departure and arrival (e.g. "Tokyo"). */
  fromLocation?: string;
  toLocation?: string;
  // Flight-specific (only meaningful when mode === 'flight'):
  airline?: string;
  flightNumber?: string;
  /** e.g. "Haneda" / "Narita". */
  fromAirport?: string;
  toAirport?: string;
  fromTerminal?: string;
  toTerminal?: string;
  // Train-specific (only meaningful when mode === 'train'):
  fromStation?: string;
  toStation?: string;
  fromPlatform?: string;
  toPlatform?: string;
  /** Specific service / run, e.g. "Tsubame 309". */
  trainName?: string;
  /** Configurable type, e.g. "Shinkansen". See environment.trainKinds. */
  trainKind?: string;
  // Bus-specific (only meaningful when mode === 'bus'):
  fromStop?: string;
  toStop?: string;
  /** Configurable type, e.g. "Overnight". See environment.busKinds. */
  busKind?: string;
  // Shared by train + bus:
  /** Line / route name, e.g. "Tokaido-Sanyo Shinkansen". */
  line?: string;
  /** Operator, e.g. "JR East", "Deutsche Bahn". */
  operator?: string;
  bookingUrl?: string;
  /** Booking / confirmation number (often there is no booking link). */
  bookingReference?: string;
  notes?: string;
  /** Explicit accent colour (hex). When unset the mode's default applies. */
  color?: string;
}

export interface TripDto {
  id: string;
  schemaVersion: number;
  title: string;
  /** Trip start calendar date in the destination tz: "YYYY-MM-DD". */
  startDate: string;
  /** Trip end calendar date in the destination tz: "YYYY-MM-DD". */
  endDate: string;
  /** Home / departure IANA zone, e.g. "Europe/Berlin". */
  homeTimeZone: string;
  /** Destination IANA zone, e.g. "Asia/Tokyo". */
  destinationTimeZone: string;
  description?: string;
  accommodations: AccommodationDto[];
  carReservations: CarReservationDto[];
  activities: ActivityDto[];
  transport: TransportDto[];
  /** ISO instant. */
  createdAt: string;
  /** ISO instant. */
  updatedAt: string;
}

/**
 * Union used by the timeline to render activities and transport interleaved in
 * one chronological column while keeping their distinct entity identity.
 */
export type TimelineEntryKind = 'activity' | 'transport';

export interface TimelineEntry {
  kind: TimelineEntryKind;
  activity?: ActivityDto;
  transport?: TransportDto;
  /** Convenience handle to the entry's start time for sorting. */
  start: ZonedTime;
}
