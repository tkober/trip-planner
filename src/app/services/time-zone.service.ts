import { Injectable } from '@angular/core';
import { DateTime } from 'luxon';
import { TripDto, ZonedTime } from '../models/trip.model';

/** A single day of the trip, derived from the trip's date range. */
export interface TripDay {
  /** 1-based running index ("Day 1", "Day 2", ...). */
  index: number;
  /** Calendar date in the destination tz: "YYYY-MM-DD". */
  date: string;
  /** Start of the day as a Luxon DateTime in the destination tz. */
  startOfDay: DateTime;
}

/** Formatted representation of a ZonedTime in both home and destination zones. */
export interface DualTimeLabel {
  /** The entry's own zone label (e.g. "21:35"). */
  primary: string;
  primaryZoneAbbr: string;
  /** The same instant rendered in the other zone. */
  secondary: string;
  secondaryZoneAbbr: string;
  /** True when the two zones resolve to the same wall-clock time. */
  sameZone: boolean;
}

@Injectable({ providedIn: 'root' })
export class TimeZoneService {
  /** The IANA zone of the current device, used as the default home zone. */
  deviceZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }

  /** All IANA zone ids supported by the runtime (for autocompletes). */
  supportedZones(): string[] {
    const intl = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    };
    if (typeof intl.supportedValuesOf === 'function') {
      return intl.supportedValuesOf('timeZone');
    }
    return [this.deviceZone(), 'UTC'];
  }

  /** Build a Luxon DateTime anchored to the ZonedTime's own zone. */
  toDateTime(zt: ZonedTime): DateTime {
    return DateTime.fromISO(zt.dateTime, { zone: zt.zone });
  }

  /** Same instant re-expressed in another zone. */
  inZone(zt: ZonedTime, zone: string): DateTime {
    return this.toDateTime(zt).setZone(zone);
  }

  /** Comparable epoch millis for sorting entries chronologically. */
  toMillis(zt: ZonedTime): number {
    const dt = this.toDateTime(zt);
    return dt.isValid ? dt.toMillis() : 0;
  }

  /**
   * Build a dual-zone label for a moment. `relevantZone` decides which side is
   * the primary (highlighted) one — typically the destination zone, except for
   * the departure flight where the home zone matters most.
   */
  dualLabel(zt: ZonedTime, homeZone: string, destZone: string): DualTimeLabel {
    const home = this.inZone(zt, homeZone);
    const dest = this.inZone(zt, destZone);
    const sameZone =
      home.offset === dest.offset && homeZone === destZone;

    // The entry's "primary" is its own anchored zone; the "secondary" is the
    // other of the two trip zones.
    const ownIsHome = zt.zone === homeZone;
    const primaryDt = ownIsHome ? home : dest;
    const secondaryDt = ownIsHome ? dest : home;

    return {
      primary: primaryDt.toFormat('HH:mm'),
      primaryZoneAbbr: primaryDt.toFormat('ZZZZ'),
      secondary: secondaryDt.toFormat('HH:mm'),
      secondaryZoneAbbr: secondaryDt.toFormat('ZZZZ'),
      sameZone,
    };
  }

  /** Format a ZonedTime in its own zone, e.g. "Mon, 12 May · 21:35". */
  format(zt: ZonedTime, fmt = "ccc, d LLL '·' HH:mm"): string {
    return this.toDateTime(zt).toFormat(fmt);
  }

  /** Enumerate every calendar day of the trip in the destination tz. */
  enumerateDays(trip: TripDto): TripDay[] {
    const zone = trip.destinationTimeZone;
    const start = DateTime.fromISO(trip.startDate, { zone }).startOf('day');
    const end = DateTime.fromISO(trip.endDate, { zone }).startOf('day');
    if (!start.isValid || !end.isValid || end < start) {
      return [];
    }
    const days: TripDay[] = [];
    let cursor = start;
    let index = 1;
    while (cursor <= end) {
      days.push({
        index,
        date: cursor.toISODate()!,
        startOfDay: cursor,
      });
      cursor = cursor.plus({ days: 1 });
      index++;
    }
    return days;
  }

  /**
   * The destination-tz calendar date a moment falls on: "YYYY-MM-DD".
   * Used to bucket activities/transport into day sections.
   */
  dayKeyInDestination(zt: ZonedTime, destZone: string): string {
    return this.inZone(zt, destZone).toISODate() ?? '';
  }

  /**
   * The calendar date a moment falls on **in its own zone**: "YYYY-MM-DD".
   * Used to detect day-crossing entries from the traveller's point of view
   * (e.g. a flight departing Berlin on the 15th and arriving Tokyo on the 16th).
   */
  dayKeyLocal(zt: ZonedTime): string {
    return this.toDateTime(zt).toISODate() ?? '';
  }

  /** Inclusive number of nights between two "YYYY-MM-DD" dates. */
  nightsBetween(checkInDate: string, checkOutDate: string): number {
    const a = DateTime.fromISO(checkInDate);
    const b = DateTime.fromISO(checkOutDate);
    if (!a.isValid || !b.isValid) return 0;
    return Math.max(0, Math.round(b.diff(a, 'days').days));
  }
}
