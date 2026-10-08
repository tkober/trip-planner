import { planLocateTargets, transportEndpointQuery } from './locate-places-planner';
import { SCHEMA_VERSION, TransportDto, TripDto } from '../../../models/trip.model';

function baseTrip(overrides: Partial<TripDto> = {}): TripDto {
  return {
    id: 'trip-1',
    schemaVersion: SCHEMA_VERSION,
    title: 'Trip',
    startDate: '2026-04-01',
    endDate: '2026-04-10',
    homeTimeZone: 'Europe/Berlin',
    destinationTimeZone: 'Asia/Tokyo',
    accommodations: [],
    carReservations: [],
    activities: [],
    transport: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('planLocateTargets', () => {
  it('returns no targets for an empty trip', () => {
    expect(planLocateTargets(baseTrip())).toEqual([]);
  });

  it('plans an accommodation by address, falling back to full name then name', () => {
    const trip = baseTrip({
      accommodations: [
        {
          id: 'a1',
          name: 'Hotel A',
          address: '1-2-3 Chiyoda',
          checkInDate: '2026-04-01',
          checkOutDate: '2026-04-02',
        },
        {
          id: 'a2',
          name: 'Hotel B',
          fullName: 'The Grand Hotel B',
          checkInDate: '2026-04-02',
          checkOutDate: '2026-04-03',
        },
        { id: 'a3', name: 'Hotel C', checkInDate: '2026-04-03', checkOutDate: '2026-04-04' },
      ],
    });
    const targets = planLocateTargets(trip);
    expect(targets).toEqual([
      { id: 'accommodation:a1', kind: 'accommodation', entityId: 'a1', label: 'Hotel A', query: '1-2-3 Chiyoda' },
      { id: 'accommodation:a2', kind: 'accommodation', entityId: 'a2', label: 'Hotel B', query: 'The Grand Hotel B' },
      { id: 'accommodation:a3', kind: 'accommodation', entityId: 'a3', label: 'Hotel C', query: 'Hotel C' },
    ]);
  });

  it('skips an accommodation that already has geo', () => {
    const trip = baseTrip({
      accommodations: [
        {
          id: 'a1',
          name: 'Hotel A',
          address: 'somewhere',
          checkInDate: '2026-04-01',
          checkOutDate: '2026-04-02',
          geo: { lat: 1, lng: 2 },
        },
      ],
    });
    expect(planLocateTargets(trip)).toEqual([]);
  });

  it('plans pickup and dropoff separately for a car reservation', () => {
    const trip = baseTrip({
      carReservations: [
        {
          id: 'c1',
          name: 'Aqua',
          pickupLocation: 'Naha Airport',
          dropoffLocation: 'Naha City',
          pickupDate: '2026-04-05',
          dropoffDate: '2026-04-08',
        },
      ],
    });
    const targets = planLocateTargets(trip);
    expect(targets).toEqual([
      { id: 'car:c1:pickup', kind: 'car-pickup', entityId: 'c1', label: 'Aqua · Pickup', query: 'Naha Airport' },
      { id: 'car:c1:dropoff', kind: 'car-dropoff', entityId: 'c1', label: 'Aqua · Return', query: 'Naha City' },
    ]);
  });

  it('skips a car endpoint that already has geo, keeping the other', () => {
    const trip = baseTrip({
      carReservations: [
        {
          id: 'c1',
          name: 'Aqua',
          pickupLocation: 'Naha Airport',
          dropoffLocation: 'Naha City',
          pickupGeo: { lat: 1, lng: 2 },
          pickupDate: '2026-04-05',
          dropoffDate: '2026-04-08',
        },
      ],
    });
    const targets = planLocateTargets(trip);
    expect(targets).toEqual([
      { id: 'car:c1:dropoff', kind: 'car-dropoff', entityId: 'c1', label: 'Aqua · Return', query: 'Naha City' },
    ]);
  });

  it('plans an activity by location, falling back to title', () => {
    const trip = baseTrip({
      activities: [
        {
          id: 'act1',
          title: 'TeamLab',
          location: 'Toyosu',
          start: { dateTime: '2026-04-02T10:00', zone: 'Asia/Tokyo' },
        },
        {
          id: 'act2',
          title: 'Senso-ji Temple',
          start: { dateTime: '2026-04-03T10:00', zone: 'Asia/Tokyo' },
        },
      ],
    });
    const targets = planLocateTargets(trip);
    expect(targets).toEqual([
      { id: 'activity:act1', kind: 'activity', entityId: 'act1', label: 'TeamLab', query: 'Toyosu' },
      { id: 'activity:act2', kind: 'activity', entityId: 'act2', label: 'Senso-ji Temple', query: 'Senso-ji Temple' },
    ]);
  });

  it('skips an activity with no location and no title to go on', () => {
    const trip = baseTrip({
      activities: [
        { id: 'act1', title: '', start: { dateTime: '2026-04-02T10:00', zone: 'Asia/Tokyo' } },
      ],
    });
    expect(planLocateTargets(trip)).toEqual([]);
  });

  it('builds transport endpoint queries from the mode-specific field, falling back to the city', () => {
    const flight: TransportDto = {
      id: 't1',
      mode: 'flight',
      start: { dateTime: '2026-04-01T11:00', zone: 'Europe/Berlin' },
      fromLocation: 'Berlin',
      toLocation: 'Tokyo',
      fromAirport: 'Tegel',
      toAirport: 'Haneda',
    };
    expect(transportEndpointQuery(flight, 'from')).toBe('Tegel, Berlin');
    expect(transportEndpointQuery(flight, 'to')).toBe('Haneda, Tokyo');

    const train: TransportDto = {
      id: 't2',
      mode: 'train',
      start: { dateTime: '2026-04-05T09:00', zone: 'Asia/Tokyo' },
      fromLocation: 'Tokyo',
      toLocation: 'Kyoto',
    };
    expect(transportEndpointQuery(train, 'from')).toBe('Tokyo');
    expect(transportEndpointQuery(train, 'to')).toBe('Kyoto');

    const noInfo: TransportDto = {
      id: 't3',
      mode: 'car',
      start: { dateTime: '2026-04-05T09:00', zone: 'Asia/Tokyo' },
    };
    expect(transportEndpointQuery(noInfo, 'from')).toBeUndefined();
  });

  it('plans both transport endpoints when neither has geo', () => {
    const trip = baseTrip({
      transport: [
        {
          id: 't1',
          mode: 'train',
          start: { dateTime: '2026-04-05T09:00', zone: 'Asia/Tokyo' },
          fromLocation: 'Tokyo',
          toLocation: 'Kyoto',
          fromStation: 'Tokyo Station',
          toStation: 'Kyoto Station',
        },
      ],
    });
    const targets = planLocateTargets(trip);
    expect(targets.map((t) => t.id)).toEqual(['transport:t1:from', 'transport:t1:to']);
    expect(targets[0].query).toBe('Tokyo Station, Tokyo');
    expect(targets[1].query).toBe('Kyoto Station, Kyoto');
  });

  it('skips a transport endpoint that already has geo', () => {
    const trip = baseTrip({
      transport: [
        {
          id: 't1',
          mode: 'train',
          start: { dateTime: '2026-04-05T09:00', zone: 'Asia/Tokyo' },
          fromLocation: 'Tokyo',
          toLocation: 'Kyoto',
          fromGeo: { lat: 1, lng: 2 },
        },
      ],
    });
    const targets = planLocateTargets(trip);
    expect(targets.map((t) => t.id)).toEqual(['transport:t1:to']);
  });

  it('orders targets accommodations, cars, activities, then transport', () => {
    const trip = baseTrip({
      accommodations: [
        { id: 'a1', name: 'A', address: 'x', checkInDate: '2026-04-01', checkOutDate: '2026-04-02' },
      ],
      carReservations: [
        { id: 'c1', name: 'C', pickupLocation: 'y', pickupDate: '2026-04-01', dropoffDate: '2026-04-02' },
      ],
      activities: [
        { id: 'act1', title: 'Act', location: 'z', start: { dateTime: '2026-04-01T10:00', zone: 'Asia/Tokyo' } },
      ],
      transport: [
        {
          id: 't1',
          mode: 'train',
          start: { dateTime: '2026-04-01T10:00', zone: 'Asia/Tokyo' },
          fromLocation: 'w',
        },
      ],
    });
    const targets = planLocateTargets(trip);
    expect(targets.map((t) => t.kind)).toEqual([
      'accommodation',
      'car-pickup',
      'activity',
      'transport-from',
    ]);
  });
});
