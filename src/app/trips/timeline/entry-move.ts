import { DateTime } from 'luxon';
import { ZonedTime } from '../../models/trip.model';

/** Shift a ZonedTime's wall-clock by N calendar days, keeping time & zone. */
export function shiftZonedTime(zt: ZonedTime, deltaDays: number): ZonedTime {
  const next = DateTime.fromISO(zt.dateTime)
    .plus({ days: deltaDays })
    .toFormat("yyyy-MM-dd'T'HH:mm");
  return { dateTime: next, zone: zt.zone };
}

/** Whole calendar days between two "YYYY-MM-DD" dates (target − current). */
export function deltaDaysBetween(
  currentDate: string,
  targetDate: string,
): number {
  return Math.round(
    DateTime.fromISO(targetDate).diff(DateTime.fromISO(currentDate), 'days')
      .days,
  );
}
