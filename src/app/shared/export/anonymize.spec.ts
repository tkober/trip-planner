import { anonymizeTrip, AnonymizeOptions } from './anonymize';
import { SCHEMA_VERSION, TripDto } from '../../models/trip.model';

const REDACTED = '█████';

function sampleTrip(): TripDto {
  return {
    id: 'trip-1',
    schemaVersion: SCHEMA_VERSION,
    title: 'Japan 2026',
    startDate: '2026-04-01',
    endDate: '2026-04-10',
    homeTimeZone: 'Europe/Berlin',
    destinationTimeZone: 'Asia/Tokyo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accommodations: [
      {
        id: 'a1',
        name: 'Hotel Tokyo',
        fullName: 'The Grand Tokyo Hotel',
        address: '1-2-3 Chiyoda, Tokyo',
        googleMapsUrl: 'https://maps.example/abc',
        bookingUrl: 'https://booking.example/xyz',
        remarks: 'Late check-in arranged',
        color: '#1565c0',
        checkInDate: '2026-04-01',
        checkOutDate: '2026-04-05',
      },
    ],
    carReservations: [
      {
        id: 'c1',
        name: 'Toyota Aqua',
        pickupLocation: 'Naha Airport',
        dropoffLocation: 'Naha City',
        pickupDate: '2026-04-05',
        dropoffDate: '2026-04-08',
        pickupGoogleMapsUrl: 'https://maps.example/pick',
        dropoffGoogleMapsUrl: 'https://maps.example/drop',
        pickupStationUrl: 'https://rental.example/pick',
        dropoffStationUrl: 'https://rental.example/drop',
        bookingUrl: 'https://booking.example/car',
        bookingReference: 'CAR-ABC123',
        totalPrice: 12000,
        currency: 'JPY',
        alreadyPaid: true,
        remarks: 'Confirmation 12345',
      },
    ],
    activities: [
      {
        id: 'act1',
        title: 'TeamLab',
        start: { dateTime: '2026-04-02T10:00', zone: 'Asia/Tokyo' },
        location: 'Toyosu',
        googleMapsUrl: 'https://maps.example/teamlab',
        bookingUrl: 'https://booking.example/teamlab',
        notes: 'Booked timeslot 10:00',
      },
    ],
    transport: [
      {
        id: 't1',
        mode: 'flight',
        start: { dateTime: '2026-04-01T11:00', zone: 'Europe/Berlin' },
        end: { dateTime: '2026-04-02T06:00', zone: 'Asia/Tokyo' },
        fromLocation: 'Berlin',
        toLocation: 'Tokyo',
        airline: 'ANA',
        flightNumber: 'NH216',
        bookingUrl: 'https://booking.example/flight',
        notes: 'Window seat',
      },
      {
        id: 't2',
        mode: 'train',
        start: { dateTime: '2026-04-05T09:00', zone: 'Asia/Tokyo' },
        fromLocation: 'Tokyo',
        toLocation: 'Kyoto',
        trainName: 'Nozomi 21',
        line: 'Tokaido Shinkansen',
      },
    ],
  };
}

const ALL: AnonymizeOptions = {
  flightNumbers: true,
  addresses: true,
  notes: true,
  locations: true,
  costs: true,
};
const NONE: AnonymizeOptions = {
  flightNumbers: false,
  addresses: false,
  notes: false,
  locations: false,
  costs: false,
};

