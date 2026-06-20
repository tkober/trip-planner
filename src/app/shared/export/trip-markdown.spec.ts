import { tripToMarkdown } from './trip-markdown';
import { anonymizeTrip } from './anonymize';
import { SCHEMA_VERSION, TripDto } from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';

const tz = new TimeZoneService();

/** The slice of `md` between two heading markers (end exclusive). */
function section(md: string, start: string, end: string): string {
  const from = md.indexOf(start);
  const to = md.indexOf(end);
  return md.slice(from, to < 0 ? undefined : to);
}

function sampleTrip(): TripDto {
  return {
    id: 'trip-1',
    schemaVersion: SCHEMA_VERSION,
    title: 'Japan 2026',
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    homeTimeZone: 'Europe/Berlin',
    destinationTimeZone: 'Asia/Tokyo',
    description: 'Two weeks across Honshu.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accommodations: [
      {
        id: 'a1',
        name: 'Hotel Tokyo',
        fullName: 'The Grand Tokyo Hotel',
        address: '1-2-3 Chiyoda, Tokyo',
        bookingUrl: 'https://booking.example/xyz',
        price: '¥18,000 / night',
        checkInDate: '2026-04-01',
        checkOutDate: '2026-04-03',
      },
    ],
    carReservations: [
      {
        id: 'c1',
        name: 'Toyota Aqua',
        pickupLocation: 'Naha Airport',
        dropoffLocation: 'Naha City',
        pickupDate: '2026-04-02',
        dropoffDate: '2026-04-03',
        pickupTime: '09:00',
        price: '¥12,000',
        pickupStationUrl: 'https://rental.example/pick',
        bookingReference: 'CAR-ABC123',
      },
    ],
    activities: [
      {
        id: 'act1',
        title: 'TeamLab',
        start: { dateTime: '2026-04-02T10:00', zone: 'Asia/Tokyo' },
        end: { dateTime: '2026-04-02T12:00', zone: 'Asia/Tokyo' },
        location: 'Toyosu',
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
        bookingReference: 'FL-XYZ789',
      },
    ],
  };
}

describe('tripToMarkdown', () => {
  it('renders the trip header, description and overview facts', () => {
    const md = tripToMarkdown(sampleTrip(), tz);
    expect(md).toContain('# Japan 2026');
    expect(md).toContain('Two weeks across Honshu.');
    expect(md).toContain('- **Dates:** 2026-04-01 → 2026-04-03');
    expect(md).toContain('- **Duration:** 3 days, 2 nights');
    expect(md).toContain('- **Destination time zone:** Asia/Tokyo (Tokyo)');
  });

  it('lists accommodations with stay span and nights', () => {
    const md = tripToMarkdown(sampleTrip(), tz);
    expect(md).toContain('### 1. Hotel Tokyo');
    expect(md).toContain('- Full name: The Grand Tokyo Hotel');
    expect(md).toContain('- Stay: 2026-04-01 → 2026-04-03 (2 nights)');
    expect(md).toContain('- Price: ¥18,000 / night');
  });

  it('lists car rentals with pickup time and location', () => {
    const md = tripToMarkdown(sampleTrip(), tz);
    expect(md).toContain('### 1. Toyota Aqua');
    expect(md).toContain('- Pickup: 2026-04-02 09:00 — Naha Airport');
    expect(md).toContain('- Drop-off: 2026-04-03 — Naha City');
    expect(md).toContain('- Price: ¥12,000');
    expect(md).toContain('- Pickup station: https://rental.example/pick');
    expect(md).toContain('- Booking ref: CAR-ABC123');
  });

  it('lists the flight booking reference', () => {
    const md = tripToMarkdown(sampleTrip(), tz);
    expect(md).toContain('  - Booking ref: FL-XYZ789');
  });

  it('buckets a day-crossing flight under its destination-tz start day', () => {
    const md = tripToMarkdown(sampleTrip(), tz);
    // Departs Berlin Apr 1 11:00 (= Tokyo Apr 1 18:00) → Day 1, even though it
    // lands Tokyo Apr 2. The leg renders both endpoints in their own zone.
    const day1 = section(md, '### Day 1 ', '### Day 2 ');
    expect(day1).toContain('- **Flight — Berlin → Tokyo**');
    expect(day1).toContain('  - Departs: 2026-04-01 11:00 (Europe/Berlin)');
    expect(day1).toContain('  - Arrives: 2026-04-02 06:00 (Asia/Tokyo)');
    expect(day1).toContain('  - Airline: ANA');
    expect(day1).toContain('  - Flight number: NH216');
    expect(md).toContain('### Day 2 — Thursday, 2 April 2026 (Tokyo)');
  });

  it('renders the overnight stay and chronological activities per day', () => {
    const md = tripToMarkdown(sampleTrip(), tz);
    expect(md).toContain('- **Stay overnight:** Hotel Tokyo');
    expect(md).toContain('- **Activity — TeamLab**');
    expect(md).toContain('  - Duration: 2h');
    expect(md).toContain('  - Location: Toyosu');
  });

  it('marks empty days', () => {
    const md = tripToMarkdown(sampleTrip(), tz);
    // Day 3: car drop-off but no time-anchored entry.
    expect(md).toContain('- _No activities or transport._');
  });

  it('carries an anonymization note and redacted fields through', () => {
    const anon = anonymizeTrip(sampleTrip(), {
      flightNumbers: true,
      addresses: true,
      notes: true,
      locations: true,
    });
    const md = tripToMarkdown(anon, tz, true);
    expect(md).toContain('Anonymized for sharing');
    expect(md).toContain('- Address: █████');
    expect(md).toContain('- Flight number: █████');
  });

  it('always ends with a single trailing newline', () => {
    const md = tripToMarkdown(sampleTrip(), tz);
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
  });
});
