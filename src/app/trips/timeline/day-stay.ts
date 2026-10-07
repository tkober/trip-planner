import { DateTime } from 'luxon';
import {
  AccommodationDto,
  CarReservationDto,
  TransportMode,
} from '../../models/trip.model';

/** The accommodation/transit line on a mobile day header's second row (R5). */
export interface StayLine {
  text: string;
  /** Resolved accent colour, or '' for the plain no-stay/pure-transit case. */
  color: string;
  /** Accommodation to open when the line is tapped — the night stay when
   * there is one, else the morning stay being checked out of, else unset. */
  accommodation?: AccommodationDto;
}

/** The car line on a mobile day header's second row, only when a rental runs. */
export interface CarLine {
  text: string;
  color: string;
  reservation: CarReservationDto;
}

export interface DayStayInfo {
  stay: StayLine;
  car?: CarLine;
}

/**
 * Wording for a night with no accommodation booked that a day-crossing
 * transport (a straddle starting that day) covers.
 */
function transitWording(mode: TransportMode | undefined): string {
  switch (mode) {
    case 'bus':
      return 'Night on the overnight bus';
    case 'train':
      return 'Night on the overnight train';
    case 'flight':
    case 'car':
      return 'In transit';
    default:
      return 'No stay booked';
  }
}

/**
 * Per-day accommodation + car summary for the mobile day header's second
 * line (R5 — "Variante C": slim colour rails instead of a horizontal hotel
 * row, with the hotel name surfaced here once per day instead). Pure
 * function over data `TimelineView.layout()` already has, so it's
 * independently unit-tested.
 *
 * `morning`/`night` follow the same half-day-handoff convention as
 * `HotelCell`/`TimelineView.hotelCells`: `night` is the accommodation whose
 * stay covers the coming night, `morning` the one covering the night just
 * ending (i.e. the previous day's `night`). `straddleMode` is the mode of a
 * day-crossing transport that *starts* on this day — relevant only when the
 * day has no night stay of its own, so it explains the gap.
 */
export function dayStayInfo(
  date: string,
  morning: AccommodationDto | undefined,
  night: AccommodationDto | undefined,
  carReservations: CarReservationDto[],
  straddleMode: TransportMode | undefined,
  accommodationColor: (a: AccommodationDto) => string,
  carColor: (c: CarReservationDto) => string,
): DayStayInfo {
  let text: string;
  let color: string;
  let accommodation: AccommodationDto | undefined;

  if (night) {
    color = accommodationColor(night);
    accommodation = night;
    if (!morning || morning.id === night.id) {
      const nightIndex = Math.round(
        DateTime.fromISO(date).diff(DateTime.fromISO(night.checkInDate), 'days')
          .days,
      ) + 1;
      const totalNights = Math.round(
        DateTime.fromISO(night.checkOutDate).diff(
          DateTime.fromISO(night.checkInDate),
          'days',
        ).days,
      );
      text = `${night.name} · night ${nightIndex}/${totalNights}`;
    } else {
      text = `${morning.name} → ${night.name}`;
    }
  } else if (morning) {
    color = accommodationColor(morning);
    accommodation = morning;
    text = `${morning.name} → ${transitWording(straddleMode)}`;
  } else {
    color = '';
    text = transitWording(straddleMode);
  }

  const car = carReservations.find(
    (c) => c.pickupDate <= date && date <= c.dropoffDate,
  );

  return {
    stay: { text, color, accommodation },
    car: car
      ? { text: car.name, color: carColor(car), reservation: car }
      : undefined,
  };
}