describe('anonymizeTrip', () => {
  it('does not mutate the original trip', () => {
    const trip = sampleTrip();
    const json = JSON.stringify(trip);
    anonymizeTrip(trip, ALL);
    expect(JSON.stringify(trip)).toBe(json);
  });

  it('leaves everything intact when no category is selected', () => {
    const trip = sampleTrip();
    expect(anonymizeTrip(trip, NONE)).toEqual(trip);
  });

  it('redacts flight numbers only', () => {
    const out = anonymizeTrip(sampleTrip(), {
      ...NONE,
      flightNumbers: true,
    });
    expect(out.transport[0].flightNumber).toBe(REDACTED);
    // Train names and booking URLs are no longer affected.
    expect(out.transport[1].trainName).toBe('Nozomi 21');
    expect(out.accommodations[0].bookingUrl).toBe('https://booking.example/xyz');
    expect(out.carReservations[0].bookingUrl).toBe('https://booking.example/car');
    expect(out.activities[0].bookingUrl).toBe('https://booking.example/teamlab');
    expect(out.transport[0].bookingUrl).toBe('https://booking.example/flight');
    // Untouched by this category.
    expect(out.accommodations[0].address).toBe('1-2-3 Chiyoda, Tokyo');
    expect(out.transport[0].airline).toBe('ANA');
  });

  it('redacts addresses and removes map URLs', () => {
    const out = anonymizeTrip(sampleTrip(), { ...NONE, addresses: true });
    expect(out.accommodations[0].address).toBe(REDACTED);
    expect(out.accommodations[0].fullName).toBe(REDACTED);
    expect(out.accommodations[0].googleMapsUrl).toBeUndefined();
    expect(out.carReservations[0].pickupGoogleMapsUrl).toBeUndefined();
    expect(out.carReservations[0].dropoffGoogleMapsUrl).toBeUndefined();
    expect(out.carReservations[0].pickupStationUrl).toBeUndefined();
    expect(out.carReservations[0].dropoffStationUrl).toBeUndefined();
    expect(out.activities[0].googleMapsUrl).toBeUndefined();
    // Short name (timeline label) is kept.
    expect(out.accommodations[0].name).toBe('Hotel Tokyo');
  });

  it('keeps the booking reference under every category', () => {
    const out = anonymizeTrip(sampleTrip(), ALL);
    expect(out.carReservations[0].bookingReference).toBe('CAR-ABC123');
  });

  it('keeps cost data unless the costs category is selected', () => {
    const kept = anonymizeTrip(sampleTrip(), { ...NONE, addresses: true });
    expect(kept.carReservations[0].totalPrice).toBe(12000);
    expect(kept.carReservations[0].currency).toBe('JPY');
    expect(kept.carReservations[0].alreadyPaid).toBe(true);
  });

  it('drops all cost data when the costs category is selected', () => {
    const out = anonymizeTrip(sampleTrip(), { ...NONE, costs: true });
    expect(out.carReservations[0].totalPrice).toBeUndefined();
    expect(out.carReservations[0].currency).toBeUndefined();
    expect(out.carReservations[0].alreadyPaid).toBeUndefined();
    // Non-cost fields stay.
    expect(out.carReservations[0].bookingReference).toBe('CAR-ABC123');
    expect(out.carReservations[0].name).toBe('Toyota Aqua');
  });

  it('redacts notes and remarks', () => {
    const out = anonymizeTrip(sampleTrip(), { ...NONE, notes: true });
    expect(out.accommodations[0].remarks).toBe(REDACTED);
    expect(out.carReservations[0].remarks).toBe(REDACTED);
    expect(out.activities[0].notes).toBe(REDACTED);
    expect(out.transport[0].notes).toBe(REDACTED);
  });

  it('redacts precise locations but keeps transport cities', () => {
    const out = anonymizeTrip(sampleTrip(), { ...NONE, locations: true });
    expect(out.activities[0].location).toBe(REDACTED);
    expect(out.carReservations[0].pickupLocation).toBe(REDACTED);
    expect(out.carReservations[0].dropoffLocation).toBe(REDACTED);
    // Transport from/to cities stay so the plan is followable.
    expect(out.transport[0].fromLocation).toBe('Berlin');
    expect(out.transport[1].toLocation).toBe('Kyoto');
  });

  it('keeps structural fields (ids, dates, colours, zones) intact', () => {
    const out = anonymizeTrip(sampleTrip(), ALL);
    expect(out.id).toBe('trip-1');
    expect(out.title).toBe('Japan 2026');
    expect(out.accommodations[0].id).toBe('a1');
    expect(out.accommodations[0].color).toBe('#1565c0');
    expect(out.accommodations[0].checkInDate).toBe('2026-04-01');
    expect(out.transport[0].start).toEqual({
      dateTime: '2026-04-01T11:00',
      zone: 'Europe/Berlin',
    });
  });
});
