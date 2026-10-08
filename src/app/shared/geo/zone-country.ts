/**
 * Maps a trip's IANA destination zone to a 2-letter ccTLD-style country code,
 * used as the Geocoding API's `region` bias (D5, #49) — e.g. geocoding
 * "Shibuya" with `region: 'jp'` correctly favours Tokyo over a same-named
 * place elsewhere. Deliberately small and additive: an unmapped zone (or no
 * zone) simply geocodes with no region bias instead of a wrong one.
 */
const ZONE_COUNTRY: Record<string, string> = {
  'Asia/Tokyo': 'jp',
  'Asia/Seoul': 'kr',
  'Asia/Shanghai': 'cn',
  'Asia/Hong_Kong': 'hk',
  'Asia/Taipei': 'tw',
  'Asia/Singapore': 'sg',
  'Asia/Bangkok': 'th',
  'Asia/Kuala_Lumpur': 'my',
  'Asia/Jakarta': 'id',
  'Asia/Manila': 'ph',
  'Asia/Ho_Chi_Minh': 'vn',
  'Asia/Kolkata': 'in',
  'Asia/Dubai': 'ae',
  'Europe/Berlin': 'de',
  'Europe/London': 'gb',
  'Europe/Paris': 'fr',
  'Europe/Rome': 'it',
  'Europe/Madrid': 'es',
  'Europe/Lisbon': 'pt',
  'Europe/Amsterdam': 'nl',
  'Europe/Brussels': 'be',
  'Europe/Vienna': 'at',
  'Europe/Zurich': 'ch',
  'Europe/Copenhagen': 'dk',
  'Europe/Stockholm': 'se',
  'Europe/Oslo': 'no',
  'Europe/Helsinki': 'fi',
  'Europe/Warsaw': 'pl',
  'Europe/Prague': 'cz',
  'Europe/Athens': 'gr',
  'Europe/Dublin': 'ie',
  'Europe/Istanbul': 'tr',
  'America/New_York': 'us',
  'America/Chicago': 'us',
  'America/Denver': 'us',
  'America/Los_Angeles': 'us',
  'America/Toronto': 'ca',
  'America/Vancouver': 'ca',
  'America/Mexico_City': 'mx',
  'America/Sao_Paulo': 'br',
  'America/Buenos_Aires': 'ar',
  'Australia/Sydney': 'au',
  'Australia/Melbourne': 'au',
  'Australia/Perth': 'au',
  'Pacific/Auckland': 'nz',
  'Africa/Cairo': 'eg',
  'Africa/Johannesburg': 'za',
};

/** Country-code region bias for a trip's destination zone, or undefined. */
export function countryForZone(zone: string | undefined): string | undefined {
  if (!zone) return undefined;
  return ZONE_COUNTRY[zone];
}
