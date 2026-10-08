import { buildTripDayModel } from './trip-day-model';
import {
  AccommodationDto,
  ActivityDto,
  CarReservationDto,
  TransportDto,
  TripDto,
  ZonedTime,
} from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';

const tz = new TimeZoneService();

function zt(dateTime: string, zone = 'Asia/Tokyo'): ZonedTime {
  return { dateTime, zone };
}

function trip(partial: Partial<TripDto>): TripDto {
  return {
    id: 't1',
    schemaVersion: 8,
    title: 'Test trip',
    startDate: '2026-11-16',
    endDate: '2026-12-04',
    homeTimeZone: 'Europe/Berlin',
    destinationTimeZone: 'Asia/Tokyo',
    accommodations: [],
    carReservations: [],
    activities: [],
    transport: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function acc(
  id: string,
  name: string,
  checkInDate: string,
  checkOutDate: string,
): AccommodationDto {
  return { id, name, checkInDate, checkOutDate };
}

function car(
  id: string,
  name: string,
  pickupDate: string,
  dropoffDate: string,
  extra: Partial<CarReservationDto> = {},
): CarReservationDto {
  return { id, name, pickupDate, dropoffDate, ...extra };
}

function activity(id: string, title: string, start: ZonedTime, end?: ZonedTime): ActivityDto {
  return { id, title, start, end };
}

function transport(
  id: string,
  mode: TransportDto['mode'],
  start: ZonedTime,
  end?: ZonedTime,
): TransportDto {
  return { id, mode, start, end };
}

describe('buildTripDayModel', () => {
  it('builds a Herbsturlaub-like trip: days, order, activities + transport interleaved', () => {
    const kyoto = acc('kyoto', 'Hotel Kanra', '2026-11-16', '2026-11-20');
    const t = trip({
      startDate: '2026-11-16',
      endDate: '2026-11-20',
      accommodations: [kyoto],
      activities: [
        activity('temple', 'Fushimi Inari', zt('2026-11-17T09:00')),
        activity('market', 'Nishiki Market', zt('2026-11-17T15:00')),
      ],
      transport: [
        transport('shinkansen', 'train', zt('2026-11-18T10:00'), zt('2026-11-18T12:30')),
      ],
    });

    const result = buildTripDayModel(t, tz);

    expect(result.days).toHaveLength(5);
    expect(result.days[0].index).toBe(1);
    expect(result.days[0].date).toBe('2026-11-16');
    expect(result.days[0].weekday).toBe('Mon');
    expect(result.days[0].dayOfMonth).toBe('16');
    expect(result.days[0].month).toBe('Nov');

    // Day 2 (2026-11-17) has both activities, sorted by start time.
    const day2 = result.days[1];
    expect(day2.items.map((i) => (i.kind === 'entry' ? i.entry.activity?.id : null))).toEqual([
      'temple',
      'market',
    ]);

    // Day 3 (2026-11-18) has the train, no crossing marker (same-day arrival).
    const day3 = result.days[2];
    expect(day3.items).toHaveLength(1);
    const trainItem = day3.items[0];
    expect(trainItem.kind).toBe('entry');
    if (trainItem.kind === 'entry') {
      expect(trainItem.entry.transport?.id).toBe('shinkansen');
      expect(trainItem.arrivesLabel).toBeUndefined();
    }

    // Every day covers the same single stay.
    for (const day of result.days) {
      expect(day.stay.accommodation?.id).toBe('kyoto');
    }
    expect(result.leading).toBeUndefined();
    expect(result.trailing).toBeUndefined();
  });

  it('marks a hotel-switch day with the arrow wording and the later hotel as covering', () => {
    const hakone = acc('hakone', 'Hakone Ginyu', '2026-11-16', '2026-11-18');
    const kyoto = acc('kyoto', 'Hotel Kanra', '2026-11-18', '2026-11-20');
    const t = trip({
      startDate: '2026-11-16',
      endDate: '2026-11-20',
      accommodations: [hakone, kyoto],
    });

    const result = buildTripDayModel(t, tz);
    const switchDay = result.days.find((d) => d.date === '2026-11-18')!;

    expect(switchDay.stay.text).toBe('Hakone Ginyu → Hotel Kanra');
    expect(switchDay.stay.accommodation?.id).toBe('kyoto');

    // The day before is a plain night in Hakone, the day after a plain night
    // in Kyoto.
    expect(
      result.days.find((d) => d.date === '2026-11-17')!.stay.accommodation?.id,
    ).toBe('hakone');
    expect(
      result.days.find((d) => d.date === '2026-11-19')!.stay.accommodation?.id,
    ).toBe('kyoto');
  });

  it('covers a one-day car rental with fetch/return deadlines on the same day', () => {
    const rental = car('aqua', 'Toyota Aqua', '2026-11-17', '2026-11-17', {
      pickupTime: '09:00',
      dropoffTime: '18:00',
      company: 'Toyota Rent a Car',
    });
    const t = trip({
      startDate: '2026-11-16',
      endDate: '2026-11-20',
      carReservations: [rental],
    });

    const result = buildTripDayModel(t, tz);
    const day = result.days.find((d) => d.date === '2026-11-17')!;

    expect(day.car?.reservation.id).toBe('aqua');
    const deadlines = day.items.filter((i) => i.kind === 'deadline');
    expect(deadlines).toHaveLength(2);
    expect(deadlines.map((d) => (d.kind === 'deadline' ? d.deadline.kind : null))).toEqual([
      'pickup',
      'dropoff',
    ]);

    // Days without the rental have no covering car.
    expect(result.days.find((d) => d.date === '2026-11-16')!.car).toBeUndefined();
  });

  it('marks a flight that crosses the date line with "arrives Day N" on its start day', () => {
    // A domestic-zone overnight flight: departs late on day 2, arrives
    // early on day 3, both ends in the destination zone (crosses midnight,
    // not a zone boundary).
    const t = trip({
      startDate: '2026-11-16',
      endDate: '2026-11-20',
      transport: [
        transport('redeye', 'flight', zt('2026-11-17T23:30'), zt('2026-11-18T01:15')),
      ],
    });

    const result = buildTripDayModel(t, tz);
    const day2 = result.days.find((d) => d.date === '2026-11-17')!;
    const day3 = result.days.find((d) => d.date === '2026-11-18')!;

    expect(day2.items).toHaveLength(1);
    const flightItem = day2.items[0];
    expect(flightItem.kind).toBe('entry');
    if (flightItem.kind === 'entry') {
      expect(flightItem.entry.transport?.id).toBe('redeye');
      expect(flightItem.arrivesLabel).toBe('arrives Day 3');
    }
    // The entry is NOT duplicated onto its arrival day.
    expect(day3.items).toHaveLength(0);
  });

  it('reports an empty day with no items and no stay/car', () => {
    const t = trip({ startDate: '2026-11-16', endDate: '2026-11-18' });

    const result = buildTripDayModel(t, tz);

    expect(result.days).toHaveLength(3);
    for (const day of result.days) {
      expect(day.items).toEqual([]);
      expect(day.stay.accommodation).toBeUndefined();
      expect(day.stay.color).toBe('');
      expect(day.car).toBeUndefined();
    }
  });

  it('exposes the leading/trailing virtual day for international boundary flights', () => {
    const t = trip({
      startDate: '2026-11-16',
      endDate: '2026-11-20',
      homeTimeZone: 'Europe/Berlin',
      destinationTimeZone: 'Asia/Tokyo',
      transport: [
        // Inbound: departs home tz the day before, lands destination day 1.
        transport(
          'inbound',
          'flight',
          zt('2026-11-15T13:00', 'Europe/Berlin'),
          zt('2026-11-16T09:00', 'Asia/Tokyo'),
        ),
        // Outbound: departs destination on the last day, lands home tz later.
        transport(
          'outbound',
          'flight',
          zt('2026-11-20T18:00', 'Asia/Tokyo'),
          zt('2026-11-20T23:00', 'Europe/Berlin'),
        ),
      ],
    });

    const result = buildTripDayModel(t, tz);

    expect(result.leading?.label).toBe('Departure Day');
    expect(result.leading?.city).toBe('Berlin');
    expect(result.trailing?.label).toBe('Return Day');
    expect(result.trailing?.city).toBe('Berlin');

    // Both legs still surface on their clamped real day (day 1 / last day).
    const day1 = result.days[0];
    const lastDay = result.days[result.days.length - 1];
    expect(
      day1.items.some((i) => i.kind === 'entry' && i.entry.transport?.id === 'inbound'),
    ).toBe(true);
    expect(
      lastDay.items.some(
        (i) => i.kind === 'entry' && i.entry.transport?.id === 'outbound',
      ),
    ).toBe(true);
  });
});
