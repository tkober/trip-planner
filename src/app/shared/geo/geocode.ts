import { GeoPoint } from '../../models/trip.model';

/** Converts a Geocoding API result into our stored `GeoPoint` shape. */
export function geoPointFromResult(
  result: google.maps.GeocoderResult,
): GeoPoint {
  const loc = result.geometry.location;
  return {
    lat: loc.lat(),
    lng: loc.lng(),
    placeId: result.place_id || undefined,
    label: result.formatted_address || undefined,
  };
}
