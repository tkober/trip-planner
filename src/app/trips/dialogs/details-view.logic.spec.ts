import {
  AccommodationDto,
  CarReservationDto,
  TransportDto,
} from '../../models/trip.model';
import { DetailsDialogData } from './details-types';
import {
  addressGroup,
  bookingReferenceGroup,
  costGroup,
  detailFactsGroup,
  detailsHeading,
  detailsIcon,
  detailsSubtitle,
  notesGroup,
  quickActionsFor,
  secondaryLinksFor,
  zonedMoment,
} from './details-view.logic';

function accommodation(partial: Partial<AccommodationDto> = {}): AccommodationDto {
  return {
    id: 'a1',
    name: 'Hotel Kanra',
    checkInDate: '2026-04-09',
    checkOutDate: '2026-04-11',
    ...partial,
  };
}

function car(partial: Partial<CarReservationDto> = {}): CarReservationDto {
  return {
    id: 'c1',
    name: 'Toyota Aqua',
    pickupDate: '2026-04-09',
    dropoffDate: '2026-04-12',
    ...partial,
  };
}

function train(partial: Partial<TransportDto> = {}): TransportDto {
  return {
    id: 't1',
    mode: 'train',
    start: { dateTime: '2026-04-09T10:00', zone: 'Asia/Tokyo' },
    end: { dateTime: '2026-04-09T12:15', zone: 'Asia/Tokyo' },
    ...partial,
  };
}

function flight(partial: Partial<TransportDto> = {}): TransportDto {
  return {
    id: 't2',
    mode: 'flight',
    start: { dateTime: '2026-04-08T13:00', zone: 'Europe/Berlin' },
    end: { dateTime: '2026-04-09T08:00', zone: 'Asia/Tokyo' },
    ...partial,
  };
}

const BASE: DetailsDialogData = {
  kind: 'accommodation',
  homeZone: 'Europe/Berlin',
  destinationZone: 'Asia/Tokyo',
  accent: '#1565c0',
};

