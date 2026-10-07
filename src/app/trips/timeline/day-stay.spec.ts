import { dayStayInfo } from './day-stay';
import { AccommodationDto, CarReservationDto } from '../../models/trip.model';

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
): CarReservationDto {
  return { id, name, pickupDate, dropoffDate };
}

const accColor = (a: AccommodationDto) => `color-${a.id}`;
const carColor = (c: CarReservationDto) => `color-${c.id}`;

describe('dayStayInfo', () => {
  it('shows a plain night with its N/M counter', () => {
    const kyoto = acc('kyoto', 'Hotel Kanra', '2026-04-09', '2026-04-13');
    const info = dayStayInfo(
      '2026-04-10',
      kyoto,
      kyoto,
      [],
      undefined,
      accColor,
      carColor,
    );
    expect(info.stay.text).toBe('Hotel Kanra · night 2/4');
    expect(info.stay.color).toBe('color-kyoto');
    expect(info.stay.accommodation).toBe(kyoto);
    expect(info.car).toBeUndefined();
  });

  it('shows a hotel-switch day as an arrow between both stays', () => {
    const hakone = acc('hakone', 'Hakone Ginyu', '2026-04-08', '2026-04-09');
    const kyoto = acc('kyoto', 'Hotel Kanra', '2026-04-09', '2026-04-13');
    const info = dayStayInfo(
      '2026-04-09',
      hakone,
      kyoto,
      [],
      undefined,
      accColor,
      carColor,
    );
    expect(info.stay.text).toBe('Hakone Ginyu → Hotel Kanra');
    // The night stay is the tap target going forward.
    expect(info.stay.accommodation).toBe(kyoto);
    expect(info.stay.color).toBe('color-kyoto');
  });

  it('includes the car line on a switch day a rental also covers', () => {
    const hakone = acc('hakone', 'Hakone Ginyu', '2026-04-08', '2026-04-09');
    const kyoto = acc('kyoto', 'Hotel Kanra', '2026-04-09', '2026-04-13');
    const rental = car('rental', 'Toyota Aqua', '2026-04-09', '2026-04-11');
    const info = dayStayInfo(
      '2026-04-09',
      hakone,
      kyoto,
      [rental],
      undefined,
      accColor,
      carColor,
    );
    expect(info.stay.text).toBe('Hakone Ginyu → Hotel Kanra');
    expect(info.car).toEqual({
      text: 'Toyota Aqua',
      color: 'color-rental',
      reservation: rental,
    });
  });

  it('keeps the car line correct on both sides of a hotel switch it spans', () => {
    const osaka = acc('osaka', 'Cross Hotel', '2026-04-13', '2026-04-15');
    const tokyo = acc('tokyo', 'Mitsui Garden Ginza', '2026-04-16', '2026-04-18');
    const rental = car('rental', 'Kansai self-drive', '2026-04-14', '2026-04-15');

    const dayBefore = dayStayInfo(
      '2026-04-14',
      osaka,
      osaka,
      [rental],
      undefined,
      accColor,
      carColor,
    );
    expect(dayBefore.car?.reservation).toBe(rental);

    // Check-out day: the rental's last day, and the car line must still show.
    const dayOf = dayStayInfo(
      '2026-04-15',
      osaka,
      undefined,
      [rental],
      'bus',
      accColor,
      carColor,
    );
    expect(dayOf.car?.reservation).toBe(rental);
    expect(dayOf.stay.text).toBe('Cross Hotel → Night on the overnight bus');
  });

  it('names the overnight bus when a straddling transport covers a bare night', () => {
    const info = dayStayInfo(
      '2026-04-15',
      undefined,
      undefined,
      [],
      'bus',
      accColor,
      carColor,
    );
    expect(info.stay.text).toBe('Night on the overnight bus');
    expect(info.stay.color).toBe('');
    expect(info.stay.accommodation).toBeUndefined();
  });

  it('falls back to "No stay booked" with no stay and no straddle', () => {
    const info = dayStayInfo(
      '2026-04-15',
      undefined,
      undefined,
      [],
      undefined,
      accColor,
      carColor,
    );
    expect(info.stay.text).toBe('No stay booked');
  });

  it('matches a one-day car rental (pickup = dropoff)', () => {
    const kyoto = acc('kyoto', 'Hotel Kanra', '2026-04-09', '2026-04-13');
    const rental = car('rental', 'Day Car', '2026-04-10', '2026-04-10');
    const infoOn = dayStayInfo(
      '2026-04-10',
      kyoto,
      kyoto,
      [rental],
      undefined,
      accColor,
      carColor,
    );
    expect(infoOn.car?.reservation).toBe(rental);

    const infoBefore = dayStayInfo(
      '2026-04-09',
      kyoto,
      kyoto,
      [rental],
      undefined,
      accColor,
      carColor,
    );
    expect(infoBefore.car).toBeUndefined();
  });

  it('does not truncate very long accommodation names (ellipsis is CSS only)', () => {
    const longName =
      'The Extraordinarily Long And Verbose Grand Imperial Hotel & Spa Resort';
    const hotel = acc('long', longName, '2026-04-09', '2026-04-13');
    const info = dayStayInfo(
      '2026-04-10',
      hotel,
      hotel,
      [],
      undefined,
      accColor,
      carColor,
    );
    expect(info.stay.text).toBe(`${longName} · night 2/4`);
  });
});
