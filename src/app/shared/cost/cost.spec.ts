import { TripDto } from '../../models/trip.model';
import {
  formatEur,
  formatMoney,
  toEur,
  tripCostSummary,
} from './cost';

describe('formatMoney', () => {
  it('renders JPY with no decimals', () => {
    // Intl may use the half- or full-width yen glyph depending on the ICU build,
    // so assert on the stable numeric part.
    expect(formatMoney(18000, 'JPY')).toContain('18,000');
    expect(formatMoney(18000, 'JPY')).not.toContain('.00');
  });

  it('renders EUR with two decimals', () => {
    expect(formatEur(450.5)).toContain('450.50');
  });

  it('defaults to EUR when no currency is given', () => {
    expect(formatMoney(10)).toContain('10.00');
  });

  it('renders an unknown but well-formed code using the code itself', () => {
    // Intl accepts any 3-letter code, showing the code in place of a symbol.
    expect(formatMoney(5, 'ZZZ')).toContain('ZZZ');
    expect(formatMoney(5, 'ZZZ')).toContain('5');
  });

  it('falls back to "<amount> <code>" for malformed currency codes', () => {
    // A non-3-letter code makes Intl throw; the helper degrades gracefully.
    expect(formatMoney(5, '12')).toBe('5 12');
  });
});

describe('toEur', () => {
  it('passes EUR through unchanged', () => {
    expect(toEur(100, 'EUR', {})).toBe(100);
  });

  it('converts a foreign amount via EUR-per-unit', () => {
    expect(toEur(16000, 'JPY', { JPY: 0.00625 })).toBeCloseTo(100, 5);
  });

  it('returns undefined when the rate is missing', () => {
    expect(toEur(16000, 'JPY', {})).toBeUndefined();
  });

  it('returns undefined for a non-positive rate', () => {
    expect(toEur(100, 'JPY', { JPY: 0 })).toBeUndefined();
  });
});

function trip(overrides: Partial<TripDto> = {}): TripDto {
  return {
    id: 't',
    schemaVersion: 7,
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

describe('tripCostSummary', () => {
  it('counts a flagged-paid entity\'s full total as paid, in EUR', () => {
    const summary = tripCostSummary(
      trip({
        accommodations: [
          {
            id: 'a',
            name: 'Hotel',
            checkInDate: '2026-04-01',
            checkOutDate: '2026-04-03',
            totalPrice: 200,
            currency: 'EUR',
            alreadyPaid: true,
          },
        ],
        transport: [
          {
            id: 't1',
            mode: 'flight',
            start: { dateTime: '2026-04-01T10:00', zone: 'Europe/Berlin' },
            totalPrice: 450,
            currency: 'EUR',
            // not yet paid
          },
        ],
      }),
      {},
    );
    expect(summary.grandTotalEur).toBe(650);
    expect(summary.paidEur).toBe(200);
    expect(summary.outstandingEur).toBe(450);
    expect(summary.byCategory.map((c) => c.category)).toEqual([
      'accommodation',
      'transport',
    ]);
  });

  it('converts non-EUR amounts and reports currencies in use', () => {
    const summary = tripCostSummary(
      trip({
        activities: [
          {
            id: 'x',
            title: 'Tour',
            start: { dateTime: '2026-04-02T09:00', zone: 'Asia/Tokyo' },
            totalPrice: 16000,
            currency: 'JPY',
          },
        ],
      }),
      { JPY: 0.00625 },
    );
    expect(summary.grandTotalEur).toBeCloseTo(100, 5);
    expect(summary.currenciesInUse).toEqual(['JPY']);
    expect(summary.missingRates).toEqual([]);
  });

  it('excludes unconverted amounts and flags the missing rate', () => {
    const summary = tripCostSummary(
      trip({
        accommodations: [
          {
            id: 'a',
            name: 'Hotel',
            checkInDate: '2026-04-01',
            checkOutDate: '2026-04-03',
            totalPrice: 100,
            currency: 'EUR',
          },
        ],
        activities: [
          {
            id: 'x',
            title: 'Tour',
            start: { dateTime: '2026-04-02T09:00', zone: 'Asia/Tokyo' },
            totalPrice: 16000,
            currency: 'JPY',
          },
        ],
      }),
      {},
    );
    // EUR accommodation counts; JPY activity is excluded (no rate).
    expect(summary.grandTotalEur).toBe(100);
    expect(summary.currenciesInUse).toEqual(['JPY']);
    expect(summary.missingRates).toEqual(['JPY']);
    const activityCat = summary.byCategory.find((c) => c.category === 'activity');
    expect(activityCat?.hasUnconverted).toBe(true);
  });

  it('ignores entities without any cost', () => {
    const summary = tripCostSummary(
      trip({
        accommodations: [
          {
            id: 'a',
            name: 'Hotel',
            checkInDate: '2026-04-01',
            checkOutDate: '2026-04-03',
          },
        ],
      }),
      {},
    );
    expect(summary.byCategory).toEqual([]);
    expect(summary.grandTotalEur).toBe(0);
  });
});