describe('details-view.logic', () => {
  describe('detailsHeading / detailsIcon / detailsSubtitle', () => {
    it('accommodation: name heading, hotel icon, fullName subtitle', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'accommodation',
        accommodation: accommodation({ fullName: 'Hotel Kanra Kyoto by WBF' }),
      };
      expect(detailsHeading(data)).toBe('Hotel Kanra');
      expect(detailsIcon(data)).toBe('hotel');
      expect(detailsSubtitle(data)).toBe('Hotel Kanra Kyoto by WBF');
    });

    it('accommodation with no fullName has no subtitle', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'accommodation',
        accommodation: accommodation(),
      };
      expect(detailsSubtitle(data)).toBeUndefined();
    });

    it('car rental: name heading, company · carType subtitle', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'car-reservation',
        carReservation: car({ company: 'Toyota Rent a Car', carType: 'Compact' }),
      };
      expect(detailsHeading(data)).toBe('Toyota Aqua');
      expect(detailsIcon(data)).toBe('directions_car');
      expect(detailsSubtitle(data)).toBe('Toyota Rent a Car · Compact');
    });

    it('activity: title heading, location subtitle', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'activity',
        activity: {
          id: 'act1',
          title: 'Fushimi Inari hike',
          start: { dateTime: '2026-04-09T09:00', zone: 'Asia/Tokyo' },
          location: 'Fushimi Inari Taisha',
        },
      };
      expect(detailsHeading(data)).toBe('Fushimi Inari hike');
      expect(detailsIcon(data)).toBe('local_activity');
      expect(detailsSubtitle(data)).toBe('Fushimi Inari Taisha');
    });

    it('train: route heading, train icon, "Kind Name · Operator" subtitle', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'transport',
        transport: train({
          fromLocation: 'Odawara',
          toLocation: 'Kyoto',
          trainKind: 'Shinkansen',
          trainName: 'Hikari 463',
          operator: 'JR Central',
        }),
      };
      expect(detailsHeading(data)).toBe('Odawara → Kyoto');
      expect(detailsIcon(data)).toBe('train');
      expect(detailsSubtitle(data)).toBe('Shinkansen Hikari 463 · JR Central');
    });

    it('flight: "flightNumber · airline" subtitle', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'transport',
        transport: flight({
          fromLocation: 'Frankfurt',
          toLocation: 'Tokyo',
          flightNumber: 'JL408',
          airline: 'Japan Airlines',
        }),
      };
      expect(detailsIcon(data)).toBe('flight');
      expect(detailsSubtitle(data)).toBe('JL408 · Japan Airlines');
    });
  });

  describe('quickActionsFor', () => {
    it('is empty with no linkable data and no reservation', () => {
      const data: DetailsDialogData = { ...BASE, accommodation: accommodation() };
      expect(quickActionsFor(data, false)).toEqual([]);
    });

    it('accommodation: maps + booking tiles when present', () => {
      const data: DetailsDialogData = {
        ...BASE,
        accommodation: accommodation({
          googleMapsUrl: 'https://maps/hotel',
          bookingUrl: 'https://booking/hotel',
        }),
      };
      const ids = quickActionsFor(data, false).map((a) => a.id);
      expect(ids).toEqual(['maps', 'booking']);
    });

    it('car rental: separate pickup/return maps tiles + copy reference', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'car-reservation',
        carReservation: car({
          pickupGoogleMapsUrl: 'https://maps/pickup',
          dropoffGoogleMapsUrl: 'https://maps/dropoff',
          bookingReference: 'ABC123',
        }),
      };
      const actions = quickActionsFor(data, false);
      expect(actions.map((a) => a.id)).toEqual(['maps-pickup', 'maps-dropoff', 'copy-ref']);
      expect(actions.find((a) => a.id === 'copy-ref')?.value).toBe('ABC123');
    });

    it('reservable train: adds the .ics reminder tile only when asked', () => {
      const data: DetailsDialogData = { ...BASE, kind: 'transport', transport: train() };
      expect(quickActionsFor(data, false).some((a) => a.id === 'reminder')).toBe(false);
      expect(quickActionsFor(data, true).some((a) => a.id === 'reminder')).toBe(true);
    });
  });

  describe('secondaryLinksFor', () => {
    it('includes car station links and reservation links when given', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'car-reservation',
        carReservation: car({
          pickupStationUrl: 'https://station/pickup',
          dropoffStationUrl: 'https://station/dropoff',
        }),
      };
      const links = secondaryLinksFor(data, {
        smartExUrl: 'https://smart-ex.jp/en/',
        timetableUrl: 'https://jorudan/search',
      });
      expect(links.map((l) => l.id)).toEqual([
        'pickup-station',
        'dropoff-station',
        'smartex',
        'timetable',
      ]);
    });

    it('is empty with nothing to link', () => {
      expect(secondaryLinksFor({ ...BASE }, undefined)).toEqual([]);
    });
  });

  describe('detailFactsGroup', () => {
    it('undefined for non-transport', () => {
      expect(detailFactsGroup({ ...BASE, accommodation: accommodation() })).toBeUndefined();
    });

    it('train facts, route/mode excluded', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'transport',
        transport: train({
          fromStation: 'Odawara',
          toStation: 'Kyoto',
          fromPlatform: '18',
          line: 'Tokaido Shinkansen',
          trainName: 'Hikari 463',
          operator: 'JR Central',
          trainKind: 'Shinkansen',
        }),
      };
      const group = detailFactsGroup(data);
      expect(group?.label).toBe('Details');
      expect(group?.rows).toEqual([
        { label: 'Station', value: 'Odawara → Kyoto' },
        { label: 'Platform', value: '18 → ?' },
        { label: 'Line', value: 'Tokaido Shinkansen' },
        { label: 'Train name', value: 'Hikari 463' },
        { label: 'Operator', value: 'JR Central' },
        { label: 'Kind', value: 'Shinkansen' },
      ]);
    });

    it('flight facts', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'transport',
        transport: flight({
          fromAirport: 'Frankfurt',
          toAirport: 'Haneda',
          airline: 'Japan Airlines',
          flightNumber: 'JL408',
        }),
      };
      expect(detailFactsGroup(data)?.rows).toEqual([
        { label: 'Airport', value: 'Frankfurt → Haneda' },
        { label: 'Airline', value: 'Japan Airlines' },
        { label: 'Flight no.', value: 'JL408' },
      ]);
    });

    it('returns undefined when the mode has no facts set', () => {
      const data: DetailsDialogData = { ...BASE, kind: 'transport', transport: train() };
      expect(detailFactsGroup(data)).toBeUndefined();
    });
  });

  describe('bookingReferenceGroup', () => {
    it('surfaces a car rental reference as visible, monospace text', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'car-reservation',
        carReservation: car({ bookingReference: 'RNT-48213' }),
      };
      expect(bookingReferenceGroup(data)).toEqual({
        label: 'Booking ref.',
        rows: [{ label: '', value: 'RNT-48213', monospace: true }],
      });
    });

    it('surfaces a transport reference', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'transport',
        transport: train({ bookingReference: 'ABC123' }),
      };
      expect(bookingReferenceGroup(data)?.rows[0].value).toBe('ABC123');
    });

    it('is undefined with no reference', () => {
      expect(bookingReferenceGroup({ ...BASE, carReservation: car() })).toBeUndefined();
    });
  });

  describe('notesGroup / addressGroup / costGroup', () => {
    it('labels accommodation/car text as Remarks', () => {
      const data: DetailsDialogData = {
        ...BASE,
        accommodation: accommodation({ remarks: 'Late check-in arranged' }),
      };
      expect(notesGroup(data)).toEqual({
        label: 'Remarks',
        rows: [{ label: '', value: 'Late check-in arranged', multiline: true }],
      });
    });

    it('labels activity/transport text as Notes', () => {
      const data: DetailsDialogData = {
        ...BASE,
        kind: 'activity',
        activity: {
          id: 'act1',
          title: 'Hike',
          start: { dateTime: '2026-04-09T09:00', zone: 'Asia/Tokyo' },
          notes: 'Bring water',
        },
      };
      expect(notesGroup(data)?.label).toBe('Notes');
    });

    it('addressGroup only for accommodation', () => {
      expect(
        addressGroup({ ...BASE, accommodation: accommodation({ address: '1 Main St' }) }),
      ).toEqual({ label: 'Address', rows: [{ label: '', value: '1 Main St' }] });
      expect(addressGroup({ ...BASE, accommodation: accommodation() })).toBeUndefined();
    });

    it('costGroup aggregates the shared CostInfo fields', () => {
      const data: DetailsDialogData = {
        ...BASE,
        accommodation: accommodation({
          totalPrice: 450.5,
          currency: 'EUR',
          alreadyPaid: true,
        }),
      };
      const group = costGroup(data);
      expect(group?.label).toBe('Cost');
      expect(group?.rows[0]).toEqual({ label: 'Total price', value: formatMoneySafe(450.5) });
      expect(group?.rows[1]).toEqual({ label: 'Already paid', value: 'Yes' });
    });

    it('costGroup is undefined with no cost data', () => {
      expect(costGroup({ ...BASE, accommodation: accommodation() })).toBeUndefined();
    });
  });

  describe('zonedMoment', () => {
    it('same zone on both sides: no secondary line', () => {
      const m = zonedMoment(
        { dateTime: '2026-04-09T10:00', zone: 'Asia/Tokyo' },
        'Asia/Tokyo',
        'Asia/Tokyo',
      );
      expect(m.time).toBe('10:00');
      expect(m.secondaryLine).toBeUndefined();
    });

    it('differing zones: secondary line names the other zone city and its date', () => {
      // Departs Berlin at 13:00 on the 8th; in Tokyo (own zone is home here)
      // that instant is the 8th at 20:00 (Apr, CEST = UTC+2, JST = UTC+9).
      const m = zonedMoment(
        { dateTime: '2026-04-08T13:00', zone: 'Europe/Berlin' },
        'Europe/Berlin',
        'Asia/Tokyo',
      );
      expect(m.time).toBe('13:00');
      expect(m.zoneAbbr).toContain('GMT');
      expect(m.secondaryLine).toContain('in Tokyo');
      expect(m.secondaryLine).toContain('20:00');
    });

    it('the secondary line can carry a different calendar date (zone crossing)', () => {
      // 23:30 in Tokyo (JST, UTC+9) is 16:30 the same day in Berlin (CEST, UTC+2) —
      // pick a time that crosses midnight the other way instead: 01:00 JST is
      // still the previous day 18:00 in Berlin.
      const m = zonedMoment(
        { dateTime: '2026-04-09T01:00', zone: 'Asia/Tokyo' },
        'Europe/Berlin',
        'Asia/Tokyo',
      );
      expect(m.secondaryLine).toContain('8 Apr');
      expect(m.secondaryLine).toContain('18:00');
      expect(m.secondaryLine).toContain('in Berlin');
    });
  });
});

// Local copy to avoid importing the Intl-dependent formatter just for one
// assertion's expected value — keeps the test independent of locale config.
function formatMoneySafe(amount: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(amount);
}
