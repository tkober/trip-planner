import { TransportDto } from '../models/trip.model';
import { seatLabel } from './transport-format';

function train(partial: Partial<TransportDto> = {}): TransportDto {
  return {
    id: 't1',
    mode: 'train',
    start: { dateTime: '2026-04-09T10:00', zone: 'Asia/Tokyo' },
    ...partial,
  };
}

function flight(partial: Partial<TransportDto> = {}): TransportDto {
  return {
    id: 't2',
    mode: 'flight',
    start: { dateTime: '2026-04-08T13:00', zone: 'Europe/Berlin' },
    ...partial,
  };
}

describe('seatLabel', () => {
  it('train with both car and seat: "Car 6 · Seat 20-C"', () => {
    expect(seatLabel(train({ trainCar: '6', seat: '20-C' }))).toBe('Car 6 · Seat 20-C');
  });

  it('train with only car: "Car 6"', () => {
    expect(seatLabel(train({ trainCar: '6' }))).toBe('Car 6');
  });

  it('train with only seat: "Seat 20-C"', () => {
    expect(seatLabel(train({ seat: '20-C' }))).toBe('Seat 20-C');
  });

  it('undefined when neither is set', () => {
    expect(seatLabel(train())).toBeUndefined();
  });

  it('ignores trainCar on a non-train mode (meaningless there)', () => {
    expect(seatLabel(flight({ trainCar: '6', seat: '34A' }))).toBe('Seat 34A');
  });

  it('flight with only seat', () => {
    expect(seatLabel(flight({ seat: '34A' }))).toBe('Seat 34A');
  });

  it('supports free text for two people, e.g. "20-C, 20-D"', () => {
    expect(seatLabel(train({ trainCar: '6', seat: '20-C, 20-D' }))).toBe(
      'Car 6 · Seat 20-C, 20-D',
    );
  });

  it('trims whitespace-only values to undefined', () => {
    expect(seatLabel(train({ trainCar: '  ', seat: '  ' }))).toBeUndefined();
  });
});
