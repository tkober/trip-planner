import { DateTime } from 'luxon';
import { formatDate, formatDay, formatRange, zoneCity, zoneLabel } from './date-format';

describe('formatDay', () => {
  it('renders weekday + day + month, no year', () => {
    expect(formatDay('2026-04-09')).toBe('Thu, 9 Apr');
  });
});

describe('formatDate', () => {
  it('renders weekday + day + month + year', () => {
    expect(formatDate('2026-04-09')).toBe('Thu, 9 Apr 2026');
  });
});

describe('formatRange', () => {
  it('collapses a same-day range to a single date', () => {
    expect(formatRange('2026-04-09', '2026-04-09')).toBe('9 Apr 2026');
  });

  it('renders a same-month range as "3–18 Apr 2026"', () => {
    expect(formatRange('2026-04-03', '2026-04-18')).toBe('3–18 Apr 2026');
  });

  it('renders a month-crossing range with both months named', () => {
    expect(formatRange('2026-03-28', '2026-04-03')).toBe('28 Mar – 3 Apr 2026');
  });

  it('renders a year-crossing range with both years named', () => {
    expect(formatRange('2026-12-28', '2027-01-03')).toBe(
      '28 Dec 2026 – 3 Jan 2027',
    );
  });
});

describe('zoneCity', () => {
  it('takes the last path segment', () => {
    expect(zoneCity('Asia/Tokyo')).toBe('Tokyo');
  });

  it('turns underscores into spaces', () => {
    expect(zoneCity('America/New_York')).toBe('New York');
  });

  it('falls back to the raw id when there is no slash', () => {
    expect(zoneCity('UTC')).toBe('UTC');
  });
});

describe('zoneLabel', () => {
  it('renders city + GMT offset at a given moment', () => {
    expect(zoneLabel('Asia/Tokyo', '2026-04-09T10:00:00')).toBe(
      'Tokyo · GMT+9',
    );
  });

  it('renders a half-hour offset zone', () => {
    expect(zoneLabel('Asia/Kolkata', '2026-04-09T10:00:00')).toBe(
      'Kolkata · GMT+5:30',
    );
  });

  it('accepts a Luxon DateTime directly', () => {
    const at = DateTime.fromISO('2026-04-09T10:00:00');
    expect(zoneLabel('Asia/Tokyo', at)).toBe('Tokyo · GMT+9');
  });
});
