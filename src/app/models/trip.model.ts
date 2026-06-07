/**
 * Data model for the Trip Planner.
 *
 * All types are plain JSON-serializable DTOs: they are persisted as-is in
 * IndexedDB and are the exact shape used for JSON export / import.
 */

/** Current schema version, bumped when the persisted shape changes. */
export const SCHEMA_VERSION = 2;

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
  /** e.g. "Shinkansen to Kyoto" or "LH716 to Tokyo". */
  title: string;
  /** Departure time. */
  start: ZonedTime;
  /** Arrival time — may be in a different zone than `start` (e.g. flights). */
  end?: ZonedTime;
  fromLocation?: string;
  toLocation?: string;
  // Flight-specific (only meaningful when mode === 'flight'):
  airline?: string;
  flightNumber?: string;
  bookingUrl?: string;
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
