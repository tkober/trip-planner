import { Injectable, inject } from '@angular/core';
import { MapGeocoder } from '@angular/google-maps';
import { firstValueFrom } from 'rxjs';
import { GeoPoint } from '../../models/trip.model';
import { geoPointFromResult } from './geocode';

/**
 * Thin wrapper over `@angular/google-maps`'s `MapGeocoder` (D5, #49): geocodes
 * a free-text query with an optional country region bias, resolving the
 * first usable result as a `GeoPoint` or `undefined` on no match/error. Kept
 * out of the eagerly-loaded bundle — only ever injected from the "Locate"
 * field and the "Locate places…" review dialog, both themselves lazily
 * loaded (`@defer` / dynamic import), so `@angular/google-maps` never rides
 * along in the main chunk for someone without a Maps key configured.
 */
@Injectable({ providedIn: 'root' })
export class GeocodeService {
  private readonly geocoder = inject(MapGeocoder);

  async geocode(query: string, regionBias?: string): Promise<GeoPoint | undefined> {
    const q = query.trim();
    if (!q) return undefined;
    try {
      const request: google.maps.GeocoderRequest = regionBias
        ? { address: q, region: regionBias }
        : { address: q };
      const { results, status } = await firstValueFrom(
        this.geocoder.geocode(request),
      );
      if (status === google.maps.GeocoderStatus.OK && results.length) {
        return geoPointFromResult(results[0]);
      }
    } catch {
      // Network/API error — caller reports "no match", same as a genuine miss.
    }
    return undefined;
  }
}
