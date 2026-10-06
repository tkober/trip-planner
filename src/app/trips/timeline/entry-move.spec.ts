import { deltaDaysBetween, shiftZonedTime } from './entry-move';

describe('entry-move', () => {
  describe('shiftZonedTime', () => {
    it('shifts the wall-clock date forward, keeping time and zone', () => {
      const zt = { dateTime: '2026-04-09T08:30', zone: 'Asia/Tokyo' };
      expect(shiftZonedTime(zt, 2)).toEqual({
        dateTime: '2026-04-11T08:30',
        zone: 'Asia/Tokyo',
      });
    });

    it('shifts backward across a month boundary', () => {
      const zt = { dateTime: '2026-04-01T23:00', zone: 'Europe/Berlin' };
      expect(shiftZonedTime(zt, -1)).toEqual({
        dateTime: '2026-03-31T23:00',
        zone: 'Europe/Berlin',
      });
    });

    it('is a no-op for a zero delta', () => {
      const zt = { dateTime: '2026-04-09T08:30', zone: 'Asia/Tokyo' };
      expect(shiftZonedTime(zt, 0)).toEqual({
        dateTime: '2026-04-09T08:30',
        zone: 'Asia/Tokyo',
      });
    });
  });

  describe('deltaDaysBetween', () => {
    it('counts forward days', () => {
      expect(deltaDaysBetween('2026-04-09', '2026-04-12')).toBe(3);
    });

    it('counts backward days as negative', () => {
      expect(deltaDaysBetween('2026-04-12', '2026-04-09')).toBe(-3);
    });

    it('is zero for the same date', () => {
      expect(deltaDaysBetween('2026-04-09', '2026-04-09')).toBe(0);
    });
  });
});
