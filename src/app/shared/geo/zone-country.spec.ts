import { countryForZone } from './zone-country';

describe('countryForZone', () => {
  it('maps a known destination zone to its country code', () => {
    expect(countryForZone('Asia/Tokyo')).toBe('jp');
    expect(countryForZone('Europe/Berlin')).toBe('de');
  });

  it('returns undefined for an unmapped zone', () => {
    expect(countryForZone('Antarctica/Troll')).toBeUndefined();
  });

  it('returns undefined for an empty/undefined zone', () => {
    expect(countryForZone(undefined)).toBeUndefined();
    expect(countryForZone('')).toBeUndefined();
  });
});
